'use server'

import { headers } from 'next/headers'
import { getDb } from './db'
import {
  clientIp,
  isBotSubmission,
  isRateLimited,
  looksLikeSpam,
  verifyTurnstile,
} from './comment-spam'
import { getCurrentUser } from './auth'

/**
 * Veřejné vložení komentáře k článku.
 *
 * Zápis běží přes Payload Local API s `overrideAccess: true` (kolekce má
 * `create: isAdmin`), takže tady MUSÍME sami vynutit bezpečná pole: pevně
 * `type: 'comment'`, `status` řídí jen heuristika, cíl je vždy článek, žádný
 * `rating`/`legacyCommentId`. Ochranu proti spamu řeší comment-spam.ts.
 * `author` se vyplní JEN u přihlášeného a VÝHRADNĚ ze session na serveru
 * (nikdy z formuláře) — jinak by šlo podepsat komentář cizím účtem.
 *
 * Revalidaci cache výpisu (article_comments_<id>) obstará afterChange hook
 * kolekce comments; klient po úspěchu zavolá router.refresh().
 */

export type CommentFormState =
  { status: 'idle' } | { status: 'success' } | { status: 'error'; message: string }

const MAX_NAME_LEN = 80
const MAX_BODY_LEN = 5000

export async function createComment(
  _prev: CommentFormState,
  formData: FormData,
): Promise<CommentFormState> {
  const now = Date.now()

  const articleId = Number(formData.get('articleId'))
  const submittedName = String(formData.get('authorName') ?? '').trim()
  const body = String(formData.get('body') ?? '').trim()
  const honeypot = formData.get('website') as string | null
  const renderedAt = Number(formData.get('renderedAt'))
  const turnstileToken = formData.get('cf-turnstile-response') as string | null
  const parentIdRaw = formData.get('parentId')
  const parentId = parentIdRaw ? Number(parentIdRaw) : null

  // Klientská IP (za reverzní proxy). Best-effort — slouží jen rate-limitu.
  const h = await headers()
  const ip = clientIp(h)

  // 1) Honeypot / příliš rychlé odeslání → tichý „úspěch" (robot nic nepozná).
  if (isBotSubmission(honeypot, renderedAt, now)) {
    return { status: 'success' }
  }

  // 2) Validace vstupu (uživatelsky srozumitelné hlášky).
  if (!Number.isInteger(articleId) || articleId <= 0) {
    return { status: 'error', message: 'Neplatný článek.' }
  }
  // PŘIHLÁŠENÝ AUTOR: identita se bere VÝHRADNĚ ze session na serveru, nikdy
  // z formuláře — jinak by šlo podepsat komentář cizím jménem nebo účtem.
  // U nepřihlášeného zůstává ručně zadané jméno (anonymní komentář).
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
    return { status: 'error', message: 'Napiš prosím text komentáře.' }
  }
  if (body.length > MAX_BODY_LEN) {
    return { status: 'error', message: 'Komentář je příliš dlouhý.' }
  }

  // 3) Cloudflare Turnstile — jen pro NEPŘIHLÁŠENÉ. Přihlášený už prokázal,
  //    že není robot, při registraci (Turnstile + potvrzený e-mail) a jeho
  //    identitu nese session; captcha by ho jen zdržovala. Honeypot výš
  //    a rate-limit níž platí dál i pro něj.
  const humanVerified = currentUser ? true : await verifyTurnstile(turnstileToken, ip)
  if (!humanVerified) {
    return {
      status: 'error',
      message: 'Ověření proti robotům se nezdařilo. Zkus to prosím znovu.',
    }
  }

  // 4) Rate-limit: anonym podle IP, přihlášený podle ÚČTU — captcha se u něj
  //    přeskakuje, takže limit nesmí jít obejít střídáním IP adres.
  //    (Počítáme až po ověření člověka, ať boti nemrhají limitem.)
  if (isRateLimited(currentUser ? `user:${currentUser.id}` : ip, now)) {
    return {
      status: 'error',
      message: 'Příliš mnoho komentářů za krátkou dobu. Zkus to prosím za chvíli.',
    }
  }

  const payload = await getDb()

  // 5) Cíl musí být existující článek.
  try {
    await payload.findByID({
      collection: 'articles',
      id: articleId,
      depth: 0,
      overrideAccess: true,
      select: { title: true },
    })
  } catch {
    return { status: 'error', message: 'Článek nebyl nalezen.' }
  }

  // 6) Odpověď: rodičovský komentář musí patřit ke STEJNÉMU článku (jinak vazbu
  //    zahodíme a uložíme jako kořenový komentář — ať uživatel o text nepřijde).
  let parentComment: number | undefined
  if (parentId && Number.isInteger(parentId) && parentId > 0) {
    try {
      const parent = await payload.findByID({
        collection: 'comments',
        id: parentId,
        depth: 0,
        overrideAccess: true,
        select: { relatedTo: true, type: true },
      })
      const p = parent as {
        type?: string
        relatedTo?: { relationTo?: string; value?: number | { id: number } }
      }
      const rel = p.relatedTo
      const relValue =
        rel && typeof rel.value === 'object' && rel.value
          ? Number(rel.value.id)
          : (rel?.value ?? null)
      // Rodič musí být komentář (ne recenze) a mířit na TENTÝŽ článek.
      if (p.type === 'comment' && rel?.relationTo === 'articles' && relValue === articleId) {
        parentComment = parentId
      }
    } catch {
      /* rodič neexistuje → kořenový komentář */
    }
  }

  // 7) Heuristika obsahu → publikovat, nebo tiše skrýt jako spam (admin ho vidí).
  const status = looksLikeSpam(body) ? 'spam' : 'published'

  try {
    await payload.create({
      collection: 'comments',
      overrideAccess: true,
      data: {
        type: 'comment',
        body,
        authorName,
        // Vazba na účet jen u přihlášeného; díky ní se u komentáře zobrazí
        // avatar a odkaz na profil (virtuální pole `authorPublic`).
        ...(currentUser ? { author: currentUser.id } : {}),
        relatedTo: { relationTo: 'articles', value: articleId },
        parentComment,
        status,
        // Datum vložení = systémové createdAt (Payload nastaví při insertu).
      },
    })
  } catch (err) {
    console.error('[comment] vytvoření komentáře selhalo:', err)
    return { status: 'error', message: 'Komentář se nepodařilo uložit. Zkus to prosím znovu.' }
  }

  return { status: 'success' }
}
