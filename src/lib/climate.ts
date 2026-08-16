import type { ClimateNormalMonth } from '@/types/payload'

/**
 * Čtyřstupňová škála vhodnosti návštěvy — jediný zdroj pravdy pro graf na
 * stránkách počasí (climate-section.tsx) i pro pruh sezóny v pravém panelu
 * (season-strip.tsx). Leží v `lib`, aby na komponentě nezávisely knihovny.
 *
 * Škála jsou DVĚ DVOJICE, ne čtyři nezávislé kategorie: zelená = sezóna,
 * šedomodrá = mimo ni, a uvnitř každé dvojice je tmavší odstín ten lepší.
 * Barva tak nese dvě informace najednou (odstín = sezóna, světlost = míra)
 * a světlost přitom plynule stoupá přes celou škálu.
 *
 * Tytéž hodnoty má i ruční sezónní pruh v textu stránky (`.seasonality-month`
 * v globals.css) — ten bere první, druhý a čtvrtý stupeň. Při změně barev je
 * proto nutné upravit i CSS.
 */
export type Suitability = 'ideal' | 'good' | 'mid' | 'poor'

export const SUITABILITY_COLOR: Record<Suitability, string> = {
  ideal: '#1b7a68',
  good: '#5eb49f',
  mid: '#9fb1c4',
  poor: '#c9d3de',
}

/** Inkoust na plných plochách té barvy (pruh) — bílá projde jen na prvním stupni. */
export const SUITABILITY_INK: Record<Suitability, string> = {
  ideal: '#ffffff',
  good: '#0e3a32',
  mid: '#22303f',
  poor: '#4e5a68',
}

export const SUITABILITY_LABEL: Record<Suitability, string> = {
  ideal: 'Ideální',
  good: 'Dobré',
  mid: 'Průměrné',
  poor: 'Nevhodné',
}

/** Legenda: dvě skupiny po dvou stupních, vždy celá — je to pevná stupnice. */
export const LEGEND_GROUPS: { title: string; levels: Suitability[] }[] = [
  { title: 'Sezóna', levels: ['ideal', 'good'] },
  { title: 'Mimo sezónu', levels: ['mid', 'poor'] },
]

/**
 * Vhodnost návštěvy z denní teploty a srážek — jednoduchá heuristika.
 *
 * Komfortní pásmo je schválně široké až do 34 °C: tropická hlavní sezóna má
 * běžně 33–34 °C (Bangkok v lednu) a dřívější strop na 33 °C ji srážel mezi
 * nedoporučené měsíce. Nad pásmem se klesá po stupních, ne skokem.
 *
 * Hlavní srážeč jsou SRÁŽKY, ne teplota — o tom, že se někam nejezdí,
 * rozhoduje monzun. Bangkok v září a v prosinci se liší o jediný stupeň
 * teploty, ale o 330 mm deště.
 */
export function suitability(m: ClimateNormalMonth): Suitability {
  const t = m.tmax ?? 0
  let level = t > 38 ? 1 : t > 34 ? 2 : t >= 21 ? 3 : t >= 17 ? 2 : t >= 12 ? 1 : 0
  if (m.prcp !== null) {
    if (m.prcp >= 250)
      level = Math.max(0, level - 3) // monzun srazí až na dno
    else if (m.prcp >= 150) level = Math.max(0, level - 2)
    else if (m.prcp >= 100) level = Math.max(0, level - 1)
  }
  return (['poor', 'mid', 'good', 'ideal'] as const)[level]
}
