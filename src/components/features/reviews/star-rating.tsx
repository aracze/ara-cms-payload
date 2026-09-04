import React from 'react'

/**
 * Hodnocení 1–5 hvězdiček, jen pro čtení. Plné oranžové hvězdičky + šedé
 * „vypnuté" — jako legacy raty (star-on/star-off, 13 px). Umí i zlomkové
 * hodnoty (průměr ve výpisu cílů): částečná hvězdička se kreslí oranžovým
 * překryvem oříznutým na příslušnou šířku.
 *
 * Tvar kreslí CSS maska `.star-glyph` (globals.css), ne inline SVG — na
 * stránce cíle je i 50 hvězd a každá inline kopie SVG cesty stála ~600 B.
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
  const box = { width: size, height: size }

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
            <span
              key={n}
              aria-hidden="true"
              style={box}
              className={`star-glyph ${fraction >= 1 ? 'text-[#f5a623]' : 'text-[#d9dee3]'}`}
            />
          )
        }
        return (
          <span key={n} aria-hidden="true" className="relative inline-block" style={box}>
            <span className="star-glyph absolute inset-0 text-[#d9dee3]" style={box} />
            <span
              className="absolute inset-y-0 left-0 overflow-hidden"
              style={{ width: `${fraction * 100}%` }}
            >
              <span className="star-glyph text-[#f5a623]" style={box} />
            </span>
          </span>
        )
      })}
    </span>
  )
}
