'use server'

import { headers } from 'next/headers'
import { getDb } from './db'
import { publicBaseUrl } from './public-url'
import { renderAraEmail } from './email-template'
import {
  clientIp,
  isBotSubmission,
  isRateLimited,
  underCooldown,
  verifyTurnstile,
} from './comment-spam'
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
  // Tady je pořadí obrácené než u obnovy hesla — a je to v pořádku: klíčem je
  // IP odesílatele, takže si přeplněním koše uškodí jen sám sobě. U obnovy
  // hesla se klíčuje e-mailem, který si zadá kdokoliv, proto tam musí být
  // ověření robota dřív.
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
    // kdo je na webu registrovaný. Formulář ukáže stejnou obrazovku jako při
    // úspěchu a majiteli adresy odejde e-mail „účet už máš“ — jemu se to říct
    // smí (je to jeho schránka), jinak by marně čekal na potvrzovací e-mail,
    // který nikdy nedorazí.
    if (/duplicate|unique|already/i.test(message) && /email/i.test(message)) {
      await sendAccountExistsEmail(email)
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

/**
 * E-mail „účet už máš“ při pokusu o registraci s obsazenou adresou.
 *
 * Selhání se jen zaloguje: odpověď formuláře MUSÍ zůstat stejná jako při
 * úspěšné registraci, jinak by se z jeho chování dalo poznat, že adresa
 * v databázi je. Jde přes stejné SMTP jako potvrzovací e-maily a vzhled
 * dodává sdílená šablona (src/lib/email-template.ts).
 */
async function sendAccountExistsEmail(email: string): Promise<void> {
  // Zámek na ADRESU PŘÍJEMCE: opakované pokusy o registraci s toutéž cizí
  // adresou (i z různých IP — limit na IP tohle nechytí) nesmí bombardovat
  // schránku majitele. Jeden e-mail za hodinu informaci předá stejně dobře.
  if (underCooldown(`ucet-uz-mas:${email.trim().toLowerCase()}`, Date.now())) return
  try {
    const payload = await getDb()
    const base = publicBaseUrl()
    await payload.sendEmail({
      to: email,
      subject: 'Účet na Ara.cz už máš',
      html: renderAraEmail({
        title: 'Účet už máš',
        bodyHtml:
          'Ahoj, právě se někdo pokusil zaregistrovat na Ara.cz s touhle adresou — nejspíš ty. Účet s ní ale už existuje, takže se stačí přihlásit. A kdyby si heslo nešlo vybavit, nastav si nové:',
        buttonLabel: 'Nastavit nové heslo',
        buttonUrl: `${base}/zapomenute-heslo`,
        note: 'Pokud ses neregistroval ty, tenhle e-mail klidně smaž — s tvým účtem se nic neděje.',
        reason: 'se s tvou adresou někdo pokusil zaregistrovat.',
      }),
    })
  } catch (err) {
    // Do logu bez adresy příjemce: SMTP chyby (např. EENVELOPE) ji nesou
    // v hlášce i v objektu, a osobní údaj do aplikačního logu nepatří.
    const raw = err instanceof Error ? `${err.name}: ${err.message}` : `ne-Error (${typeof err})`
    console.error(
      '[registrace] e-mail „účet už máš“ se nepodařilo odeslat:',
      raw.split(email.trim()).join('<adresa>'),
    )
  }
}
