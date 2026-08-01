'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getDb } from './db'
import { isBotSubmission, isRateLimited, verifyTurnstile } from './comment-spam'
import { checkPassword, isEmailShapeValid } from './username'
import { isProduction } from './utils'

/**
 * Zapomenuté heslo: odeslání odkazu a nastavení nového hesla.
 *
 * Klíčová zásada: formulář NIKDY neprozradí, jestli e-mail v databázi je.
 * Odpověď je vždy stejná („když účet existuje, poslali jsme odkaz"), jinak by
 * kdokoli mohl zjišťovat, kdo je na webu registrovaný.
 */

const TOKEN_COOKIE = 'payload-token'
const SESSION_SECONDS = 60 * 60 * 24 * 7

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
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || ''

  if (isBotSubmission(honeypot, renderedAt, now)) return { status: 'sent' }
  if (isRateLimited(ip, now)) {
    return { status: 'error', message: 'Moc pokusů za sebou. Zkus to prosím za chvíli.' }
  }
  if (!(await verifyTurnstile(turnstileToken, ip))) {
    return { status: 'error', message: 'Nepodařilo se ověřit, že nejsi robot. Zkus to znovu.' }
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

  try {
    const payload = await getDb()
    const result = await payload.resetPassword({
      collection: 'users',
      data: { token, password },
      overrideAccess: true,
    })

    // Po nastavení hesla uživatele rovnou přihlásíme — nemá smysl ho posílat
    // ještě jednou přes přihlašovací formulář.
    if (result?.token) {
      const jar = await cookies()
      jar.set(TOKEN_COOKIE, result.token, {
        httpOnly: true,
        secure: isProduction(),
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_SECONDS,
      })
    }
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
