import { StaticHeroWave } from '@/components/features/static-hero-wave'
import { Homepage as HomepageType } from '@/types/payload'
import { StaticHeroOverlay } from '@/components/features/static-hero-overlay'
import { StaticHeroTitle } from './static-hero-title'
import { StaticHeroImage } from '@/components/features/static-hero-image'
import { WhatsNewSection } from './whats-new-section'
import { InspirationSection } from './inspiration-section'
import { InspirationPlacesSection } from './inspiration-places-section'
import { ReadingTopicsSection } from './reading-topics-section'
import { fetchLatestActivity, fetchHomepageInspiration } from '@/lib/payload'

// Konfigurovatelné přes env (fallback zachovává původní chování), ať URL není
// natvrdo v kódu.
const HOMEPAGE_HERO_IMAGE =
  process.env.NEXT_PUBLIC_HOMEPAGE_HERO_IMAGE ||
  'https://res.cloudinary.com/ara/image/upload/homepage.jpg'

export const Homepage = async ({ homepage }: { homepage?: HomepageType | null }) => {
  // Obě sekce nezávisle — pomalejší z nich nesmí blokovat začátek té druhé.
  const [activity, inspiration] = await Promise.all([
    fetchLatestActivity(),
    fetchHomepageInspiration(),
  ])

  return (
    <div className="flex flex-col min-h-screen">
      <section className="relative w-full h-[315px] bg-[#3b444f]">
        {/* Dekorace mají vlastní ořezanou vrstvu POD vyhledáváním — overflow-hidden
            nesmí být na sekci a vlna nesmí být nad titulkem, jinak ořízne/překreslí
            rozbalený našeptávač, který přesahuje pod hero. */}
        <div className="absolute inset-0 overflow-hidden">
          <StaticHeroImage imageUrl={HOMEPAGE_HERO_IMAGE} />

          <StaticHeroOverlay filterId="blurFilterHome" />

          <StaticHeroWave />
        </div>

        <StaticHeroTitle title={'Najdi si svůj cíl'} />
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

        <InspirationSection data={inspiration} />

        <div className="mt-16">
          <InspirationPlacesSection places={inspiration?.places ?? []} />
        </div>

        <div className="mt-16">
          <WhatsNewSection items={activity.items} renderedAt={activity.fetchedAt} />
        </div>

        <div className="mt-16">
          <ReadingTopicsSection rubriky={inspiration?.rubriky ?? []} />
        </div>
      </main>
    </div>
  )
}
