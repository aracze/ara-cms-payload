import { StaticHeroWave } from '@/components/features/static-hero-wave'
import { Homepage as HomepageType } from '@/types/payload'
import { StaticHeroOverlay } from '@/components/features/static-hero-overlay'
import { StaticHeroTitle } from './static-hero-title'
import { StaticHeroImage } from '@/components/features/static-hero-image'
import { WhatsNewSection } from './whats-new-section'
import { InspirationSection } from './inspiration-section'
import { InspirationPlacesSection } from './inspiration-places-section'
import { HomepagePreparationSection } from './preparation-section'
import { ReadingTopicsSection } from './reading-topics-section'
import { DealsOfDaySection } from './deals-of-day-section'
import {
  fetchLatestActivity,
  fetchHomepageInspiration,
  fetchHomepageHeroPlace,
  fetchTopAffiliateDeals,
  fetchPopularDestinations,
} from '@/lib/payload'
import { toMediaProxy } from '@/lib/cloudinary-loader'

// Fallback, když se nepodaří vylosovat denní místo (např. žádné publikované
// místo s fotkou) — konfigurovatelné přes env, ať URL není natvrdo v kódu.
const HOMEPAGE_HERO_IMAGE_FALLBACK = toMediaProxy(
  process.env.NEXT_PUBLIC_HOMEPAGE_HERO_IMAGE ||
    'https://res.cloudinary.com/ara/image/upload/homepage.jpg',
)

export const Homepage = async ({ homepage }: { homepage?: HomepageType | null }) => {
  // Všechny nezávisle — pomalejší nesmí blokovat začátek ostatních.
  const [activity, inspiration, heroPlace, topDeals, popularDestinations] = await Promise.all([
    fetchLatestActivity(),
    fetchHomepageInspiration(),
    fetchHomepageHeroPlace(),
    fetchTopAffiliateDeals(),
    fetchPopularDestinations(),
  ])

  return (
    <div className="flex flex-col min-h-screen">
      <section className="relative w-full h-[315px] bg-[#3b444f]">
        {/* Dekorace mají vlastní ořezanou vrstvu POD vyhledáváním — overflow-hidden
            nesmí být na sekci a vlna nesmí být nad titulkem, jinak ořízne/překreslí
            rozbalený našeptávač, který přesahuje pod hero. */}
        <div className="absolute inset-0 overflow-hidden">
          <StaticHeroImage
            imageUrl={heroPlace?.imageUrl ?? HOMEPAGE_HERO_IMAGE_FALLBACK}
            alt={heroPlace?.title ?? ''}
            styleCss={heroPlace?.styleCss ?? undefined}
          />

          <StaticHeroOverlay filterId="blurFilterHome" />

          <StaticHeroWave />
        </div>

        <StaticHeroTitle
          // Skrytý h1 (sr-only) — nese klíčová slova pro vyhledávače a čtečky;
          // „Najdi si svůj cíl" zůstává jako nápověda v poli hledání.
          title={'Ara.cz – cestovní průvodce po světě'}
          placeholderExample={heroPlace?.title ?? null}
          popularDestinations={popularDestinations}
        />
      </section>

      <main
        id="obsah"
        tabIndex={-1}
        // w-full je NUTNÉ: main je flex item (rodič flex-col) a mx-auto vypíná
        // stretch — bez explicitní šířky se main sizuje podle min-content
        // obsahu (např. truncate řádky v „Co je nového") a na mobilu přetéká.
        className="w-full max-w-7xl mx-auto px-4 md:px-12 py-16 text-center focus:outline-none"
      >
        {/* „Medailonek webu" mezi herem a první sekcí — stejná typografie jako
            text „o mně" na profilu (17 px, #4a4a4a, max 720 px na středu).
            Zobrazuje se JEN když je vyplněný v adminu (globál Homepage →
            Title); prázdné pole = žádný text a první sekce sedí rovnou pod
            herem (mezeru pod textem proto nese text sám, ne sekce). */}
        {homepage?.title?.trim() && (
          <p className="mx-auto mb-12 max-w-[720px] whitespace-pre-line text-[17px] leading-relaxed text-[#4a4a4a]">
            {homepage.title.trim()}
          </p>
        )}

        {/* Dnešní akční nabídky — top letenky a zájezdy dne napříč destinacemi
            (denní sync /api/sync-affiliate-deals) HNED pod herem; bez dat se
            sekce nezobrazí (mb nese wrapper, ať bez ní nevzniká mezera). */}
        {(topDeals.flights.length > 0 || topDeals.tours.length > 0) && (
          <div className="mb-16">
            <DealsOfDaySection flights={topDeals.flights} tours={topDeals.tours} />
          </div>
        )}

        <InspirationSection data={inspiration} />

        <div className="mt-16">
          <InspirationPlacesSection places={inspiration?.places ?? []} />
        </div>

        <div className="mt-16">
          <WhatsNewSection items={activity.items} renderedAt={activity.fetchedAt} />
        </div>

        {/* Panel „Připrav se na cestu" — legacy homepage parita; obecné
            partnerské odkazy (bez deep-linků, z homepage není kam cílit). */}
        <div className="mt-16">
          <HomepagePreparationSection />
        </div>

        <div className="mt-16">
          <ReadingTopicsSection rubriky={inspiration?.rubriky ?? []} />
        </div>
      </main>
    </div>
  )
}
