import { StarRating } from './star-rating'
import { cn, reviewsCountLabel } from '@/lib/utils'

/**
 * Průměr zaokrouhlený na půl hvězdičky (legacy `finalRating`) — jediné místo,
 * kde se pravidlo zaokrouhlení definuje.
 */
export function halfStarRating(avg: number): number {
  return Math.round(avg * 2) / 2
}

/**
 * Souhrn hodnocení „★★★★☆ 12 recenzí" — jeden vzor pro dlaždice v „Co vidět",
 * hlavičku cíle ve výpisu i hero stránky. Barvy/velikost písma dodá volající
 * přes `className`, hvězdičky přes `size`; `countClassName` ladí jen počet.
 */
export function RatingSummary({
  avg,
  count,
  size = 13,
  suffix,
  className,
  countClassName,
}: {
  avg: number
  count: number
  size?: number
  /** Doplněk za počtem („cílů" u odvozeného průměru místa). */
  suffix?: string | null
  className?: string
  countClassName?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <StarRating rating={halfStarRating(avg)} size={size} />
      {/* Počet se nikdy nefiltruje — nula je platná hodnota („0 recenzí"),
          `filter(Boolean)` by ji vyhodil (postřeh z review PR #87). */}
      <span className={countClassName}>
        {`${count} ${reviewsCountLabel(count)}${suffix ? ` ${suffix}` : ''}`}
      </span>
    </span>
  )
}
