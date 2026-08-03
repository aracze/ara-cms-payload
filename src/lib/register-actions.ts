'use server'

import { headers } from 'next/headers'
import { getDb } from './db'
import { clientIp, isBotSubmission, isRateLimited, verifyTurnstile } from './comment-spam'
import {
  checkPassword,
  checkUsernameShape,
  isEmailShapeValid,
  normalizeUsername,
  usernameProblemMessage,
} from './username'

/**
 * Registrace nového uživatele z veřejného webu.
 *
 * Bezpečnostní zásady (kolekce Users má `create: isAdmin`, takže zápis běží
 * s `overrideAccess: true` a všechno si musíme vynutit sami):
 *  - `roles` se NIKDY nebere z formuláře, vždy pevně `['user']`,
 *  - z formuláře se použijí jen e-mail, heslo a uživatelské jméno; nic jiného,
 *  - účet vzniká NEOVĚŘENÝ a Payload sám pošle potvrzovací e-mail
 *    (viz `auth.verify` v kolekci) — bez potvrzení se nedá přihlásit,
 *  - stejné ochrany proti robotům jako u komentářů (honeypot, rate limit,
 *    Turnstile),
 *  - odpověď nikdy neprozradí, jestli e-mail už v databázi je (jinak by
 *    registrační formulář posloužil ke zjišťování, kdo je registrovaný).
 */

export type RegisterState =
  | { status: 'idle' }
  | { status: 'success'; email: string }
  | { status: 'error'; message: string; field?: 'email' | 'password' | 'username' }

const MAX_EMAIL_LEN = 200

export async function registerAction(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const now = Date.now()

  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase()
  const password = String(formData.get('password') ?? '')
  const usernameRaw = String(formData.get('username') ?? '')
  const username = normalizeUsername(usernameRaw)
  const honeypot = formData.get('website') as string | null
  const renderedAt = Number(formData.get('renderedAt'))
  const turnstileToken = formData.get('cf-turnstile-response') as string | null

  // Klientská IP (za reverzní proxy) — jen pro rate limit, best-effort.
  const h = await headers()
  const ip = clientIp(h)

  // ── ochrana proti robotům ────────────────────────────────────────────────
  if (isBotSubmission(honeypot, renderedAt, now)) {
    // Robotovi odpovíme jako při úspěchu, ať nemá zpětnou vazbu k ladění.
    return { status: 'success', email }
  }
  if (isRateLimited(ip, now)) {
    return { status: 'error', message: 'Moc pokusů za sebou. Zkus to prosím za chvíli.' }
  }
  if (!(await verifyTurnstile(turnstileToken, ip))) {
    return { status: 'error', message: 'Nepodařilo se ověřit, že nejsi robot. Zkus to znovu.' }
  }

  // ── kontrola údajů ───────────────────────────────────────────────────────
  if (!email || email.length > MAX_EMAIL_LEN || !isEmailShapeValid(email)) {
    return { status: 'error', message: 'Zadej platný e-mail.', field: 'email' }
  }
  const shapeProblem = checkUsernameShape(usernameRaw)
  if (shapeProblem) {
    return { status: 'error', message: usernameProblemMessage(shapeProblem), field: 'username' }
  }
  const passwordProblem = checkPassword(password)
  if (passwordProblem) {
    return { status: 'error', message: passwordProblem, field: 'password' }
  }

  try {
    const payload = await getDb()

    // Obsazenost uživatelského jména BEZ OHLEDU na velikost písmen. Payload nemá operátor
    // „rovná se bez ohledu na velikost", proto hrubý předvýběr přes `like`
    // (v Postgresu ILIKE, tedy case-insensitive) a přesné srovnání až v JS —
    // `like` je totiž podřetězcové, samo by hlásilo obsazeno i pro „jan" v „jankonas".
    const similar = (await payload.find({
      collection: 'users',
      where: { username: { like: username } },
      limit: 50,
      depth: 0,
      overrideAccess: true,
      select: { username: true },
    })) as unknown as { docs: { username?: string | null }[] }

    const taken = (similar.docs ?? []).some(
      (u) => typeof u.username === 'string' && u.username.toLowerCase() === username,
    )
    if (taken) {
      return {
        status: 'error',
        message: 'Tohle uživatelské jméno už někdo má. Vyber si prosím jiné.',
        field: 'username',
      }
    }

    await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: {
        email,
        password,
        username,
        // PEVNĚ daná role — nikdy z formuláře, jinak by si šlo naklikat admina.
        roles: ['user'],
      },
      // Payload sám odešle potvrzovací e-mail (auth.verify v kolekci Users).
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : ''

    // Obsazený e-mail ZÁMĚRNĚ nehlásíme — jinak by šlo formulářem zjišťovat,
    // kdo je na webu registrovaný. Uživatel uvidí stejnou obrazovku jako při
    // úspěchu; kdo účet má, dostane e-mail „účet už existuje" (řeší se odděleně
    // v kroku se zapomenutým heslem).
    if (/duplicate|unique|already/i.test(message) && /email/i.test(message)) {
      return { status: 'success', email }
    }
    // Souběžná registrace stejné uživatelského jména (unique index v databázi).
    if (/duplicate|unique/i.test(message) && /username/i.test(message)) {
      return {
        status: 'error',
        message: 'Tohle uživatelské jméno už někdo má. Vyber si prosím jiné.',
        field: 'username',
      }
    }
    console.error('[registrace] vytvoření účtu selhalo:', message)
    return { status: 'error', message: 'Registrace se nepodařila. Zkus to prosím znovu.' }
  }

  return { status: 'success', email }
}
