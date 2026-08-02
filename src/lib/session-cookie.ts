import { cookies } from 'next/headers'
import { isProduction } from './utils'

/**
 * JEDNO místo, které popisuje přihlašovací cookie.
 *
 * Dřív si jméno cookie, platnost i pravidlo pro `secure` držel každý modul sám
 * (přihlášení, čtení uživatele, změna hesla) a hodnoty se už začaly rozcházet.
 * Platnost přitom MUSÍ odpovídat `auth.tokenExpiration` v kolekci Users —
 * kdyby cookie přežila token, uživatel by vypadal přihlášeně, ale nic by mu
 * nefungovalo; kdyby vypršela dřív, odhlašovalo by ho to bez důvodu.
 */

/** Cookie, ze které Payload čte token. Bez `cookiePrefix` v configu je to `payload`. */
export const TOKEN_COOKIE = 'payload-token'

/** Platnost přihlášení v sekundách — musí odpovídat `tokenExpiration` v Users. */
export const SESSION_SECONDS = 60 * 60 * 24 * 7

/** Uloží token do cookie prohlížeče (po přihlášení i po změně hesla). */
export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies()
  jar.set(TOKEN_COOKIE, token, {
    httpOnly: true, // skript v prohlížeči se k tokenu nedostane
    secure: isProduction(), // v produkci jen přes HTTPS
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
