import { cookies } from 'next/headers'
import { isProduction } from './utils'
import { isHttpsUrl, publicBaseUrlOptional } from './public-url'
import { SESSION_SECONDS, TOKEN_COOKIE } from './session-constants'

/**
 * JEDNO místo, které popisuje přihlašovací cookie.
 *
 * Dřív si jméno cookie, platnost i pravidlo pro `secure` držel každý modul sám
 * (přihlášení, čtení uživatele, změna hesla) a hodnoty se už začaly rozcházet.
 * Platnost přitom MUSÍ odpovídat `auth.tokenExpiration` v kolekci Users —
 * kdyby cookie přežila token, uživatel by vypadal přihlášeně, ale nic by mu
 * nefungovalo; kdyby vypršela dřív, odhlašovalo by ho to bez důvodu.
 */

export { SESSION_SECONDS, TOKEN_COOKIE }

/**
 * Příznak `Secure` (cookie jen přes HTTPS) podle SKUTEČNÉ adresy webu, ne podle
 * NODE_ENV: testovací produkce běží na holém HTTP (IP bez domény) a prohlížeč
 * by tam „Secure" cookie odmítl uložit — přihlášení by po první další stránce
 * zmizelo. Až web pojede na doméně s HTTPS, příznak se zapne sám z adresy.
 */
function isSecureCookieNeeded(): boolean {
  const base = publicBaseUrlOptional()
  if (base) return isHttpsUrl(base)
  return isProduction()
}

/** Uloží token do cookie prohlížeče (po přihlášení i po změně hesla). */
export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies()
  jar.set(TOKEN_COOKIE, token, {
    httpOnly: true, // skript v prohlížeči se k tokenu nedostane
    secure: isSecureCookieNeeded(),
    sameSite: 'lax', // cookie neputuje s požadavky z cizích stránek
    path: '/',
    maxAge: SESSION_SECONDS,
  })
}

/** Odhlášení = zahození cookie. Token je bezstavový, server si nic nepamatuje. */
export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies()
  jar.delete(TOKEN_COOKIE)
}
