import Link from 'next/link'
import { StaticHeroOverlay } from '@/components/features/static-hero-overlay'
import { StaticHeroWave } from '@/components/features/static-hero-wave'
import { StaticHeroImage } from '@/components/features/static-hero-image'
import { StarRating } from '@/components/features/reviews/star-rating'
import { reviewsCountLabel } from '@/lib/utils'

interface Breadcrumb {
  title: string
  href: string
}

interface HeroSectionProps {
  title: string
  imageUrl: string | null
  styleCss?: string
  filterId?: string
  breadcrumbs?: Breadcrumb[]
  /** Souhrn recenzí (turistické cíle) — hvězdičky + počet pod názvem, odkaz na #recenze. */
  rating?: { avg: number; count: number } | null
}

export const HeroSection = ({
  title,
  imageUrl,
  styleCss,
  filterId,
  breadcrumbs,
  rating = null,
}: HeroSectionProps) => {
  return (
    <section className="relative w-full h-[315px] bg-[#3b444f]">
      {/* Cover Image Background with its own overflow clipping */}
      <div className="absolute inset-0 overflow-hidden">
        <StaticHeroImage imageUrl={imageUrl} styleCss={styleCss} />
      </div>

      {/* Title Content - Overlaid like in Grails */}
      <div className="relative z-[101] h-full flex flex-col items-center justify-center animate-in fade-in slide-in-from-bottom-4 duration-1000">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav
            aria-label="Drobečková navigace"
            className="mb-2 flex items-center gap-2 -translate-y-[20px] bg-white/90 backdrop-blur-md border border-white/20 rounded-full px-5 py-1.5 shadow-sm"
          >
            <ol className="flex items-center gap-1.5 list-none p-0 m-0">
              {breadcrumbs.map((bc, idx) => {
                const isLast = idx === breadcrumbs.length - 1
                return (
                  <li key={bc.href} className="flex items-center gap-1.5">
                    {isLast ? (
                      <span
                        aria-current="page"
                        className="text-[14px] font-bold tracking-wide text-gray-700"
                      >
                        {bc.title}
                      </span>
                    ) : (
                      <Link
                        href={bc.href}
                        className="text-[14px] font-medium tracking-wide text-gray-500 transition-colors duration-200 hover:text-[#1a3f6c]"
                      >
                        {bc.title}
                      </Link>
                    )}
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
                href="#recenze"
                className="inline-flex items-center gap-2.5 text-[15px] font-semibold text-white/95 [text-shadow:1px_1px_1px_rgba(0,0,0,0.5)] transition-colors hover:text-white"
              >
                <StarRating rating={Math.round(rating.avg * 2) / 2} size={17} />
                {rating.count} {reviewsCountLabel(rating.count)}
              </a>
            )}
          </div>
        </div>
        <div className="-translate-y-[12px] w-[30px] h-px bg-[#D7E1EF] rounded-full mx-auto"></div>

        {rating && rating.count > 0 && (
          <a
            href="#recenze"
            className="lg:hidden -translate-y-[4px] inline-flex items-center gap-2 text-[13.5px] font-semibold text-white/95 [text-shadow:1px_1px_1px_rgba(0,0,0,0.5)] transition-colors hover:text-white"
          >
            <StarRating rating={Math.round(rating.avg * 2) / 2} size={14} />
            {rating.count} {reviewsCountLabel(rating.count)}
          </a>
        )}
      </div>

      <StaticHeroOverlay filterId={filterId} />

      <StaticHeroWave />
    </section>
  )
}
