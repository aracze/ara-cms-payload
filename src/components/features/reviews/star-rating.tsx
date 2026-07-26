import React from 'react'
import { Star } from 'lucide-react'

/**
 * Hodnocení 1–5 hvězdiček, jen pro čtení. Plné oranžové hvězdičky + šedé
 * „vypnuté" — jako legacy raty (star-on/star-off, 13 px). Umí i zlomkové
 * hodnoty (průměr ve výpisu cílů): částečná hvězdička se kreslí oranžovým
 * překryvem oříznutým na příslušnou šířku.
 */
export function StarRating({
  rating,
  size = 13,
  className = '',
}: {
  rating: number
  size?: number
  className?: string
}) {
  const label = rating.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })

  return (
    <span
      className={`inline-flex items-center gap-px ${className}`}
      role="img"
      aria-label={`Hodnocení ${label} z 5 hvězdiček`}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const fraction = Math.min(Math.max(rating - (n - 1), 0), 1)
        if (fraction >= 1 || fraction <= 0) {
          return (
            <Star
              key={n}
              aria-hidden="true"
              style={{ width: size, height: size }}
              className={
                fraction >= 1 ? 'fill-[#f5a623] text-[#f5a623]' : 'fill-[#d9dee3] text-[#d9dee3]'
              }
              strokeWidth={0}
            />
          )
        }
        return (
          <span
            key={n}
            aria-hidden="true"
            className="relative inline-block"
            style={{ width: size, height: size }}
          >
            <Star
              className="absolute inset-0 fill-[#d9dee3] text-[#d9dee3]"
              style={{ width: size, height: size }}
              strokeWidth={0}
            />
            <span
              className="absolute inset-y-0 left-0 overflow-hidden"
              style={{ width: `${fraction * 100}%` }}
            >
              <Star
                className="fill-[#f5a623] text-[#f5a623]"
                style={{ width: size, height: size }}
                strokeWidth={0}
              />
            </span>
          </span>
        )
      })}
    </span>
  )
}
