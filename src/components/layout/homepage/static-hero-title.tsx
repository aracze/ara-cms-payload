import Link from 'next/link'
import Search from '@/components/features/search/search'
import type { PopularDestination } from '@/types/payload'

export const StaticHeroTitle = ({
  title,
  placeholderExample,
  popularDestinations,
}: {
  title: string
  /** Název denně vylosovaného místa z hero fotky — nápověda v poli hledání
   *  („Najdi si svůj cíl — třeba X…"). Bez místa se použije statický fallback. */
  placeholderExample?: string | null
  /** Země pod vyhledáváním („Oblíbené:") — nejnavštěvovanější za posledních
   *  30 dní z Google Analytics (fetchPopularDestinations), ne ruční výběr. */
  popularDestinations: PopularDestination[]
}) => {
  return (
    <div className="relative z-[101] h-full flex flex-col items-center justify-center px-4">
      {/* Nadpis zůstává kvůli SEO a čtečkám obrazovky — vizuálně ho nese
          nápověda v poli („Najdi si svůj cíl — třeba Chorvatsko…"); viditelný
          titulek i podtitulek působily přeplácaně. */}
      <h1 className="sr-only">{title}</h1>

      <div className="relative w-full max-w-2xl flex flex-col items-center">
        {/* Měkké ztmavení jen kolem pole a odkazů — celoplošný overlay dusil
            fotku; kontrast je potřeba pouze tady. Na mobilu menší přesah do
            stran: -inset-x-12 vyčníval za okraj a stránka šla vodorovně
            posouvat (hero nesmí mít overflow-hidden kvůli našeptávači). */}
        <div
          aria-hidden="true"
          className="absolute -inset-x-4 sm:-inset-x-12 -inset-y-9 pointer-events-none bg-[radial-gradient(ellipse_at_center,rgba(8,22,42,0.38),transparent_70%)]"
        />

        <div className="relative w-full">
          <Search variant="homepage" placeholderExample={placeholderExample} />
        </div>

        <div className="relative mt-4 flex flex-wrap items-center justify-center gap-2">
          <span className="text-[13px] font-medium text-white/85">Oblíbené:</span>
          {popularDestinations.map((destination) => (
            <Link
              key={destination.href}
              href={destination.href}
              className="px-4 py-1 rounded-full text-[13px] font-semibold text-white bg-white/15 border border-white/40 backdrop-blur-sm hover:bg-white/25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            >
              {destination.title}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
