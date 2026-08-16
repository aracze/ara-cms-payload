import { cache } from 'react'

/**
 * Aktuální počasí a předpověď pro stránky kategorie „Počasí" — OpenWeatherMap
 * One Call 3.0 (předplatné „One Call by Call"): prvních 1 000 volání denně zdarma,
 * další zpoplatněné — účet má proto tvrdý strop 1 000/den, takže se nikdy nic
 * neúčtuje. Jeden dotaz na místo vrátí aktuální stav, 48 h po hodinách
 * i 8denní předpověď; české popisky přes `lang=cz`.
 *
 * ZÁLOŽNÍ CESTA: když One Call selže (nedostupné, vyčerpaný denní strop účtu
 * → 401/429, nebo čerstvě aktivovaný klíč, který ještě neběží), sáhne se na
 * BEZPLATNÉ endpointy /data/2.5/weather + /data/2.5/forecast (60 dotazů/min,
 * bez předplatného). Předpověď je pak 5denní počítaná z tříhodinových kroků
 * místo 7denní — web tak nikdy nezůstane bez počasí kvůli limitu.
 *
 * Stejný vzor jako kurzy měn (exchange-rate.ts): fetch s `next.revalidate`
 * (cache externího API je povolená i v dev — chrání rate limit třetí strany),
 * React cache() deduplikuje v rámci requestu a selhání vrací null (stránka
 * se vykreslí bez počasí, nikdy nespadne kvůli upstreamu).
 */

/** Surové tvary One Call 3.0 (jen pole, která web čte). */
interface OwmWeatherItem {
  description?: string
  icon?: string
}

interface OwmCurrent {
  dt?: number
  temp?: number
  feels_like?: number
  humidity?: number
  wind_speed?: number
  wind_deg?: number
  sunrise?: number
  sunset?: number
  weather?: OwmWeatherItem[]
}

interface OwmHourly {
  dt?: number
  temp?: number
  weather?: OwmWeatherItem[]
}

interface OwmDaily {
  dt?: number
  temp?: { min?: number; max?: number }
  pop?: number
  weather?: OwmWeatherItem[]
}

interface OneCallResponse {
  timezone?: string
  current?: OwmCurrent
  hourly?: OwmHourly[]
  daily?: OwmDaily[]
}

/** Normalizovaný tvar pro komponenty (weather-now-section, forecast-section). */
export interface WeatherDayPart {
  /** „Ráno", „Odpoledne", „Večer", „V noci" */
  label: string
  emoji: string
  temp: number
}

export interface WeatherDay {
  /** „Dnes", jinak „So 15." (v časové zóně místa) */
  label: string
  emoji: string
  tempMax: number
  tempMin: number
  /** Pravděpodobnost srážek 0–100 %. */
  pop: number
}

export interface PlaceWeather {
  current: {
    temp: number
    feelsLike: number
    humidity: number
    /** m/s, zaokrouhleno */
    windSpeed: number
    /** Světová strana česky (S, SV, V…). */
    windDirection: string
    /** Otočení šipky ve stupních — kam vítr FOUKÁ (meteorologický směr + 180°). */
    windArrowDeg: number
    /** Český popis („polojasno") s velkým prvním písmenem. */
    condition: string
    emoji: string
    /**
     * Kód ikony OpenWeather (01d…50n) omezený na naši sadu obrázků oblohy
     * v `public/weather/`; null = neznámý kód, karta pak fotku nechá čistou.
     */
    icon: string | null
    /** „6:13" v čase místa. */
    sunrise: string
    sunset: string
  }
  dayParts: WeatherDayPart[]
  /** 7 dní počínaje dneškem. */
  days: WeatherDay[]
}

/**
 * Ikona z OpenWeather kódu (01d–50n) — emoji drží jednotný vzhled se sekcí
 * „Kdy je tu nejlíp" a nepotřebují assety.
 */
function owmEmoji(icon: string | undefined): string {
  const code = (icon ?? '').slice(0, 2)
  const night = (icon ?? '').endsWith('n')
  switch (code) {
    case '01':
      return night ? '🌙' : '☀️'
    case '02':
      return night ? '🌙' : '🌤️'
    case '03':
      return '⛅'
    case '04':
      return '🌥️'
    case '09':
      return '🌧️'
    case '10':
      return '🌦️'
    case '11':
      return '⛈️'
    case '13':
      return '🌨️'
    case '50':
      return '🌫️'
    default:
      return '⛅'
  }
}

/** Světová strana z meteorologického směru větru (odkud fouká), česky. */
function windDirectionLabel(deg: number): string {
  const directions = ['S', 'SV', 'V', 'JV', 'J', 'JZ', 'Z', 'SZ']
  return directions[Math.round((((deg % 360) + 360) % 360) / 45) % 8]
}

/**
 * Časová zóna místa. One Call vrací název (IANA), bezplatné endpointy jen
 * posun v sekundách — u posunu se počítá s UTC nad posunutým časem, takže
 * obě varianty projdou stejnými funkcemi níž.
 */
type Zone = { tz: string; shift: 0 } | { tz: 'UTC'; shift: number }

function ianaZone(tz: string): Zone {
  return { tz, shift: 0 }
}

function offsetZone(offsetSeconds: number): Zone {
  return { tz: 'UTC', shift: offsetSeconds }
}

function zoned(unixSeconds: number, zone: Zone): Date {
  return new Date((unixSeconds + zone.shift) * 1000)
}

/** „6:13" v čase místa. */
function formatTime(unixSeconds: number, zone: Zone): string {
  return new Intl.DateTimeFormat('cs-CZ', {
    timeZone: zone.tz,
    hour: 'numeric',
    minute: '2-digit',
  }).format(zoned(unixSeconds, zone))
}

/** Hodina (0–23) daného okamžiku v čase místa. */
function hourInZone(unixSeconds: number, zone: Zone): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: zone.tz,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(zoned(unixSeconds, zone)),
  )
}

/** Kalendářní den místa jako „2026-08-15" — klíč pro seskupení předpovědi. */
function dayKey(unixSeconds: number, zone: Zone): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone.tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(zoned(unixSeconds, zone))
}

/** „So 15." v čase místa (krátký den + číslo dne). */
function formatDayLabel(unixSeconds: number, zone: Zone): string {
  const date = zoned(unixSeconds, zone)
  const weekday = new Intl.DateTimeFormat('cs-CZ', { timeZone: zone.tz, weekday: 'short' })
    .format(date)
    .replace('.', '')
  // České formáty přidávají tečku samy (weekday „so.", den „15.") — obojí se
  // odstraní a doplní jedna na konec, ať nevznikne „So 15..".
  const dayNumber = new Intl.DateTimeFormat('cs-CZ', { timeZone: zone.tz, day: 'numeric' })
    .format(date)
    .replace('.', '')
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${dayNumber}.`
}

/** Části dne z hodinové předpovědi — nejbližší výskyt dané místní hodiny. */
const DAY_PARTS: { label: string; hour: number }[] = [
  { label: 'Ráno', hour: 8 },
  { label: 'Odpoledne', hour: 14 },
  { label: 'Večer', hour: 19 },
  { label: 'V noci', hour: 23 },
]

/**
 * Části dne se zobrazují CHRONOLOGICKY od aktuální chvíle, ne v pevném pořadí
 * ráno→noc: odpoledne se odkazuje na dnešek, ale ráno už na zítřek, a pevné
 * pořadí by pak vypadalo jako by teplota přes den rostla pozpátku (stejné
 * chování jako starý web — „Odpoledne, Večer, V noci, Ráno").
 */
function sortDayParts(parts: (WeatherDayPart & { dt: number })[]): WeatherDayPart[] {
  return [...parts]
    .sort((a, b) => a.dt - b.dt)
    .map(({ label, emoji, temp }) => ({ label, emoji, temp }))
}

/**
 * Nastavení fetchů: timeout + cache 15 min per URL (souřadnice).
 *
 * MUSÍ to být funkce, ne sdílená konstanta: `AbortSignal.timeout()` začíná
 * odpočítávat v okamžiku VYTVOŘENÍ. Jako konstanta v modulu by se signál
 * vyrobil jednou při startu, po deseti vteřinách by byl trvale „aborted"
 * a každý další dotaz na počasí by okamžitě spadl — včetně záložní cesty,
 * takže by počasí na webu tiše zmizelo až do restartu procesu.
 */
function fetchInit(): RequestInit & { next: { revalidate: number } } {
  return {
    // Timeout, ať se render nezasekne na pomalém upstreamu; cache 15 min
    // per souřadnice — víc návštěvníků stejného místa = jeden dotaz
    // (strop účtu je 1 000 volání/den pro ~174 stránek počasí).
    signal: AbortSignal.timeout(10_000),
    next: { revalidate: 900 },
  }
}

/** Popis stavu s velkým prvním písmenem („polojasno" → „Polojasno"). */
function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : ''
}

function buildCurrent(
  raw: {
    temp: number
    feelsLike?: number
    humidity?: number
    windSpeed?: number
    windDeg?: number
    sunrise?: number
    sunset?: number
    description?: string
    icon?: string
  },
  zone: Zone,
): PlaceWeather['current'] {
  const windDeg = raw.windDeg ?? 0
  return {
    temp: Math.round(raw.temp),
    feelsLike: Math.round(raw.feelsLike ?? raw.temp),
    humidity: Math.round(raw.humidity ?? 0),
    windSpeed: Math.round(raw.windSpeed ?? 0),
    windDirection: windDirectionLabel(windDeg),
    windArrowDeg: (windDeg + 180) % 360,
    condition: capitalize(raw.description ?? ''),
    emoji: owmEmoji(raw.icon),
    // Kód ikony (01d…50n) drží i přehled u zemí — vybírá podle něj obrázek
    // oblohy v public/weather/. Jen z naší sady, ať se nedá podstrčit cesta.
    icon: raw.icon && /^(0[1-4]|09|1[013]|50)[dn]$/.test(raw.icon) ? raw.icon : null,
    sunrise: typeof raw.sunrise === 'number' ? formatTime(raw.sunrise, zone) : '',
    sunset: typeof raw.sunset === 'number' ? formatTime(raw.sunset, zone) : '',
  }
}

/** Hlavní cesta: One Call 3.0 (aktuální stav + 48 h + 8 dní jedním dotazem). */
async function fetchViaOneCall(
  lat: number,
  lng: number,
  apiKey: string,
): Promise<PlaceWeather | null> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    appid: apiKey,
    units: 'metric',
    lang: 'cz',
    exclude: 'minutely,alerts',
  })
  const res = await fetch(`https://api.openweathermap.org/data/3.0/onecall?${params}`, fetchInit())
  if (!res.ok) return null
  const data = (await res.json()) as OneCallResponse

  const current = data.current
  if (!data.timezone || !current || typeof current.temp !== 'number') return null
  const zone = ianaZone(data.timezone)

  const hourly = data.hourly ?? []
  const dayParts = sortDayParts(
    DAY_PARTS.flatMap((part) => {
      const match = hourly.find(
        (h) => typeof h.dt === 'number' && hourInZone(h.dt, zone) === part.hour,
      )
      if (!match || typeof match.temp !== 'number') return []
      return [
        {
          dt: match.dt!,
          label: part.label,
          emoji: owmEmoji(match.weather?.[0]?.icon),
          temp: Math.round(match.temp),
        },
      ]
    }),
  )

  const days: WeatherDay[] = (data.daily ?? [])
    .filter((d) => typeof d.dt === 'number' && typeof d.temp?.max === 'number')
    .slice(0, 7)
    .map((d, i) => ({
      label: i === 0 ? 'Dnes' : formatDayLabel(d.dt!, zone),
      emoji: owmEmoji(d.weather?.[0]?.icon),
      tempMax: Math.round(d.temp!.max!),
      tempMin: Math.round(d.temp!.min ?? d.temp!.max!),
      pop: Math.round((d.pop ?? 0) * 100),
    }))

  return {
    current: buildCurrent(
      {
        temp: current.temp,
        feelsLike: current.feels_like,
        humidity: current.humidity,
        windSpeed: current.wind_speed,
        windDeg: current.wind_deg,
        sunrise: current.sunrise,
        sunset: current.sunset,
        description: current.weather?.[0]?.description,
        icon: current.weather?.[0]?.icon,
      },
      zone,
    ),
    dayParts,
    days,
  }
}

/** Surové tvary bezplatných endpointů (jen čtená pole). */
interface FreeCurrentResponse {
  dt?: number
  timezone?: number
  main?: { temp?: number; feels_like?: number; humidity?: number }
  wind?: { speed?: number; deg?: number }
  sys?: { sunrise?: number; sunset?: number }
  weather?: OwmWeatherItem[]
}

interface FreeForecastResponse {
  city?: { timezone?: number }
  list?: {
    dt?: number
    main?: { temp?: number; temp_max?: number; temp_min?: number }
    pop?: number
    weather?: OwmWeatherItem[]
  }[]
}

/**
 * Záložní cesta bez předplatného: aktuální počasí + tříhodinová předpověď na
 * 5 dní (denní max/min a nejvyšší pravděpodobnost srážek se dopočítají
 * seskupením kroků po dnech; ikona dne se bere z poledního kroku).
 */
async function fetchViaFreeEndpoints(
  lat: number,
  lng: number,
  apiKey: string,
): Promise<PlaceWeather | null> {
  const query = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    appid: apiKey,
    units: 'metric',
    lang: 'cz',
  })
  const [currentRes, forecastRes] = await Promise.all([
    fetch(`https://api.openweathermap.org/data/2.5/weather?${query}`, fetchInit()),
    fetch(`https://api.openweathermap.org/data/2.5/forecast?${query}`, fetchInit()),
  ])
  if (!currentRes.ok) return null
  const currentData = (await currentRes.json()) as FreeCurrentResponse
  if (typeof currentData.main?.temp !== 'number') return null
  const zone = offsetZone(currentData.timezone ?? 0)

  const forecast: FreeForecastResponse = forecastRes.ok ? await forecastRes.json() : {}
  const steps = (forecast.list ?? []).filter(
    (s) => typeof s.dt === 'number' && typeof s.main?.temp === 'number',
  )

  const dayParts = sortDayParts(
    DAY_PARTS.flatMap((part) => {
      // Tříhodinové kroky málokdy padnou přesně na 8/14/19/23 → bereme nejbližší
      // krok v nejbližších 24 h (dál by šlo o pozítřek).
      let best: (typeof steps)[number] | null = null
      let bestDistance = Number.POSITIVE_INFINITY
      for (const step of steps.slice(0, 8)) {
        const distance = Math.abs(hourInZone(step.dt!, zone) - part.hour)
        if (distance < bestDistance) {
          best = step
          bestDistance = distance
        }
      }
      if (!best || bestDistance > 2) return []
      return [
        {
          dt: best.dt!,
          label: part.label,
          emoji: owmEmoji(best.weather?.[0]?.icon),
          temp: Math.round(best.main!.temp!),
        },
      ]
    }),
  )

  const byDay = new Map<
    string,
    { dt: number; max: number; min: number; pop: number; icon?: string }
  >()
  for (const step of steps) {
    const key = dayKey(step.dt!, zone)
    const temp = step.main!.temp!
    const max = step.main?.temp_max ?? temp
    const min = step.main?.temp_min ?? temp
    const existing = byDay.get(key)
    const isMidday = Math.abs(hourInZone(step.dt!, zone) - 13) <= 1
    if (!existing) {
      byDay.set(key, {
        dt: step.dt!,
        max,
        min,
        pop: step.pop ?? 0,
        icon: step.weather?.[0]?.icon,
      })
    } else {
      existing.max = Math.max(existing.max, max)
      existing.min = Math.min(existing.min, min)
      existing.pop = Math.max(existing.pop, step.pop ?? 0)
      if (isMidday) existing.icon = step.weather?.[0]?.icon
    }
  }

  const todayKey = dayKey(currentData.dt ?? Math.floor(Date.now() / 1000), zone)
  const days: WeatherDay[] = [...byDay.entries()].slice(0, 7).map(([key, day]) => ({
    label: key === todayKey ? 'Dnes' : formatDayLabel(day.dt, zone),
    emoji: owmEmoji(day.icon),
    tempMax: Math.round(day.max),
    tempMin: Math.round(day.min),
    pop: Math.round(day.pop * 100),
  }))

  return {
    current: buildCurrent(
      {
        temp: currentData.main.temp,
        feelsLike: currentData.main.feels_like,
        humidity: currentData.main.humidity,
        windSpeed: currentData.wind?.speed,
        windDeg: currentData.wind?.deg,
        sunrise: currentData.sys?.sunrise,
        sunset: currentData.sys?.sunset,
        description: currentData.weather?.[0]?.description,
        icon: currentData.weather?.[0]?.icon,
      },
      zone,
    ),
    dayParts,
    days,
  }
}

async function fetchPlaceWeatherRaw(lat: number, lng: number): Promise<PlaceWeather | null> {
  const apiKey = process.env.OPENWEATHER_API_KEY
  if (!apiKey || !Number.isFinite(lat) || !Number.isFinite(lng)) return null

  try {
    const viaOneCall = await fetchViaOneCall(lat, lng, apiKey)
    if (viaOneCall) return viaOneCall
  } catch {
    // spadne do záložní cesty níž
  }

  try {
    return await fetchViaFreeEndpoints(lat, lng, apiKey)
  } catch {
    return null
  }
}

export const fetchPlaceWeather = cache(fetchPlaceWeatherRaw)
