import Link from 'next/link'
import { StaticHeroOverlay } from '@/components/features/static-hero-overlay'
import { StaticHeroWave } from '@/components/features/static-hero-wave'
import { StaticHeroImage } from '@/components/features/static-hero-image'
import { StarRating } from '@/components/features/reviews/star-rating'
import { reviewsCountLabel } from '@/lib/utils'
import type { Breadcrumb } from '@/lib/page-hierarchy'

interface HeroSectionProps {
  title: string
  imageUrl: string | null
  styleCss?: string
  filterId?: string
  breadcrumbs?: Breadcrumb[]
  /**
   * Souhrn recenzí — hvězdičky + počet u názvu. Cíl ukazuje vlastní recenze,
   * místo odvozený průměr z recenzí svých cílů (viz `ratingCountSuffix`).
   */
  rating?: { avg: number; count: number } | null
  /** Kam vede klik na hvězdičky: cíl na vlastní recenze, místo na výpis cílů. */
  ratingHref?: string
  /** Dovětek za počtem („cílů" u místa), ať je jasné, odkud se průměr bere. */
  ratingCountSuffix?: string
  /**
   * Rozmazaný náhled (data URI). Fotky z CMS ho nemají — plní ho jen výchozí
   * obálka statických stránek, u které náhled známe (viz lib/default-cover).
   */
  blurDataURL?: string
}

export const HeroSection = ({
  title,
  imageUrl,
  styleCss,
  filterId,
  breadcrumbs,
  rating = null,
  ratingHref = '#recenze',
  ratingCountSuffix,
  blurDataURL,
}: HeroSectionProps) => {
  const ratingLabel = rating
    ? [rating.count, reviewsCountLabel(rating.count), ratingCountSuffix].filter(Boolean).join(' ')
    : null

  return (
    <section className="relative w-full h-[315px] bg-[#3b444f]">
      {/* Cover Image Background with its own overflow clipping */}
      <div className="absolute inset-0 overflow-hidden">
        <StaticHeroImage imageUrl={imageUrl} styleCss={styleCss} blurDataURL={blurDataURL} />
      </div>

      {/* Title Content - Overlaid like in Grails */}
      <div className="relative z-[101] h-full flex flex-col items-center justify-center animate-in fade-in slide-in-from-bottom-4 duration-1000">
        {/* Řetězec jde po hierarchii v CMS, takže může mít i 4 položky. Aby
            dlouhá cesta na mobilu netlačila celou stránku do vodorovného
            posuvu, přetéká jen pilulka sama (posuvník skrytý — odkazy jsou
            fokusovatelné, takže se klávesnicí nascrollují samy). */}
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav
            aria-label="Drobečková navigace"
            className="mb-2 flex max-w-[calc(100vw-2rem)] items-center gap-2 -translate-y-[20px] overflow-x-auto bg-white/90 backdrop-blur-md border border-white/20 rounded-full px-5 py-1.5 shadow-sm [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <ol className="flex w-max items-center gap-1.5 list-none p-0 m-0">
              {/* Každý drobeček je PŘEDEK, aktuální stránka v řetězci není (je
                  v `<h1>` pod ním) — proto jsou všechny položky odkazem a žádná
                  nemá `aria-current="page"`. Poslední (přímý rodič) je jen
                  zvýrazněný. */}
              {breadcrumbs.map((bc, idx) => {
                const isLast = idx === breadcrumbs.length - 1
                return (
                  <li key={bc.href} className="flex shrink-0 items-center gap-1.5">
                    <Link
                      href={bc.href}
                      className={`text-[14px] tracking-wide transition-colors duration-200 hover:text-[#1a3f6c] ${
                        isLast ? 'font-bold text-gray-700' : 'font-medium text-gray-500'
                      }`}
                    >
                      {bc.title}
                    </Link>
                    {!isLast && (
                      <span className="text-gray-300 text-[12px] px-0.5" aria-hidden="true">
                        /
                      </span>
                    )}
                  </li>
                )
              })}
            </ol>
          </nav>
        )}
        {/* Hodnocení cíle: titulek drží PŘESNĚ střed (stejně široké pružné
            sloupce po obou stranách) a hvězdičky jsou vycentrované v pravém
            sloupci — tedy přesně uprostřed mezery mezi titulkem a okrajem,
            pro jakkoli dlouhý název. Na menších zařízeních jsou pod názvem.
            Odkaz sroluje na recenze. */}
        <div className="mx-auto flex w-full max-w-7xl -translate-y-[16px] items-center px-6">
          <div className="hidden flex-1 lg:block" />
          <h1 className="w-full text-[40px] font-semibold text-white text-center tracking-normal [text-shadow:1px_1px_1px_rgba(0,0,0,0.5)] lg:w-auto">
            {title}
          </h1>
          <div className="hidden flex-1 justify-center lg:flex">
            {rating && rating.count > 0 && (
              <a
                href={ratingHref}
                className="inline-flex items-center gap-2.5 text-[15px] font-semibold text-white/95 [text-shadow:1px_1px_1px_rgba(0,0,0,0.5)] transition-colors hover:text-white"
              >
                <StarRating rating={Math.round(rating.avg * 2) / 2} size={17} />
                {ratingLabel}
              </a>
            )}
          </div>
        </div>
        <div className="-translate-y-[12px] w-[30px] h-px bg-[#D7E1EF] rounded-full mx-auto"></div>

        {rating && rating.count > 0 && (
          <a
            href={ratingHref}
            className="lg:hidden -translate-y-[4px] inline-flex items-center gap-2 text-[13.5px] font-semibold text-white/95 [text-shadow:1px_1px_1px_rgba(0,0,0,0.5)] transition-colors hover:text-white"
          >
            <StarRating rating={Math.round(rating.avg * 2) / 2} size={14} />
            {ratingLabel}
          </a>
        )}
      </div>

      <StaticHeroOverlay filterId={filterId} />

      <StaticHeroWave />
    </section>
  )
}
