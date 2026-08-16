import React from 'react'
import type { ClimateNormalMonth, ClimateNormals } from '@/types/payload'

/**
 * Sekce „Kdy je v … nejlíp" na stránkách kategorie „Počasí" — barevné měsíční
 * sloupce podle vhodnosti návštěvy (design z maket, kolo 3). Data plní měsíční
 * sync /api/sync-climate-normals z Meteostatu (viz syncClimateNormals.ts).
 *
 * Srážky jsou u čísla pod měsícem ještě jako tenký proužek s vlastním měřítkem
 * (nejdeštivější měsíc = plný proužek), aby se daly porovnat okem, ale
 * nesoupeřily s barvou vhodnosti.
 *
 * Server komponenta bez klientského JS; tooltipy řeší CSS hover (Tailwind
 * `group`), pro čtečky je pod grafem plnohodnotná tabulka.
 *
 * Barvy jsou ordinální škála ve dvou dvojicích (viz SUITABILITY_COLOR), ne
 * kategorická série. Identita nikdy nestojí jen na barvě — nese ji emoji,
 * čísla, legenda, popisek v bublině i tabulka pro čtečky. Graf vědomě NEŘÍKÁ,
 * proč je měsíc slabý: dřívější popisky Chladno/Deštivo/Vedro hádaly příčinu
 * a u tropů hádaly špatně (kombinace horko + monzun se hlásila jako „Vedro“,
 * i když srážel déšť). Příčinu si čtenář přečte z čísel pod sloupcem.
 */

/** Type-guard surového JSON pole `climateNormals` — tvar viz ClimateNormals. */
export function parseClimateNormals(value: unknown): ClimateNormals | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as { months?: unknown; period?: unknown; updatedAt?: unknown }
  if (!Array.isArray(raw.months) || raw.months.length !== 12) return null

  const numberOrNull = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null

  const months: ClimateNormalMonth[] = []
  for (const item of raw.months) {
    if (!item || typeof item !== 'object') return null
    const row = item as { month?: unknown; tmin?: unknown; tmax?: unknown; prcp?: unknown }
    const month = typeof row.month === 'number' ? row.month : NaN
    if (!Number.isInteger(month) || month < 1 || month > 12) return null
    months.push({
      month,
      tmin: numberOrNull(row.tmin),
      tmax: numberOrNull(row.tmax),
      prcp: numberOrNull(row.prcp),
    })
  }
  months.sort((a, b) => a.month - b.month)
  // Každý měsíc PRÁVĚ JEDNOU — samotná délka 12 by propustila i data, kde je
  // březen dvakrát a květen chybí; graf by pak tiše kreslil špatné pořadí.
  if (months.some((m, i) => m.month !== i + 1)) return null
  // Graf potřebuje kompletní teploty (sync to garantuje, guard jistí).
  if (months.some((m) => m.tmin === null || m.tmax === null)) return null

  const period = raw.period as { start?: unknown; end?: unknown } | null | undefined
  const validPeriod =
    period && typeof period.start === 'number' && typeof period.end === 'number'
      ? { start: period.start, end: period.end }
      : null

  return { months, period: validPeriod }
}

const MONTH_SHORT = [
  'led',
  'úno',
  'bře',
  'dub',
  'kvě',
  'čvn',
  'čvc',
  'srp',
  'zář',
  'říj',
  'lis',
  'pro',
]
const MONTH_FULL = [
  'Leden',
  'Únor',
  'Březen',
  'Duben',
  'Květen',
  'Červen',
  'Červenec',
  'Srpen',
  'Září',
  'Říjen',
  'Listopad',
  'Prosinec',
]

type Suitability = 'ideal' | 'good' | 'mid' | 'poor'

/**
 * Škála jsou DVĚ DVOJICE, ne čtyři nezávislé kategorie: zelená = sezóna,
 * šedomodrá = mimo ni, a uvnitř každé dvojice je tmavší odstín ten lepší.
 * Barva tak nese dvě informace najednou (odstín = sezóna, světlost = míra)
 * a světlost přitom plynule stoupá přes celou škálu.
 *
 * Stejné hodnoty používá i sezónní pruh v textu stránky (`.seasonality-month`
 * v globals.css) — pruh bere první, druhý a čtvrtý stupeň. Při změně barev
 * je proto nutné upravit obě místa.
 */
const SUITABILITY_COLOR: Record<Suitability, string> = {
  ideal: '#1b7a68',
  good: '#5eb49f',
  mid: '#9fb1c4',
  poor: '#c9d3de',
}

const SUITABILITY_LABEL: Record<Suitability, string> = {
  ideal: 'Ideální',
  good: 'Dobré',
  mid: 'Průměrné',
  poor: 'Nevhodné',
}

/** Legenda: dvě skupiny po dvou stupních, vždy celá — je to pevná stupnice. */
const LEGEND_GROUPS: { title: string; levels: Suitability[] }[] = [
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
function suitability(m: ClimateNormalMonth): Suitability {
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

/** Orientační ikona měsíce z teploty a srážek (deterministická, bez dat navíc). */
function monthEmoji(m: ClimateNormalMonth): string {
  const t = m.tmax ?? 0
  const rain = m.prcp ?? 0
  if (rain >= 55) return '🌧️'
  if (rain >= 45 && t < 15) return '🌦️'
  if (t >= 25) return '☀️'
  if (t >= 20) return rain >= 45 ? '🌤️' : '☀️'
  if (t >= 10) return '⛅'
  return '🌥️'
}

/**
 * Nadpis sekce z druhého pádu s předložkou („do Londýna" → „Nejlepší doba na
 * cestu do Londýna"). Druhé hledané spojení („počasí … po měsících") nese
 * řádek pod nadpisem, takže stránka má obě fráze a žádná se neopakuje.
 * Exportované, protože stejný text potřebuje i položka v postranním obsahu
 * stránky (page.tsx).
 */
export function climateHeading(genitive: string): string {
  return `Nejlepší doba na cestu ${genitive}`
}

/** Graf 12 měsíčních sloupců (výška = denní teplota, barva = vhodnost). */
function PillChart({ months }: { months: ClimateNormalMonth[] }) {
  const maxT = Math.max(...months.map((m) => m.tmax ?? 0), 1)
  const maxR = Math.max(...months.map((m) => m.prcp ?? 0), 1)

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[560px] grid-cols-12 gap-1.5">
        {months.map((m, i) => {
          const level = suitability(m)
          const label = SUITABILITY_LABEL[level]
          // Bublina: u krajních sloupců zarovnaná k okraji, ať neuteče z grafu.
          const tipPosition = i <= 1 ? 'left-0' : i >= 10 ? 'right-0' : 'left-1/2 -translate-x-1/2'
          return (
            <div key={m.month} className="group relative text-center">
              <div aria-hidden="true" className="text-[19px] leading-7">
                {monthEmoji(m)}
              </div>
              <div className="mb-1 font-heading text-[13px] font-semibold text-[#1f2937]">
                {Math.round(m.tmax ?? 0)}°
              </div>
              <div className="relative flex h-[176px] items-end justify-center rounded-full bg-[#f1f4f7] p-1">
                <div
                  className="w-full max-w-[26px] rounded-full"
                  style={{
                    height: `${Math.max(Math.round(((m.tmax ?? 0) / maxT) * 100), 12)}%`,
                    backgroundColor: SUITABILITY_COLOR[level],
                  }}
                />
                {/* Bublina s hodnotami měsíce — jen CSS hover, bez JS */}
                <div
                  className={`pointer-events-none absolute top-0 z-10 hidden w-max rounded-lg border border-[#d8dde3] bg-white px-3 py-2 text-left shadow-sm group-hover:block ${tipPosition}`}
                >
                  <div className="text-[12px] font-semibold text-[#16324f]">
                    {MONTH_FULL[i]} · {label}
                  </div>
                  <div className="text-[11.5px] leading-snug text-[#4a4a4a]">
                    den {Math.round(m.tmax ?? 0)} °C · noc {Math.round(m.tmin ?? 0)} °C
                    <br />
                    srážky {m.prcp === null ? '—' : `${Math.round(m.prcp)} mm`}
                  </div>
                </div>
              </div>
              <div className="mt-1.5 font-heading text-[13px] font-semibold text-[#4a4a4a]">
                {MONTH_SHORT[i]}
              </div>
              <div className="whitespace-nowrap text-[11.5px] text-[#8a94a0]">
                noc {Math.round(m.tmin ?? 0)}°
              </div>
              {/* Srážky se u některých míst nedají spočítat (stanice je pro
                  část okna nemá) — pak se číslo ani proužek nekreslí, aby
                  graf nepředstíral, že v tom měsíci neprší. */}
              <div className="whitespace-nowrap text-[11.5px] text-[#8a94a0]">
                {m.prcp === null ? ' ' : `💧 ${Math.round(m.prcp)} mm`}
              </div>
              {/* Srážky ještě jako tenký proužek pod číslem — porovnání mezi
                  měsíci na jeden pohled, ve modré kapky, aby byla souvislost
                  s číslem zřejmá. Vlastní měřítko (nejvyšší měsíc = plný
                  proužek), proto zůstává POD grafem a nemíchá se s teplotou. */}
              {m.prcp !== null && (
                <div
                  aria-hidden="true"
                  className="mx-auto mt-1 h-1 w-[70%] overflow-hidden rounded-full bg-[#e6eef7]"
                >
                  <div
                    className="h-full rounded-full bg-[#bcd6ee]"
                    style={{ width: `${Math.round((m.prcp / maxR) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function ClimateSection({
  normals,
  locative,
  genitive,
}: {
  normals: ClimateNormals
  /** Šestý pád místa včetně předložky („v Londýně") pro popisek pod nadpisem. */
  locative: string
  /**
   * Druhý pád VČETNĚ předložky, jak ho drží admin („do Londýna", „na Maltu").
   * Nadpis proto říká „na cestu do Londýna" / „na cestu na Maltu" — do věty
   * „na návštěvu Londýna" by šel jen čistý druhý pád, který v CMS není.
   */
  genitive: string
}) {
  const months = normals.months

  return (
    <section aria-labelledby="prumerne-teploty-a-srazky" className="mt-10">
      {/* Kotva zůstává `prumerne-teploty-a-srazky` jako na starém webu, ať staré
          odkazy dál trefí sekci; nadpis se od ní může lišit. */}
      <h2
        id="prumerne-teploty-a-srazky"
        className="font-heading text-[22px] font-bold leading-[1.25] text-[#005580]"
      >
        {climateHeading(genitive)}
      </h2>
      {/* Druhé hledané spojení („počasí … po měsících") i rozsah let nese
          řádek pod nadpisem — v nadpisu by to bylo dlouhé a upovídané. */}
      <p className="mt-1.5 text-[14px] text-[#8a94a0]">
        Počasí {locative} po měsících — průměrné denní teploty a srážky
        {normals.period ? ` za roky ${normals.period.start}–${normals.period.end}` : ''}.
      </p>

      {/* Legenda po skupinách — sdělí i to, že stupně tvoří dvojice (sezóna
          / mimo sezónu). Vypisuje se celá i na stránkách, kde některý stupeň
          nepadne: je to pevná stupnice a na každé stránce má být stejná. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-[#4a4a4a]">
        {LEGEND_GROUPS.map((group) => (
          <span key={group.title} className="flex items-center gap-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#99a9b3]">
              {group.title}
            </span>
            {group.levels.map((level) => (
              <span key={level} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-3 w-3 rounded-[4px]"
                  style={{ backgroundColor: SUITABILITY_COLOR[level] }}
                />
                {SUITABILITY_LABEL[level]}
              </span>
            ))}
          </span>
        ))}
      </div>

      {/* Graf se „vylámá" z odsazení čtecího sloupce na jeho plnou šířku (808 px)
          stejně jako obrázky a mapy v textu — `lg:px-16` na sloupci je 64 px,
          proto přesně `-mx-16`. Měsíce tím dostanou víc místa bez zvětšování. */}
      <div className="mt-4 lg:-mx-16">
        <PillChart months={months} />
      </div>

      {/* Stejná data přístupně — čtečky a případný tisk. Skrývací třída patří
          OBALU, ne tabulce: `sr-only` dává width 1px, jenže u `display: table`
          je šířka jen minimum a tabulka se roztáhne na obsah — vodorovně by
          pak natahovala celou stránku (na mobilu měřitelných 741 px). */}
      <div className="sr-only">
        <table>
          <caption>Průměrné měsíční teploty a srážky {locative}</caption>
          <thead>
            <tr>
              <th scope="col">Měsíc</th>
              <th scope="col">Nejvyšší denní teplota (°C)</th>
              <th scope="col">Nejnižší noční teplota (°C)</th>
              <th scope="col">Srážky (mm)</th>
              <th scope="col">Vhodnost návštěvy</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m, i) => (
              <tr key={m.month}>
                <th scope="row">{MONTH_FULL[i]}</th>
                <td>{Math.round(m.tmax ?? 0)}</td>
                <td>{Math.round(m.tmin ?? 0)}</td>
                <td>{m.prcp === null ? '—' : Math.round(m.prcp)}</td>
                <td>{SUITABILITY_LABEL[suitability(m)]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Atribuce vyžadovaná licencí dat (CC BY 4.0). */}
      <p className="mt-3 text-[12px] text-[#8a94a0]">
        Výška sloupce = denní teplota, proužek pod číslem = srážky · Zdroj:{' '}
        <a
          href="https://meteostat.net/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#8a94a0] underline hover:text-[#215491]"
        >
          Meteostat
        </a>
      </p>
    </section>
  )
}
