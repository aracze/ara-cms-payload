/**
 * Parametry přihlašovacího sezení — čistá data bez závislostí.
 *
 * Proč samostatný soubor a ne přímo `session-cookie.ts`: hodnoty potřebuje
 * i kolekce Users (`auth.tokenExpiration`), a ta se načítá i mimo požadavek
 * prohlížeče (skripty, generování typů). `session-cookie.ts` sahá na
 * `next/headers`, což do konfigurace Payloadu netahat.
 */

/** Cookie, ze které Payload čte token. Bez `cookiePrefix` v configu je to `payload`. */
export const TOKEN_COOKIE = 'payload-token'

/**
 * Platnost přihlášení v sekundách.
 *
 * TOTÉŽ číslo řídí `auth.tokenExpiration` v kolekci Users — obojí musí sedět.
 * Kdyby cookie přežila token, uživatel by vypadal přihlášeně, ale nic by mu
 * nefungovalo; kdyby vypršela dřív, odhlašovalo by ho to bez důvodu.
 */
export const SESSION_SECONDS = 60 * 60 * 24 * 7
