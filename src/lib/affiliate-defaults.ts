/**
 * Výchozí obecné partnerské odkazy — SAMOSTATNÝ modul bez závislostí, protože
 * ho importuje jak konfigurace globálu Homepage (defaultValue polí v adminu),
 * tak runtime čtení `getAffiliateTargets` v `src/lib/affiliate.ts`. Import
 * z lib/payload by tu udělal kruhovou závislost (payload.config → globals →
 * lib/payload → payload.config).
 */
export const AFFILIATE_FALLBACKS = {
  /** Klik.cz přes síť CJ (od 14. 8. 2026; dřív ePojištění.cz). */
  insuranceUrl: 'https://www.anrdoezrs.net/click-101533587-15024030',
  /** Invia — přímý partnerský odkaz (účet ověřen živý 14. 8. 2026). */
  toursUrl: 'https://www.invia.cz/?aid=4745582',
  /** Booking.com přes síť CJ (přímý program Booking skončil 6/2025). */
  accommodationUrl: 'https://www.kqzyfj.com/click-101533587-13386171',
  /** DiscoverCars, česká verze (starý partner Rentalcars program ukončil). */
  carRentalUrl: 'https://www.discovercars.com/cz?a_aid=aracz',
} as const

export type AffiliateTargets = { [K in keyof typeof AFFILIATE_FALLBACKS]: string }
