import React from 'react'
import { Sunrise, Sunset, Wind, Droplets, Navigation2 } from 'lucide-react'
import type { PlaceWeather } from '@/lib/weather'

/**
 * Bloky živého počasí na stránkách kategorie „Počasí" — aktuální stav
 * (nad textem, jako na starém webu) a předpověď (pod sekcí „Kdy je tu nejlíp").
 * Data dodává OpenWeatherMap přes fetchPlaceWeather (cache 15 min per
 * souřadnice); bez dat se sekce prostě nevykreslí.
 *
 * Texty v pásu jsou BÍLÉ, ne světle modré: pás je přechod do světlejší modré
 * a všechny drobné údaje leží zrovna na tom světlém konci, kde měla původní
 * #a9c3de kontrast jen 2,6 (norma žádá 4,5). Rozdíl mezi popiskem a hodnotou
 * proto nese velikost a tučnost, ne barva — pás zůstal světlý podle přání
 * uživatele (ztmavení bylo druhou možností).
 *
 * Podoba vybraná z maket (kolo 4, kombinace 2 + tónované karty): modrý pás
 * nese JEN velkou teplotu se stavem, čtyři údaje leží v patičce pásu pod
 * vlasovou linkou a části dne jsou samostatné, jemně modré karty pod pásem.
 * Smyslem je, aby modrá plocha měla jedno sdělení a nepůsobila přeplněně.
 */

/** Údaje v patičce pásu — jeden řádek, ustupují velké teplotě nad sebou. */
function FactsFooter({ weather }: { weather: PlaceWeather }) {
  const iconClass = 'h-[19px] w-[19px] shrink-0 text-[#9fc0e2]'
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-7 gap-y-2 border-t border-white/20 pt-3.5 text-[13.5px] text-white">
      <span className="flex items-center gap-2">
        <Sunrise aria-hidden="true" className={iconClass} strokeWidth={2} />
        <span className="text-[13px] text-white">Svítání</span>
        <span className="font-semibold">{weather.current.sunrise}</span>
      </span>
      <span className="flex items-center gap-2">
        <Sunset aria-hidden="true" className={iconClass} strokeWidth={2} />
        <span className="text-[13px] text-white">Stmívání</span>
        <span className="font-semibold">{weather.current.sunset}</span>
      </span>
      <span className="flex items-center gap-2">
        <Wind aria-hidden="true" className={iconClass} strokeWidth={2} />
        <span className="text-[13px] text-white">Vítr</span>
        <span className="font-semibold">{weather.current.windSpeed} m/s</span>
        <Navigation2
          aria-hidden="true"
          className="h-[14px] w-[14px] shrink-0 text-[#9fc0e2]"
          strokeWidth={2}
          style={{ transform: `rotate(${weather.current.windArrowDeg}deg)` }}
        />
        {weather.current.windDirection}
      </span>
      <span className="flex items-center gap-2">
        <Droplets aria-hidden="true" className={iconClass} strokeWidth={2} />
        <span className="text-[13px] text-white">Vlhkost</span>
        <span className="font-semibold">{weather.current.humidity} %</span>
      </span>
    </div>
  )
}

/** Aktuální počasí — NAD textem stránky (legacy pořadí bloků). */
export function WeatherNowSection({
  weather,
  locative,
}: {
  weather: PlaceWeather
  /** Šestý pád místa včetně předložky („v Londýně"). */
  locative: string
}) {
  return (
    <section aria-labelledby="aktualni-pocasi" className="mb-10">
      <h2
        id="aktualni-pocasi"
        className="font-heading text-[22px] font-bold leading-[1.25] text-[#005580]"
      >
        Aktuální počasí {locative}
      </h2>

      <div className="mt-4 rounded-[14px] bg-gradient-to-br from-[#1a3f6c] via-[#2c5f9e] to-[#3f74b5] px-7 py-6">
        <div className="flex items-center gap-4">
          <div aria-hidden="true" className="text-[46px] leading-none">
            {weather.current.emoji}
          </div>
          <div className="font-heading text-[46px] font-bold leading-none text-white">
            {weather.current.temp}°
          </div>
          <div className="text-[15px] text-white">
            {weather.current.condition}
            <span className="block text-[13.5px] text-white">
              pocitově {weather.current.feelsLike}°
            </span>
          </div>
        </div>
        <FactsFooter weather={weather} />
      </div>

      {/* Části dne — jemně modré karty, ať drží s pásem jako jeden celek. */}
      {weather.dayParts.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2.5 text-center sm:grid-cols-4">
          {weather.dayParts.map((part) => (
            <div
              key={part.label}
              className="rounded-[10px] border border-[#d7e5f2] bg-[#f2f7fb] px-1.5 py-3"
            >
              <div aria-hidden="true" className="text-[22px]">
                {part.emoji}
              </div>
              {/* #4d7196, ne světlejší modrá — na tónovaném podkladu #f2f7fb
                  drží kontrast 4,7 : 1 (drobné písmo potřebuje 4,5 : 1). */}
              <div className="text-[12.5px] text-[#4d7196]">{part.label}</div>
              <div className="font-heading text-[17px] font-semibold text-[#1a3f6c]">
                {part.temp}°
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/**
 * Nadpis předpovědi podle POČTU dnů, které zdroj vrátil — One Call dává 7 dní,
 * záložní bezplatná cesta 6 (5denní krokovaná předpověď + dnešek). Používá se
 * i pro položku v postranním obsahu, proto je exportovaný.
 */
export function forecastHeading(weather: PlaceWeather, locative: string): string {
  return `${weather.days.length}denní předpověď počasí ${locative}`
}

/** Předpověď — pod sekcí „Kdy je tu nejlíp" (karty, vybraná varianta 2). */
export function WeatherForecastSection({
  weather,
  locative,
}: {
  weather: PlaceWeather
  locative: string
}) {
  if (weather.days.length === 0) return null
  return (
    <section aria-labelledby="predpoved-pocasi" className="mt-10">
      <h2
        id="predpoved-pocasi"
        className="font-heading text-[22px] font-bold leading-[1.25] text-[#005580]"
      >
        {forecastHeading(weather, locative)}
      </h2>
      {/* Stejné karty jako části dne v bloku aktuálního počasí (rozhodnutí
          uživatele) — oba pásy dnů pak čtou jako jedna rodina. */}
      <div className="mt-4 grid grid-cols-4 gap-2.5 sm:grid-cols-7">
        {weather.days.map((day) => (
          <div
            key={day.label}
            className="rounded-[10px] border border-[#d7e5f2] bg-[#f2f7fb] px-1.5 py-3 text-center"
          >
            <div className="text-[12.5px] text-[#4d7196]">{day.label}</div>
            <div aria-hidden="true" className="my-0.5 text-[22px]">
              {day.emoji}
            </div>
            <div className="font-heading text-[17px] font-semibold text-[#1a3f6c]">
              {day.tempMax}°
            </div>
            <div className="text-[12.5px] text-[#4d7196]">{day.tempMin}°</div>
            <div className="mt-1 whitespace-nowrap text-[11.5px] text-[#2f6db3]">
              💧 {day.pop} %
            </div>
          </div>
        ))}
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
