'use client'

import { useState, useEffect } from 'react'

interface TimeData {
  day: string
  time: string
  offset: string
}

export function LocalTime({
  timezone,
  className = '',
  stacked = false,
}: {
  timezone?: string | null
  className?: string
  /**
   * Sloupcové rozložení (den nad časem, posun pod ním) — pro pravý panel,
   * kde stojí čas vedle počasí a oba sloupce mají mít stejný tvar. Výchozí
   * je řádek, jak ho používá zbytek webu.
   */
  stacked?: boolean
}) {
  const [data, setData] = useState<TimeData | null>(null)

  useEffect(() => {
    const update = () => {
      try {
        const now = new Date()
        const opts: Intl.DateTimeFormatOptions = timezone ? { timeZone: timezone } : {}

        const day = now.toLocaleDateString('cs-CZ', { weekday: 'long', ...opts }).toUpperCase()
        const time = now.toLocaleTimeString('cs-CZ', {
          hour: '2-digit',
          minute: '2-digit',
          ...opts,
        })

        // Calculate offset from Prague time
        let offset = ''
        if (timezone) {
          const destinationOffset = getOffsetHours(timezone, now)
          const pragueOffset = getOffsetHours('Europe/Prague', now)

          if (destinationOffset !== null && pragueOffset !== null) {
            const diffHours = destinationOffset - pragueOffset
            const totalMinutes = Math.round(diffHours * 60)
            const sign = totalMinutes >= 0 ? '+' : '-'
            const absMinutes = Math.abs(totalMinutes)
            const hours = Math.floor(absMinutes / 60)
            const minutes = absMinutes % 60
            const value = `${hours}${minutes ? `:${minutes.toString().padStart(2, '0')}` : ''}`
            offset = `${sign}${value}H`
          }
        }

        setData({ day, time, offset })
      } catch {
        setData(null)
      }
    }
    update()

    const delay = 60_000 - (Date.now() % 60_000)
    let intervalId: NodeJS.Timeout
    const timeoutId = setTimeout(() => {
      update()
      intervalId = setInterval(update, 60_000)
    }, delay)

    return () => {
      clearTimeout(timeoutId)
      if (intervalId) clearInterval(intervalId)
    }
  }, [timezone])

  // Placeholder drží stejnou výšku jako hotový obsah (prevence poskočení
  // rozvržení, než doběhne klientský efekt).
  const wrapper = stacked
    ? `flex flex-col items-center gap-1.5 ${className}`
    : `flex items-baseline justify-center gap-2 py-1 h-[42px] ${className}`
  const microClass = 'text-[10px] font-bold uppercase tracking-[0.1em] text-[#67747c]'

  if (!data) {
    return (
      <div className={wrapper}>
        {stacked && (
          <>
            <span className={`${microClass} h-[15px]`} />
            <span className="text-[26px] leading-none">&nbsp;</span>
          </>
        )}
      </div>
    )
  }

  // Sloupcový režim: nahoře popisek, dole hodnota se svou příponou. Posun
  // zůstává VEDLE času, ne pod ním — upřesňuje ho, takže patří k němu na řádek
  // (a sloupec s počasím vedle má pak tutéž stavbu: stav / teplota s ikonou).
  //
  // Posun je pozicovaný ABSOLUTNĚ, aby nerozšiřoval řádek: den se tak vystředí
  // nad samotným časem, ne nad dvojicí čas + posun, kde by proti němu seděl
  // viditelně vlevo.
  if (stacked) {
    return (
      <div className={wrapper}>
        <span className={`${microClass} flex h-[15px] items-center`}>{data.day}</span>
        <span className="relative">
          <span className="text-[26px] leading-none tracking-[0.01rem] text-[#333] tabular-nums">
            {data.time}
          </span>
          {data.offset && (
            <span
              className={`${microClass} absolute left-full top-1/2 ml-1.5 -translate-y-1/2 whitespace-nowrap`}
            >
              {data.offset}
            </span>
          )}
        </span>
      </div>
    )
  }

  return (
    <div className={wrapper}>
      <span className={microClass}>{data.day}</span>
      <span className="text-[26px] tracking-[0.01rem] text-[#333] px-2 tabular-nums">
        {data.time}
      </span>
      {data.offset && <span className={microClass}>{data.offset}</span>}
    </div>
  )
}

function getOffsetHours(timeZone: string, date: Date): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'shortOffset',
      hour: '2-digit',
    }).formatToParts(date)

    const offsetName = parts.find((part) => part.type === 'timeZoneName')?.value
    if (!offsetName) return null

    const match = offsetName.match(/^GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?$/)
    if (!match) return null

    const sign = match[1] === '-' ? -1 : 1
    const hours = Number(match[2] ?? 0)
    const minutes = Number(match[3] ?? 0)

    return sign * (hours + minutes / 60)
  } catch {
    return null
  }
}
