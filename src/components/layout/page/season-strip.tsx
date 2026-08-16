import React from 'react'
import Link from 'next/link'
import { SUITABILITY_COLOR, SUITABILITY_INK } from '@/lib/climate'
import type { SeasonMonths, SeasonStatus } from '@/lib/seasonality'

/**
 * Pruh „Kdy jet do…" v pravém panelu u míst — zmenšenina klimatického grafu
 * ze stránky počasí. Sdílí s ním škálu z `@/lib/climate`, takže tmavší zelená
 * znamená totéž na obou místech.
 *
 * Panel je úzký (340 px), takže se čísla měsíců vejdou jen jako jednociferná
 * a zkratky pod ně už ne — orientaci proto nese popisek pod pruhem („Květen –
 * Září") a v `title` každého bloku je celý název měsíce.
 */

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

/** Stav pruhu → stupeň škály. Prostřední dva stupně škály pruh nerozlišuje. */
const LEVEL: Record<SeasonStatus, 'ideal' | 'good' | 'poor'> = {
  peak: 'ideal',
  mid: 'good',
  off: 'poor',
}

const STATUS_TEXT: Record<SeasonStatus, string> = {
  peak: 'hlavní sezóna',
  mid: 'sezóna',
  off: 'mimo sezónu',
}

export function SeasonStrip({
  season,
  heading,
  href,
}: {
  season: SeasonMonths
  /** Celý nadpis karty („Kdy jet do Chorvatska"). */
  heading: string
  /** Odkaz na stránku počasí — pruh je jen ochutnávka, detail je tam. */
  href: string | null
}) {
  const strip = (
    <>
      <div aria-hidden="true" className="mt-4 flex w-full">
        {season.months.map((status, i) => {
          const level = LEVEL[status]
          return (
            <span
              key={i}
              title={`${MONTH_FULL[i]} — ${STATUS_TEXT[status]}`}
              className="flex h-[26px] min-w-0 flex-1 items-center justify-center border-l border-white/45 text-[11px] first:rounded-l-[4px] first:border-l-0 last:rounded-r-[4px]"
              style={{
                backgroundColor: SUITABILITY_COLOR[level],
                color: SUITABILITY_INK[level],
              }}
            >
              {i + 1}
            </span>
          )
        })}
      </div>
      {season.idealText && (
        <div className="mt-3.5 inline-block rounded-[3px] bg-[#f2f5f8] px-5 py-[5px] text-[10px] font-bold uppercase tracking-[0.05em] text-[#67747c]">
          {season.idealText}
        </div>
      )}
      {/* Táž data pro čtečky — barevný pruh sám o sobě nic nesděluje. */}
      <span className="sr-only">
        {season.months.map((status, i) => `${MONTH_FULL[i]}: ${STATUS_TEXT[status]}`).join('. ')}.
      </span>
    </>
  )

  return (
    <div className="mb-6">
      {href ? (
        <Link href={href} className="block hover:no-underline">
          <h2 className="mb-0 text-[20px] font-semibold leading-tight text-[#1a3f6c] hover:underline">
            {heading}
          </h2>
          {strip}
        </Link>
      ) : (
        <>
          <h2 className="mb-0 text-[20px] font-semibold leading-tight text-[#1a3f6c]">{heading}</h2>
          {strip}
        </>
      )}
    </div>
  )
}
