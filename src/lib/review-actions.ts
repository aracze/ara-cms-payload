'use server'

import { headers } from 'next/headers'
import { getDb } from './db'
import { fetchPageReviews } from './payload'
import {
  clientIp,
  isBotSubmission,
  isRateLimited,
  looksLikeSpam,
  verifyTurnstile,
} from './comment-spam'
import { getCurrentUser } from './auth'
import { PageCategory, ReviewPublic } from '@/types/payload'
import type { Page as GeneratedPage } from '@/payload-types'

/**
 * Veřejné vložení recenze turistického cíle (stránka kategorie Turistický cíl).
 *
 * Zápis běží přes Payload Local API s `overrideAccess: true` (kolekce má
 * `create: isAdmin`), takže tady MUSÍME sami vynutit bezpečná pole: pevně
 * `type: 'review'`, `status` řídí jen heuristika, cíl je vždy publikovaný
 * turistický cíl, žádný `parentComment`/`legacyCommentId`. `author` se vyplní
 * jen u přihlášeného a VÝHRADNĚ ze session na serveru, nikdy z formuláře. Ochranu
 * proti spamu řeší comment-spam.ts (sdílené vrstvy s komentáři).
 *
 * Revalidaci cache výpisu (page_reviews_<id>) obstará afterChange hook
 * kolekce comments; klient po úspěchu zavolá router.refresh().
 */

export type ReviewFormState =
  { status: 'idle' } | { status: 'success' } | { status: 'error'; message: string }

/**
 * Líné načtení recenzí cíle pro inline blok ve výpisu „Co vidět…" — volá se
 * z klienta až po rozbalení cíle, ať stránka se všemi cíli zůstane rychlá.
 * Vrací jen veřejná data (ReviewPublic); u draft stránek nic (stejná logika
 * jako anonymní přístupová práva kolekce comments).
 */
/** Veřejná podoba přihlášeného pro inline formulář (jen jméno a avatar). */
export type ReviewAuthorHint = { displayName: string; avatarUrl: string | null } | null

export async function getPageReviews(
  pageId: number,
): Promise<{ reviews: ReviewPublic[]; signedAs: ReviewAuthorHint } | { error: string }> {
  if (!Number.isInteger(pageId) || pageId <= 0) {
    return { error: 'Neplatná stránka.' }
  }

  const payload = await getDb()
  try {
    const page = (await payload.findByID({
      collection: 'pages',
      id: pageId,
      depth: 0,
      overrideAccess: true,
      select: { _status: true },
    })) as Pick<GeneratedPage, '_status'>
    if (page._status === 'draft') {
      return { error: 'Stránka nebyla nalezena.' }
    }
  } catch {
    return { error: 'Stránka nebyla nalezena.' }
  }

  const { reviews } = await fetchPageReviews(pageId)
  // Přihlášeného přibalíme rovnou — inline formulář je klientský a sám by se
  // na server zeptat nemohl; ušetří to další kolo dotazů.
  const user = await getCurrentUser()
  return {
    reviews,
    signedAs: user ? { displayName: user.publicName, avatarUrl: user.avatarUrl } : null,
  }
}

const MAX_NAME_LEN = 80
const MAX_BODY_LEN = 5000

export async function createReview(
  _prev: ReviewFormState,
  formData: FormData,
): Promise<ReviewFormState> {
  const now = Date.now()

  const pageId = Number(formData.get('pageId'))
  const rating = Number(formData.get('rating'))
  const submittedName = String(formData.get('authorName') ?? '').trim()
  const body = String(formData.get('body') ?? '').trim()
  const honeypot = formData.get('website') as string | null
  const renderedAt = Number(formData.get('renderedAt'))
  const turnstileToken = formData.get('cf-turnstile-response') as string | null

  // Klientská IP (za reverzní proxy). Best-effort — slouží jen rate-limitu.
  const h = await headers()
  const ip = clientIp(h)

  // 1) Honeypot / příliš rychlé odeslání → tichý „úspěch" (robot nic nepozná).
  if (isBotSubmission(honeypot, renderedAt, now)) {
    return { status: 'success' }
  }

  // 2) Validace vstupu (uživatelsky srozumitelné hlášky).
  if (!Number.isInteger(pageId) || pageId <= 0) {
    return { status: 'error', message: 'Neplatná stránka.' }
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { status: 'error', message: 'Přidej prosím hodnocení hvězdičkami (1–5).' }
  }
  // Identita přihlášeného se bere VÝHRADNĚ ze session na serveru (viz komentáře).
  const currentUser = await getCurrentUser()
  const authorName = currentUser ? currentUser.publicName : submittedName

  if (!currentUser) {
    if (authorName.length === 0) {
      return { status: 'error', message: 'Vyplň prosím jméno.' }
    }
    if (authorName.length > MAX_NAME_LEN) {
      return { status: 'error', message: 'Jméno je příliš dlouhé.' }
    }
  }
  if (body.length === 0) {
    return { status: 'error', message: 'Napiš prosím text recenze.' }
  }
  if (body.length > MAX_BODY_LEN) {
    return { status: 'error', message: 'Recenze je příliš dlouhá.' }
  }

  // 3) Cloudflare Turnstile (aktivní jen když je nastaven secret; jinak projde).
  const humanVerified = await verifyTurnstile(turnstileToken, ip)
  if (!humanVerified) {
    return {
      status: 'error',
      message: 'Ověření proti robotům se nezdařilo. Zkus to prosím znovu.',
    }
  }

  // 4) Rate-limit na IP (počítáme až po ověření člověka, ať boti nemrhají limitem).
  if (isRateLimited(ip, now)) {
    return {
      status: 'error',
      message: 'Příliš mnoho příspěvků za krátkou dobu. Zkus to prosím za chvíli.',
    }
  }

  const payload = await getDb()

  // 5) Cíl musí být existující PUBLIKOVANÝ turistický cíl (recenze se píší jen
  //    tam — jako na legacy webu). `_status` chybí u migrovaných stránek → bereme
  //    jako publikované (stejně jako access control kolekce comments).
  try {
    // Typ odvozený z generovaného schématu — přejmenování category/_status
    // v CMS by tu spadlo už při kompilaci, ne až za běhu.
    const page = (await payload.findByID({
      collection: 'pages',
      id: pageId,
      depth: 0,
      overrideAccess: true,
      select: { category: true, _status: true },
    })) as Pick<GeneratedPage, 'category' | '_status'>
    if (String(page.category) !== PageCategory.Turisticky_cil || page._status === 'draft') {
      return { status: 'error', message: 'Na této stránce nelze psát recenze.' }
    }
  } catch {
    return { status: 'error', message: 'Stránka nebyla nalezena.' }
  }

  // 6) Heuristika obsahu → publikovat, nebo tiše skrýt jako spam (admin ho vidí).
  const status = looksLikeSpam(body) ? 'spam' : 'published'

  try {
    await payload.create({
      collection: 'comments',
      overrideAccess: true,
      data: {
        type: 'review',
        rating,
        body,
        authorName,
        ...(currentUser ? { author: currentUser.id } : {}),
        relatedTo: { relationTo: 'pages', value: pageId },
        status,
        commentedAt: new Date(now).toISOString(),
      },
    })
  } catch (err) {
    console.error('[review] vytvoření recenze selhalo:', err)
    return { status: 'error', message: 'Recenzi se nepodařilo uložit. Zkus to prosím znovu.' }
  }

  return { status: 'success' }
}
