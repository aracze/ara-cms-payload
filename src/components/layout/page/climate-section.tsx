import React from 'react'
import type { ClimateNormalMonth, ClimateNormals } from '@/types/payload'
import { LEGEND_GROUPS, SUITABILITY_COLOR, SUITABILITY_LABEL, suitability } from '@/lib/climate'

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

// Škála (barvy, popisky, výpočet vhodnosti) žije v `@/lib/climate` — sdílí ji
// s pruhem sezóny v pravém panelu, aby měla jedno místo.

/**
 * Kolik naprší, se musí posuzovat VŮČI MÍSTU, ne podle jedné univerzální
 * hranice. Dřív platilo „55 mm a víc = deštivo" všude, takže Bangkok dostal
 * v listopadu deštivý mráček, přesto že je to jeho nejsušší část roku a vrchol
 * sezóny — vedle září se 340 mm to vypadalo nesmyslně. Stejná třída chyby jako
 * bývalý teplotní strop na 33 °C: jedno číslo na Island i na Thajsko.
 *
 * Samotný poměr k místu ale nestačí ani jedním směrem:
 *  · v poušti (maximum 5 mm) by „nejdeštivější měsíc" dostal deštivou ikonu,
 *    ačkoli tam neprší vůbec → proto absolutní podlaha,
 *  · v Bergenu prší 200 mm každý měsíc rovnoměrně, takže by žádný nevyčníval
 *    → proto absolutní strop, nad kterým prší bez ohledu na okolí.
 *
 * Poměřuje se s MEDIÁNEM, ne s maximem: u míst s vyrovnanými srážkami
 * (Chorvatsko 34–71 mm) by se proti maximu „deštivá" stala většina měsíců,
 * a taková ikona pak nenese žádnou informaci.
 */
const RAIN_A_LOT_MM = 120
const RAIN_SOME_MM = 80
const RAIN_FLOOR_MM = 30

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

type RainLevel = 'rainy' | 'showery' | 'dry'

function rainLevel(prcp: number | null, medianPrcp: number): RainLevel {
  if (prcp === null) return 'dry'
  const aboveFloor = prcp >= RAIN_FLOOR_MM && medianPrcp > 0
  if (prcp >= RAIN_A_LOT_MM || (aboveFloor && prcp >= medianPrcp * 1.6)) return 'rainy'
  if (prcp >= RAIN_SOME_MM || (aboveFloor && prcp >= medianPrcp * 1.25)) return 'showery'
  return 'dry'
}

/** Orientační ikona měsíce z teploty a srážek (deterministická, bez dat navíc). */
function monthEmoji(m: ClimateNormalMonth, medianPrcp: number): string {
  const t = m.tmax ?? 0
  const rain = rainLevel(m.prcp, medianPrcp)
  if (rain === 'rainy') return '🌧️'
  if (rain === 'showery') return t < 15 ? '🌦️' : '🌤️'
  if (t >= 20) return '☀️'
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
  // Typický měsíc daného místa — podle něj se pozná, který je opravdu deštivý
  // (viz rainLevel). Měsíce bez měření se do mediánu nepočítají.
  const medianR = median(months.map((m) => m.prcp).filter((p): p is number => p !== null))

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[560px] grid-cols-12 gap-1.5">
        {months.map((m, i) => {
          const level = suitability(m)
          // Bez denní teploty se stupeň spočítat nedá — sloupec pak zůstane
          // prázdný a bublina to řekne. Dokreslit ho odhadem by znamenalo
          // tvrdit o měsíci něco, co v datech není.
          const label = level ? SUITABILITY_LABEL[level] : 'Bez dat'
          // Bublina: u krajních sloupců zarovnaná k okraji, ať neuteče z grafu.
          const tipPosition = i <= 1 ? 'left-0' : i >= 10 ? 'right-0' : 'left-1/2 -translate-x-1/2'
          return (
            <div key={m.month} className="group relative text-center">
              <div aria-hidden="true" className="text-[19px] leading-7">
                {monthEmoji(m, medianR)}
              </div>
              <div className="mb-1 font-heading text-[13px] font-semibold text-[#1f2937]">
                {Math.round(m.tmax ?? 0)}°
              </div>
              <div className="relative flex h-[176px] items-end justify-center rounded-full bg-[#f1f4f7] p-1">
                {level && (
                  <div
                    className="w-full max-w-[26px] rounded-full"
                    style={{
                      height: `${Math.max(Math.round(((m.tmax ?? 0) / maxT) * 100), 12)}%`,
                      backgroundColor: SUITABILITY_COLOR[level],
                    }}
                  />
                )}
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
              <div className="whitespace-nowrap text-[11.5px] text-[#667085]">
                noc {Math.round(m.tmin ?? 0)}°
              </div>
              {/* Srážky se u některých míst nedají spočítat (stanice je pro
                  část okna nemá) — pak se číslo ani proužek nekreslí, aby
                  graf nepředstíral, že v tom měsíci neprší. */}
              <div className="whitespace-nowrap text-[11.5px] text-[#667085]">
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
      <p className="mt-1.5 text-[14px] text-[#667085]">
        Počasí {locative} po měsících — průměrné denní teploty a srážky
        {normals.period ? ` za roky ${normals.period.start}–${normals.period.end}` : ''}.
      </p>

      {/* Legenda po skupinách — sdělí i to, že stupně tvoří dvojice (sezóna
          / mimo sezónu). Vypisuje se celá i na stránkách, kde některý stupeň
          nepadne: je to pevná stupnice a na každé stránce má být stejná. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-[#4a4a4a]">
        {LEGEND_GROUPS.map((group) => (
          <span key={group.title} className="flex items-center gap-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#667085]">
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
                <td>{m.tmax === null ? '—' : Math.round(m.tmax)}</td>
                <td>{m.tmin === null ? '—' : Math.round(m.tmin)}</td>
                <td>{m.prcp === null ? '—' : Math.round(m.prcp)}</td>
                <td>
                  {(() => {
                    const level = suitability(m)
                    return level ? SUITABILITY_LABEL[level] : 'Bez dat'
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Atribuce vyžadovaná licencí dat (CC BY 4.0). Legenda zmiňuje i ikonu:
          ta se řídí srážkami VŮČI OSTATNÍM MĚSÍCŮM téhož místa (viz rainLevel),
          takže bez vysvětlení může slunce u londýnského července s 58 mm působit
          jako chyba — číslo pod sloupcem přitom říká pravdu. */}
      <p className="mt-3 text-[12px] text-[#667085]">
        Výška sloupce = denní teplota, proužek pod číslem = srážky, ikona = měsíc nezvykle mokrý v
        porovnání s ostatními zde · Zdroj:{' '}
        <a
          href="https://meteostat.net/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#667085] underline hover:text-[#215491]"
        >
          Meteostat
        </a>
      </p>
    </section>
  )
}
