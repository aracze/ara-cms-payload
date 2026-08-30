/**
 * Čistá logika nad letenkami z Kiwi Tequila Search API — sdílí ji denní sync
 * (src/endpoints/syncAffiliateDeals.ts), admin validace a karty na webu; bez
 * závislostí na Payloadu, aby šla testovat (tests/int/kiwi-deals.int.spec.ts).
 *
 * Od 30. 8. 2026 se letenky hledají JEDNÍM dotazem pro všechny destinace
 * najednou („z celé ČR do seznamu cílů, jedna nejlevnější za město",
 * parametr `one_for_city`) místo dotazu na každou destinaci zvlášť: Kiwi
 * hlídá poměr rezervací k dotazům (1 : 5000) a 36 dotazů denně by ho bez
 * jediné rezervace za rok přeteklo víc než dvakrát. Odlet je z kteréhokoli
 * českého letiště (rozhodnutí uživatele 30. 8. 2026, stejně jako u zájezdů).
 */

import type { AffiliateDealKiwi, KiwiPricePoint } from '@/types/payload'

/** Let z odpovědi Search API — jen pole, která se tu čtou. */
export interface KiwiFlight {
  price?: number
  deep_link?: string
  local_departure?: string
  nightsInDest?: number | null
  /** IATA kód odletového letiště (PRG, BRQ…). */
  flyFrom?: string
  cityFrom?: string
  /** IATA kód cílového letiště a města (LHR / LON). */
  flyTo?: string
  cityCodeTo?: string
  countryTo?: { code?: string } | null
}

/** Let s cenou a https odkazem — jediný, který se dá poctivě vykreslit. */
export type UsableKiwiFlight = KiwiFlight & { price: number; deep_link: string }

/** Letenka bez obvyklé ceny — tu doplní historie až v syncu. */
export type KiwiFlightDeal = Omit<AffiliateDealKiwi, 'usualPrice'>

// ————————————————————————————————————————————————————————————————
// Česká letiště
// ————————————————————————————————————————————————————————————————

/**
 * Česká letiště s pravidelnými linkami — JEDINÁ tabulka pro všechny tři
 * potřeby: překlad kódu z Kiwi na město (Kiwi vrací jména anglicky, „Prague"),
 * filtr odletů v Invia feedu (ten píše česká jména) a 2. pád pro popisek
 * dlaždice („odlet z Brna"). Dřív žily tři kopie ve třech souborech a musely
 * se shodovat písmeno po písmenu.
 */
export const CZECH_AIRPORTS = [
  { iata: 'PRG', name: 'Praha', from: 'z Prahy' },
  { iata: 'BRQ', name: 'Brno', from: 'z Brna' },
  { iata: 'OSR', name: 'Ostrava', from: 'z Ostravy' },
  { iata: 'PED', name: 'Pardubice', from: 'z Pardubic' },
  { iata: 'KLV', name: 'Karlovy Vary', from: 'z Karlových Varů' },
] as const

/** Jména českých letišť tak, jak je píše Invia feed. */
export const CZECH_AIRPORT_NAMES: readonly string[] = CZECH_AIRPORTS.map((a) => a.name)

/** Odletové město letu; neznámé letiště padá na (anglické) jméno z odpovědi. */
export function departureCity(flight: KiwiFlight): string | null {
  const code = flight.flyFrom?.trim().toUpperCase()
  const known = CZECH_AIRPORTS.find((a) => a.iata === code)
  if (known) return known.name
  const city = flight.cityFrom?.trim()
  return city || null
}

/** „z Brna" — 2. pád pro popisek dlaždice; neznámé jméno jen s předložkou. */
export function departureFromLabel(name: string): string {
  return CZECH_AIRPORTS.find((a) => a.name === name)?.from ?? `z ${name}`
}

// ————————————————————————————————————————————————————————————————
// Kódy destinací a párování letů
// ————————————————————————————————————————————————————————————————

/**
 * Pole „Kiwi Fly To" smí být jen IATA kód: 2 písmena země (HR) nebo 3 písmena
 * města/letiště (LON, LHR). Jiné tvary, které Tequila také bere (`country:IT`,
 * slugy), by hromadný dotaz buď rozbily celý, nebo by se nikdy nespárovaly
 * s odpovědí (viz flightMatchesCode) — hlídá to validace v adminu i sync.
 */
export function isValidKiwiCode(code: string): boolean {
  return /^[A-Za-z]{2,3}$/.test(code.trim())
}

export function isUsableFlight(flight: KiwiFlight): flight is UsableKiwiFlight {
  return (
    typeof flight.price === 'number' &&
    flight.price > 0 &&
    typeof flight.deep_link === 'string' &&
    flight.deep_link.startsWith('https://')
  )
}

/**
 * Sedí let na kód z pole „Kiwi Fly To"? Dvoupísmenný kód je země (HR, IT) →
 * porovnává se země cíle; třípísmenný je město nebo letiště (LON, BCN, LHR) →
 * stačí shoda s kódem města NEBO letiště, protože redaktor mohl zadat kterýkoli.
 */
export function flightMatchesCode(flight: KiwiFlight, code: string): boolean {
  const wanted = code.trim().toUpperCase()
  if (!wanted) return false
  if (wanted.length === 2) return flight.countryTo?.code?.toUpperCase() === wanted
  return flight.cityCodeTo?.toUpperCase() === wanted || flight.flyTo?.toUpperCase() === wanted
}

/** Let z odpovědi → tvar nabídky na kartě (bez obvyklé ceny, tu doplní historie). */
export function mapKiwiFlight(flight: UsableKiwiFlight): KiwiFlightDeal {
  return {
    price: Math.round(flight.price),
    deepLink: flight.deep_link,
    departureDate: (flight.local_departure ?? '').slice(0, 10),
    // Celé noci: zlomek by se vykreslil jako „3.5 nocí".
    nights:
      Number.isInteger(flight.nightsInDest) && (flight.nightsInDest as number) > 0
        ? (flight.nightsInDest as number)
        : null,
    departure: departureCity(flight),
  }
}

/**
 * Z odpovědi vybere pro každý kód destinace nejlevnější sedící let. Kód bez
 * shody v mapě chybí — sync pro něj pošle samostatný dotaz (Kiwi třeba kód
 * nezná, nebo město vypadlo za `limit`). Slouží hromadné i samostatné odpovědi.
 */
export function pickCheapestPerCode(
  flights: KiwiFlight[],
  codes: string[],
): Map<string, KiwiFlightDeal> {
  const usable = flights.filter(isUsableFlight)
  const result = new Map<string, KiwiFlightDeal>()
  for (const code of codes) {
    let best: UsableKiwiFlight | null = null
    for (const flight of usable) {
      if (!flightMatchesCode(flight, code)) continue
      if (!best || flight.price < best.price) best = flight
    }
    if (best) result.set(code, mapKiwiFlight(best))
  }
  return result
}

// ————————————————————————————————————————————————————————————————
// Historie cen → „levnější než obvykle"
// ————————————————————————————————————————————————————————————————

/** Jak dlouho se denní ceny drží (dny). Delší okno by v lednu srovnávalo s letní špičkou. */
export const PRICE_HISTORY_DAYS = 90
/** Od kolika dní historie se obvyklá cena vůbec počítá — dřív by to byl šum pár dnů. */
export const PRICE_HISTORY_MIN_DAYS = 14
/** Štítek se kreslí až od tohoto rozdílu v procentech; Kiwi ceny mezi dny kolísají o ±10 %. */
export const BELOW_USUAL_MIN_PERCENT = 15

/** Dnešek v pražském čase jako YYYY-MM-DD (klíč záznamu historie i začátek hledání). */
export function pragueToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' }).format(now)
}

/** Platné kalendářní datum ve tvaru YYYY-MM-DD („2026-02-31" regexem projde, Date ho posune). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/** ISO datum posunuté o `days` dní (záporné = do minulosti); pracuje jen s YYYY-MM-DD. */
function shiftIsoDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Vyčistí historii z JSON (ruční zásah v DB, starší tvar) — jen platné body. */
export function sanitizePriceHistory(raw: unknown): KiwiPricePoint[] {
  if (!Array.isArray(raw)) return []
  const out: KiwiPricePoint[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const { date, price } = item as { date?: unknown; price?: unknown }
    if (!isIsoDate(date)) continue
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) continue
    out.push({ date, price })
  }
  return out
}

/**
 * Přidá dnešní cenu do historie: stejný den se přepíše (opakovaný ruční běh
 * syncu nesmí den započítat dvakrát), body starší než okno vypadnou, výsledek
 * je seřazený podle data.
 */
export function appendPricePoint(
  history: KiwiPricePoint[],
  point: KiwiPricePoint,
  windowDays = PRICE_HISTORY_DAYS,
): KiwiPricePoint[] {
  const oldest = shiftIsoDate(point.date, -(windowDays - 1))
  return [...history.filter((p) => p.date !== point.date && p.date >= oldest), point].sort(
    (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0),
  )
}

/**
 * Obvyklá cena = MEDIÁN denních nejlevnějších cen (ne průměr: jeden výkyv
 * Kiwi vzorkování by průměr rozhodil). null = zatím málo dní historie.
 */
export function usualPrice(
  history: KiwiPricePoint[],
  minDays = PRICE_HISTORY_MIN_DAYS,
): number | null {
  if (history.length < minDays) return null
  const prices = history.map((p) => p.price).sort((a, b) => a - b)
  const mid = Math.floor(prices.length / 2)
  const median = prices.length % 2 === 1 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2
  return Math.round(median)
}

/**
 * O kolik procent je dnešní cena pod obvyklou; null = rozdíl pod prahem nebo
 * obvyklá cena není. Práh se porovnává PŘED zaokrouhlením (14,5 % není 15 %).
 * Slovník karet: „levnější než obvykle", NIKDY „sleva" — nikdo nic nezlevnil,
 * jen je dnes levněji než v posledních týdnech.
 */
export function belowUsualPercent(
  price: number,
  usual: number | null | undefined,
  minPercent = BELOW_USUAL_MIN_PERCENT,
): number | null {
  if (!usual || price <= 0) return null
  const percent = (1 - price / usual) * 100
  return percent >= minPercent ? Math.round(percent) : null
}

// ————————————————————————————————————————————————————————————————
// Pojistka proti výkyvům hromadného hledání
// ————————————————————————————————————————————————————————————————

/** Od kolika dní historie se referenční cena bere z mediánu; dřív rozhoduje včerejšek. */
export const REFERENCE_MIN_DAYS = 7
/** Cena nad tímto násobkem reference je podezřelá — Kiwi ceny běžně kolísají ±10–20 %, 3× ne. */
export const SUSPICIOUS_PRICE_FACTOR = 1.6

/**
 * Referenční cena pro kontrolu hromadného výsledku: medián historie (od 7 dní),
 * jinak včerejší cena; null = první běh pro destinaci, není s čím srovnat
 * (sync pak cenu ověří samostatným dotazem, ať historie nezačne na výkyvu).
 */
export function referencePrice(
  history: KiwiPricePoint[],
  previousPrice: number | null | undefined,
): number | null {
  const median = usualPrice(history, REFERENCE_MIN_DAYS)
  if (median) return median
  return typeof previousPrice === 'number' && previousPrice > 0 ? previousPrice : null
}

/**
 * Hromadné hledání občas vrátí za zemi jen dražší město (Kiwi prohledá vzorek
 * kombinací — Itálie „Florencie 3 046" místo „Řím 1 042"). Takovou cenu sync
 * ověří samostatným dotazem. Bez reference vrací false — první běh řeší sync
 * zvlášť (ověřuje vždy).
 */
export function isSuspiciousPrice(
  price: number,
  reference: number | null,
  factor = SUSPICIOUS_PRICE_FACTOR,
): boolean {
  return reference !== null && price > reference * factor
}
