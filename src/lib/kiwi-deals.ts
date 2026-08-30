/**
 * Čistá logika nad letenkami z Kiwi Tequila Search API — sdílí ji denní sync
 * (src/endpoints/syncAffiliateDeals.ts) a karty na webu; bez závislostí na
 * Payloadu, aby šla testovat (tests/int/kiwi-deals.int.spec.ts).
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

/**
 * Česká letiště s pravidelnými linkami → jméno města pro kartu („Praha ⇄ Řím",
 * „odlet z Brna"). Kiwi vrací jména měst anglicky (Prague), proto se mapuje
 * podle kódu letiště; neznámé letiště padá na anglické jméno z odpovědi.
 */
export const CZECH_AIRPORT_CITIES: Record<string, string> = {
  PRG: 'Praha',
  BRQ: 'Brno',
  OSR: 'Ostrava',
  PED: 'Pardubice',
  KLV: 'Karlovy Vary',
}

export function departureCity(flight: KiwiFlight): string | null {
  const code = flight.flyFrom?.trim().toUpperCase()
  if (code && CZECH_AIRPORT_CITIES[code]) return CZECH_AIRPORT_CITIES[code]
  const city = flight.cityFrom?.trim()
  return city || null
}

/** Let se dá poctivě vykreslit: kladná cena a https odkaz s provizí. */
export function isUsableFlight(
  flight: KiwiFlight,
): flight is KiwiFlight & { price: number; deep_link: string } {
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
export function mapKiwiFlight(
  flight: KiwiFlight & { price: number; deep_link: string },
): Omit<AffiliateDealKiwi, 'usualPrice'> {
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
 * Z hromadné odpovědi (jedna nejlevnější letenka za město) vybere pro každý
 * kód destinace nejlevnější sedící let. Kód bez shody v mapě chybí — sync
 * pro něj pošle samostatný dotaz (Kiwi třeba kód nezná, nebo město vypadlo
 * za `limit`).
 */
export function pickCheapestPerCode(
  flights: KiwiFlight[],
  codes: string[],
): Map<string, Omit<AffiliateDealKiwi, 'usualPrice'>> {
  const usable = flights.filter(isUsableFlight)
  const result = new Map<string, Omit<AffiliateDealKiwi, 'usualPrice'>>()
  for (const code of codes) {
    let best: (KiwiFlight & { price: number; deep_link: string }) | null = null
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

/** Dnešek v pražském čase jako YYYY-MM-DD (klíč záznamu historie). */
export function pragueToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' }).format(now)
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
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
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
 * obvyklá cena není. Slovník karet: „levnější než obvykle", NIKDY „sleva" —
 * nikdo nic nezlevnil, jen je dnes levněji než v posledních týdnech.
 */
export function belowUsualPercent(
  price: number,
  usual: number | null | undefined,
  minPercent = BELOW_USUAL_MIN_PERCENT,
): number | null {
  if (!usual || usual <= 0 || price <= 0) return null
  const percent = Math.round((1 - price / usual) * 100)
  return percent >= minPercent ? percent : null
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
 * jinak včerejší cena; null = první běh, není s čím srovnat.
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
 * ověří samostatným dotazem; bez reference (první běh) se věří dávce.
 */
export function isSuspiciousPrice(
  price: number,
  reference: number | null,
  factor = SUSPICIOUS_PRICE_FACTOR,
): boolean {
  return reference !== null && reference > 0 && price > reference * factor
}
