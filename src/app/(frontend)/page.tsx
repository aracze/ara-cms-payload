import type { Metadata } from 'next'
import { fetchRootPages } from '@/lib/payload'
import { Homepage } from '@/components/layout/homepage/homepage'
import { buildPageMetadata, DEFAULT_DESCRIPTION, homepageJsonLd } from '@/lib/seo'

// Homepage má vlastní titulek s klíčovými slovy (výchozí „Ara.cz - Cestovní
// průvodce" z layoutu byl jen název), popisek, canonical a Open Graph.
// Bez fotky: hero fotka se losuje denně, náhled pro sdílení by tak byl
// pokaždé jiný.
export const metadata: Metadata = buildPageMetadata({
  title: { absolute: 'Ara.cz – Cestovní průvodce po světě: kam jet a co vidět' },
  description: DEFAULT_DESCRIPTION,
  path: '/',
})

// Dynamické vykreslování jako zbytek webu (/[...slug]). PROČ ne ISR jako dřív:
// hlavička od zavedení přihlášení čte cookie, a stránku, která sáhne na cookie,
// nelze předgenerovat — build na tom padal („couldn't be rendered statically").
// Data to nezdražuje: fetchRootPages jde přes `cached()`, takže se z databáze
// nečte znovu, opakuje se jen React render.
export const dynamic = 'force-dynamic'

export default async function Home() {
  const { data } = await fetchRootPages()

  return (
    <>
      {/* WebSite (+ vyhledávací pole ve výsledcích Googlu) a Organization. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: homepageJsonLd() }} />
      <Homepage homepage={data?.homepage} />
    </>
  )
}
