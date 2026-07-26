'use client'

import { useState } from 'react'
import { Star } from 'lucide-react'

/**
 * Hvězdičkový VSTUP 1–5 (obrysové hvězdičky, hover/focus je plní oranžově).
 * Sdílí ho lišta na detailu cíle, lišta i formulář inline recenzí a prázdný
 * stav „Ohodnoť jako první" ve výpisu cílů. Obrys = „vyplň mě"; plné šedé
 * hvězdičky (StarRating) naopak jen zobrazují hodnotu.
 */
export function StarInput({
  value,
  onSelect,
  size = 21,
  appearance = 'outline',
  className = '',
}: {
  value: number
  onSelect: (rating: number) => void
  size?: number
  /** `outline` = obrysové (formuláře/lišty); `filled` = plné šedé jako StarRating
   * (tišší varianta pro hlavičky cílů — nekřičí vedle názvů). */
  appearance?: 'outline' | 'filled'
  className?: string
}) {
  const [hover, setHover] = useState(0)
  const shown = hover || value
  const emptyClass =
    appearance === 'filled' ? 'fill-[#d9dee3] text-[#d9dee3]' : 'fill-none text-[#9aa6b1]'

  return (
    <div
      // Plná (tichá) varianta kopíruje rozestupy StarRating (gap-px, bez
      // paddingu tlačítek), ať hlavičky cílů lícují s průměry na pixel.
      className={`flex items-center ${appearance === 'filled' ? 'gap-px' : ''} ${className}`}
      // role=group: aria-label na holém divu čtečky nemusí přečíst.
      role="group"
      aria-label="Tvé hodnocení (1–5 hvězdiček)"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-pressed={value === n}
          aria-label={`Ohodnotit ${n} z 5 hvězdiček`}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onFocus={() => setHover(n)}
          onBlur={() => setHover(0)}
          onClick={() => onSelect(n)}
          className={appearance === 'filled' ? '' : 'p-0.5'}
        >
          <Star
            aria-hidden="true"
            style={{ width: size, height: size }}
            className={`transition-colors ${n <= shown ? 'fill-[#f5a623] text-[#f5a623]' : emptyClass}`}
            strokeWidth={appearance === 'filled' ? 0 : 1.5}
          />
        </button>
      ))}
    </div>
  )
}
