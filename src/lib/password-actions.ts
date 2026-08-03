'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getDb } from './db'
import {
  clientIp,
  isBotSubmission,
  isRateLimited,
  rateLimitKey,
  verifyTurnstile,
} from './comment-spam'
import { checkPassword, isEmailShapeValid } from './username'
import { setSessionCookie } from './session-cookie'

/**
 * Zapomenuté heslo: odeslání odkazu a nastavení nového hesla.
 *
 * Klíčová zásada: formulář NIKDY neprozradí, jestli e-mail v databázi je.
 * Odpověď je vždy stejná („když účet existuje, poslali jsme odkaz"), jinak by
 * kdokoli mohl zjišťovat, kdo je na webu registrovaný.
 */

export type ForgotState =
  { status: 'idle' } | { status: 'sent' } | { status: 'error'; message: string }

export async function forgotPasswordAction(
  _prev: ForgotState,
  formData: FormData,
): Promise<ForgotState> {
  const now = Date.now()
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase()
  const honeypot = formData.get('website') as string | null
  const renderedAt = Number(formData.get('renderedAt'))
  const turnstileToken = formData.get('cf-turnstile-response') as string | null

  const h = await headers()
  const ip = clientIp(h)

  if (isBotSubmission(honeypot, renderedAt, now)) return { status: 'sent' }
  // POŘADÍ JE ZÁMĚRNÉ: nejdřív Turnstile, teprve pak počítadlo pokusů.
  //
  // Když IP nejde zjistit, klíčuje se limit podle e-mailu — a ten si zadává
  // odesílatel. Kdyby se počítadlo zvyšovalo dřív, stačilo by pětkrát odeslat
  // formulář s cizí adresou (klidně bez platného tokenu) a oběti by se na
  // deset minut zablokovala obnova hesla. Ověření robota to zastaví dřív, než
  // se koš vůbec načne.
  if (!(await verifyTurnstile(turnstileToken, ip))) {
    return { status: 'error', message: 'Nepodařilo se ověřit, že nejsi robot. Zkus to znovu.' }
  }
  if (isRateLimited(rateLimitKey(ip, email), now)) {
    return { status: 'error', message: 'Moc pokusů za sebou. Zkus to prosím za chvíli.' }
  }
  if (!email || !isEmailShapeValid(email)) {
    return { status: 'error', message: 'Zadej platný e-mail.' }
  }

  try {
    const payload = await getDb()
    await payload.forgotPassword({ collection: 'users', data: { email } })
  } catch (err) {
    // I neexistující e-mail končí stejnou hláškou jako úspěch (viz zásada výše);
    // do logu si ale chybu poznamenáme, ať poznáme výpadek odesílání e-mailů.
    console.error('[heslo] odeslání odkazu selhalo:', err instanceof Error ? err.message : err)
  }

  return { status: 'sent' }
}

export type ResetState = { status: 'idle' } | { status: 'error'; message: string }

export async function resetPasswordAction(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const token = String(formData.get('token') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const passwordAgain = String(formData.get('passwordAgain') ?? '')

  if (!token) {
    return { status: 'error', message: 'Odkaz je neplatný. Požádej o nový.' }
  }
  if (password !== passwordAgain) {
    return { status: 'error', message: 'Hesla se neshodují.' }
  }
  const problem = checkPassword(password)
  if (problem) return { status: 'error', message: problem }

  // Limit i tady, ne jen u žádosti o obnovu: bez něj by šlo tuhle akci
  // bombardovat a zkoušet uhodnout platný token hrubou silou.
  const h = await headers()
  const ip = clientIp(h)
  // Tady e-mail nemáme (chodí jen token), takže klíčem zůstává IP; bez ní se
  // spoléhá na to, že token je jednorázový a krátkodobý.
  if (isRateLimited(ip, Date.now())) {
    return { status: 'error', message: 'Moc pokusů za sebou. Zkus to prosím za chvíli.' }
  }

  try {
    const payload = await getDb()
    const result = await payload.resetPassword({
      collection: 'users',
      data: { token, password },
      overrideAccess: true,
    })

    // Po nastavení hesla uživatele rovnou přihlásíme — nemá smysl ho posílat
    // ještě jednou přes přihlašovací formulář.
    if (result?.token) await setSessionCookie(result.token)
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    console.error('[heslo] nastavení nového hesla selhalo:', message)
    return {
      status: 'error',
      message: 'Odkaz je neplatný nebo už prošel. Požádej prosím o nový.',
    }
  }

  redirect('/')
}
