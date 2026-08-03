/**
 * Ochrana veřejného vkládání komentářů proti spamu — bez otravování návštěvníka.
 *
 * Vrstvy (od nejlevnější po nejsilnější):
 *  1. Honeypot — skryté pole, které vyplní jen robot.
 *  2. Časová prodleva — formulář odeslaný do ~1,5 s od načtení je bot.
 *  3. Rate-limit — max N komentářů z jedné IP za časové okno (in-memory).
 *  4. Heuristika obsahu — příliš mnoho odkazů → uložit jako `spam` (skryté).
 *  5. Cloudflare Turnstile — aktivní jen když je nastaven TURNSTILE_SECRET_KEY.
 *
 * Body 1–3 dropnou requesty „potichu" (robot dostane falešný úspěch a jde dál,
 * DB zůstává čistá). Bod 4 komentář uloží, ale skryje (admin ho vidí). Bod 5,
 * když je zapnutý, tvrdě odmítne požadavek bez platného tokenu.
 */

/**
 * Turnstile je zapnutý JEN když jsou nastavené OBA klíče (site + secret).
 * Půl konfigurace by web rozbila: jen secret → server odmítá vše bez tokenu,
 * který se nemá kde vygenerovat; jen site → widget bez serverové ochrany.
 * Při neúplné konfiguraci jede honeypot (viz `verifyTurnstile`).
 */
export const isTurnstileEnabled = (): boolean =>
  Boolean(process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY)

/** Site key pro klienta (veřejný) — jen když je pár kompletní, jinak null (bez widgetu). */
export const getTurnstileSiteKey = (): string | null =>
  isTurnstileEnabled() ? (process.env.TURNSTILE_SITE_KEY as string) : null

// ————————————————————————————————————————————————————————————————
// Rate-limit (in-memory, best-effort)
// ————————————————————————————————————————————————————————————————
// Jednokontejnerový deploy → stačí Mapa v paměti procesu. Reset při deployi je
// přijatelný (spam se tím nezhorší). Klíč = IP; hodnota = časy posledních vložení.
const RATE_LIMIT_MAX = 5 // max komentářů
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000 // za 10 minut
const rateBucket = new Map<string, number[]>()

/**
 * IP volajícího z hlaviček od proxy. Prázdný řetězec = nezjistitelná.
 *
 * JEDNO místo pro všechny akce (komentáře, recenze, registrace, obnova hesla).
 * Dřív si každá parsovala hlavičky po svém a zápisy se začaly rozcházet —
 * dvě varianty se lišily v pořadí `trim()` a fallbacku.
 */
export function clientIp(h: Headers): string {
  const forwarded = h.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (forwarded) return forwarded
  return h.get('x-real-ip')?.trim() ?? ''
}

/**
 * true = přes limit (odmítnout). Zároveň průběžně čistí staré záznamy.
 *
 * PRÁZDNÝ KLÍČ SE NELIMITUJE. Kdyby se všechny požadavky bez zjistitelné IP
 * sesypaly do jednoho koše, stačil by jeden útočník a zablokoval by registraci
 * i obnovu hesla všem ostatním, kterým IP taky nejde zjistit. Ochranu v takovém
 * případě drží Turnstile a honeypot — a tam, kde je k dispozici e-mail, se
 * klíčuje podle něj (viz `rateLimitKey`).
 */
export function isRateLimited(ip: string, now: number): boolean {
  if (!ip) return false
  const recent = (rateBucket.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
  if (recent.length >= RATE_LIMIT_MAX) {
    rateBucket.set(ip, recent)
    return true
  }
  recent.push(now)
  rateBucket.set(ip, recent)

  // Nenechat Mapu růst donekonečna (jednoduchý úklid při každém zápisu).
  if (rateBucket.size > 5000) {
    for (const [key, times] of rateBucket) {
      const alive = times.filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
      if (alive.length === 0) rateBucket.delete(key)
      else rateBucket.set(key, alive)
    }
  }
  return false
}

// ————————————————————————————————————————————————————————————————
// Honeypot + časová prodleva
// ————————————————————————————————————————————————————————————————
const MIN_FILL_MS = 1500 // rychlejší odeslání = robot

/** true = tichý drop (honeypot vyplněn nebo formulář odeslán podezřele rychle). */
export function isBotSubmission(honeypot: string | null, renderedAt: number, now: number): boolean {
  if (honeypot && honeypot.trim() !== '') return true
  if (Number.isFinite(renderedAt) && renderedAt > 0 && now - renderedAt < MIN_FILL_MS) return true
  return false
}

// ————————————————————————————————————————————————————————————————
// Heuristika obsahu
// ————————————————————————————————————————————————————————————————
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi
const MAX_LINKS = 2

/** true = obsah vypadá jako spam (moc odkazů) → uložit jako `spam` (skryté). */
export function looksLikeSpam(body: string): boolean {
  const links = body.match(URL_RE)
  return (links?.length ?? 0) > MAX_LINKS
}

// ————————————————————————————————————————————————————————————————
// Cloudflare Turnstile
// ————————————————————————————————————————————————————————————————
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/**
 * Ověří Turnstile token na serveru. Když Turnstile není nakonfigurovaný, vrací
 * `true` (ochranu drží honeypot). Síťová chyba → `false` (raději odmítnout).
 */
export async function verifyTurnstile(token: string | null, ip: string): Promise<boolean> {
  // Neúplná/žádná konfigurace → Turnstile vypnutý, nevaliduje se (drží honeypot).
  if (!isTurnstileEnabled()) return true
  if (!token) return false

  try {
    const form = new URLSearchParams()
    form.append('secret', process.env.TURNSTILE_SECRET_KEY as string)
    form.append('response', token)
    if (ip) form.append('remoteip', ip)

    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      body: form,
      // krátký timeout přes AbortSignal, ať odeslání komentáře nevisí na CF
      signal: AbortSignal.timeout(8000),
    })
    const data = (await res.json()) as { success?: boolean }
    return data.success === true
  } catch {
    return false
  }
}

/**
 * Klíč pro limit tam, kde známe cíl operace (e-mail).
 *
 * Když IP nejde zjistit, nemá smysl se limitu vzdát úplně: útok na konkrétní
 * účet (bombardování obnovy hesla) jde omezit i podle e-mailu.
 */
export function rateLimitKey(ip: string, email: string): string {
  if (ip) return ip
  return email ? `email:${email.toLowerCase()}` : ''
}
