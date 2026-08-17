import React from 'react'
import Link from 'next/link'
import { Droplets, Wind } from 'lucide-react'
import { WEATHER_ICON } from '@/components/features/weather-icon'
import type { PlaceWeather } from '@/lib/weather'

/**
 * Přehled počasí podřazených míst — na stránkách počasí u zemí, ostrovů
 * a regionů (Chorvatsko, Sicílie…). Nahrazuje „vlastní" počasí, které by se
 * počítalo ze souřadnic země: ty míří na její geometrický střed, takže
 * Chorvatsko hlásilo 26 °C z vnitrozemí, zatímco Dubrovník, Split i Záhřeb
 * měly 30 °C. Stejné chování jako starý web (`generateWeatherOverview`).
 *
 * Karta = fotka místa z CMS, přes ni teplota s ikonou stavu a do pravého
 * horního rohu měkce prolnutý obrázek počasí (varianta 3 z maket) — obrázky
 * jsou přenesené ze starého webu do `public/weather/<kód ikony>.jpg`
 * a pojmenované přímo kódy, které vrací OpenWeather.
 */

export interface WeatherOverviewItem {
  title: string
  /** Adresa stránky počasí daného místa. */
  href: string
  imageUrl: string | null
  weather: PlaceWeather
}

/** Maska pruhu: obloha se vlévá od pravého horního rohu a měkce mizí. */
const BAND_MASK = 'linear-gradient(200deg, rgba(0,0,0,0.95) 18%, transparent 58%)'

/**
 * Vrstva oblohy pro daný stav.
 *
 * Fotky oblohy pocházejí ze starého webu (`public/weather/`). Původních 18
 * souborů bylo jen několik různých snímků, takže v repu leží 8 a zbytek se
 * na ně mapuje (viz SKY_FILE). SNÍH mezi nimi není: jeho snímek má v záběru
 * strom, který po prolnutí do rohu vypadá jako chyba — dostane proto chladný
 * závoj s padajícími vločkami, protože poznat, že sněží, je důležitější než
 * mít všude fotku.
 */
const SNOW_FLAKES =
  'radial-gradient(circle at 18% 22%, rgba(255,255,255,.95) 1.6px, transparent 2.2px),' +
  'radial-gradient(circle at 62% 12%, rgba(255,255,255,.8) 1.3px, transparent 2px),' +
  'radial-gradient(circle at 84% 44%, rgba(255,255,255,.9) 1.8px, transparent 2.4px),' +
  'radial-gradient(circle at 38% 58%, rgba(255,255,255,.75) 1.2px, transparent 1.8px)'

/**
 * Kód stavu → soubor oblohy. Sada ze starého webu měla 18 souborů, ale jen
 * několik různých snímků (02d=03d=04d, denní i „noční" varianty byly často
 * tentýž obrázek), takže duplicity nedržíme v repu a mapujeme je sem:
 * úrovně oblačnosti sdílí jeden snímek, mrholení bere ten deštivý a noční
 * kódy sdílí denní (tmavý přechod přes ně je stejně ztlumí). Sníh v mapě
 * není — má vlastní závoj, viz níž.
 */
const SKY_FILE: Record<string, string> = {
  '01d': '01d',
  '01n': '01n',
  '02d': '02d',
  '03d': '02d',
  '04d': '02d',
  '02n': '02n',
  '03n': '02n',
  '04n': '02n',
  '09d': '09d',
  '09n': '09d',
  '10d': '10d',
  '10n': '10d',
  '11d': '11d',
  '11n': '11d',
  '50d': '50d',
  '50n': '50d',
}

function skyLayers(icon: string | null): React.CSSProperties[] {
  if (!icon) return []
  const mask = { WebkitMaskImage: BAND_MASK, maskImage: BAND_MASK }
  if (icon.startsWith('13')) {
    return [
      {
        background: 'linear-gradient(200deg, rgba(206,228,247,0.9), rgba(206,228,247,0))',
        ...mask,
      },
      {
        backgroundImage: SNOW_FLAKES,
        backgroundSize: '46px 46px, 62px 62px, 54px 54px, 70px 70px',
        ...mask,
      },
    ]
  }
  const file = SKY_FILE[icon]
  if (!file) return []
  return [{ backgroundImage: `url(/weather/${file}.jpg)`, opacity: 0.85, ...mask }]
}

/**
 * Ikona stavu vedle teploty — KRESLENÁ, ne emoji. Emoji mlhy i mraků jsou
 * světle šedá a na světlé obloze v rohu karty zanikla; kreslená ikona má bílý
 * tah se stínem, takže je čitelná na jakékoli fotce. (V tónovaných kartách
 * částí dne a předpovědi emoji zůstávají — tam leží na klidném podkladu.)
 */
// Mapa kódů na ikony je sdílená s pravým panelem — viz components/features/weather-icon.

export function WeatherOverviewSection({
  items,
  locative,
}: {
  items: WeatherOverviewItem[]
  /** Šestý pád místa včetně předložky („v Chorvatsku") pro nadpis. */
  locative: string
}) {
  if (items.length === 0) return null

  return (
    <section aria-labelledby="aktualni-pocasi" className="mb-10">
      <h2
        id="aktualni-pocasi"
        className="font-heading text-[22px] font-bold leading-[1.25] text-[#005580]"
      >
        Aktuální počasí {locative}
      </h2>

      <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const code = item.weather.current.icon
          const sky = skyLayers(code)
          const Icon = code ? WEATHER_ICON[code] : null
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group block overflow-hidden rounded-xl border border-[#e3e9ef] bg-white no-underline transition-shadow hover:shadow-md"
            >
              <div
                className="relative flex h-[132px] items-end bg-[#dbe6f0] bg-cover bg-center px-3.5 py-3"
                style={item.imageUrl ? { backgroundImage: `url(${item.imageUrl})` } : undefined}
              >
                {/* Obloha podle počasí se vlévá od pravého horního rohu (viz
                    skyLayers) — měkký pruh, ať to působí jako součást fotky. */}
                {sky.map((layer, i) => (
                  <span
                    key={i}
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-cover bg-center"
                    style={layer}
                  />
                ))}
                {/* Ztmavení dolní části, ať je název místa čitelný na každé fotce. */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[rgba(10,28,50,0.03)] via-[rgba(10,28,50,0.2)] to-[rgba(10,28,50,0.68)]"
                />
                <span className="absolute right-3 top-2.5 z-10 flex items-center gap-1.5 font-heading text-[24px] font-bold text-white [text-shadow:0_1px_5px_rgba(0,0,0,0.45)]">
                  {Icon && (
                    <Icon
                      aria-hidden="true"
                      className="h-[21px] w-[21px] shrink-0 [filter:drop-shadow(0_1px_3px_rgba(0,0,0,0.5))]"
                    />
                  )}
                  {item.weather.current.temp}°
                </span>
                <span className="relative z-10 font-heading text-[17px] font-semibold text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.4)] group-hover:underline">
                  {item.title}
                </span>
              </div>
              <div className="flex items-center gap-3.5 px-3.5 py-2.5 text-[13px] text-[#4a4a4a]">
                <span className="flex items-center gap-1.5">
                  <Droplets
                    aria-hidden="true"
                    className="h-[15px] w-[15px] shrink-0 text-[#4c7bb0]"
                    strokeWidth={2}
                  />
                  {item.weather.current.humidity} %
                </span>
                <span className="flex items-center gap-1.5">
                  <Wind
                    aria-hidden="true"
                    className="h-[15px] w-[15px] shrink-0 text-[#4c7bb0]"
                    strokeWidth={2}
                  />
                  {item.weather.current.windSpeed} m/s
                </span>
                <span className="ml-auto truncate text-[#8a94a0]">
                  {item.weather.current.condition}
                </span>
              </div>
            </Link>
          )
        })}
      </div>
      <p className="mt-2 text-[12px] text-[#8a94a0]">
        Zdroj:{' '}
        <a
          href="https://openweathermap.org/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#8a94a0] underline hover:text-[#215491]"
        >
          OpenWeather
        </a>
      </p>
    </section>
  )
}
