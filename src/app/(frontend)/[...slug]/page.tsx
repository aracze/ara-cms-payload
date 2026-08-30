import { Page } from '@/components/layout/page/page'
import { Article } from '@/components/layout/article/article'
import { LeaderboardAd } from '@/components/features/article-ad'
import { fetchPageLightByFullSlug, pageHasArticlesBySlug } from '@/lib/payload'
import { buildPageTitle, rootPageCategories } from '@/lib/page-title'
import { PageCategory } from '@/types/payload'
import { getArticleImageUrl } from '@/lib/utils'
import { resolveSlugRoute } from '@/lib/resolve-route'
import { absoluteUrl, buildPageMetadata, resolveSeoDescription, resolveSeoTitle } from '@/lib/seo'
import { Metadata } from 'next'
import { notFound } from 'next/navigation'

// Streamované dynamické vykreslování (záměrně NE celostránková ISR cache):
// s ISR čekala navigace na kompletní stránku bez jakékoliv odezvy (u studené
// stránky i sekundy „mrtvého" webu). Dynamický režim streamuje — loading.tsx
// (kostra) se zobrazí okamžitě a obsah do ní doteče. Prefetch odkazů pak
// stahuje jen lehký shell po loading boundary (pár KB), ne celé stránky.
// Rychlost obsahu zajišťuje cache dat na úrovni fetch (viz lib/payload.ts).
export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ slug: string[] }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const fullSlug = slug.join('/')

  // Stejné rozhodnutí stránka/článek/404 jako layout a render (React cache →
  // žádné opakované DB dotazy). Metadata skládá src/lib/seo.ts: SEO titulek
  // a popisek z CMS (fallback: kontextový titulek / začátek textu), absolutní
  // canonical, Open Graph s hero fotkou.
  const resolution = await resolveSlugRoute(fullSlug)

  if (resolution.kind === 'page') {
    const page = resolution.page

    let rootPage = page
    if (!rootPageCategories.includes(page.category)) {
      const rootSegment = page.fullSlug.replace(/^\/+/, '').split('/')[0]
      if (rootSegment) {
        // Titulek potřebuje jen title/category kořene — lehký fetch (sdílený
        // s ancestor cache), ne celý detail stránky.
        const { data: rootPageData } = await fetchPageLightByFullSlug(rootSegment)
        rootPage = rootPageData?.pages[0] || page
      }
    }

    // Náhled pro sdílení = hero fotka stránky (u podstránek fotka kořenového
    // místa — stejné pravidlo jako getHeroImage v komponentě Page).
    const heroOwner = rootPageCategories.includes(page.category) ? page : rootPage
    const { title } = resolveSeoTitle(page.meta, buildPageTitle(page, rootPage))

    return buildPageMetadata({
      title,
      description: resolveSeoDescription(page.meta, page.text),
      path: page.fullSlug,
      imageUrl: heroOwner.featuredImage?.image?.url ?? null,
    })
  }

  if (resolution.kind === 'article') {
    const { article } = resolution
    // Kanonická adresa = mainPage + slug (článek může viset i pod vedlejšími
    // stránkami; ty odkazují sem). Bez mainPage aspoň aktuální cesta.
    const canonicalPath = article.mainPage?.fullSlug
      ? `${article.mainPage.fullSlug}/${article.slug}`
      : `/${fullSlug}`
    const author = article.createdByPublic
    const { title } = resolveSeoTitle(article.meta, article.title)

    return buildPageMetadata({
      title,
      description: resolveSeoDescription(article.meta, article.text),
      path: canonicalPath,
      imageUrl: getArticleImageUrl(article),
      type: 'article',
      publishedTime: article.publishedAt ?? article.createdAt ?? null,
      modifiedTime: article.updatedAt ?? null,
      authors: author?.username ? [absoluteUrl(`/profil/${author.username}`)] : undefined,
    })
  }

  notFound()
}

export default async function PageRoute({ params }: Props) {
  const { slug } = await params
  const fullSlug = slug.join('/')

  // Předky (breadcrumbs, menu kontext) rozjedeme SOUBĚŽNĚ s detailem stránky —
  // jsou odvoditelné přímo ze slugu. React cache() je dedupuje, takže pozdější
  // await ve fetchAncestorChain už jen sáhne pro hotový výsledek (šetří celou
  // sériovou vlnu ~0,3–0,5 s na podstránkách). Fire-and-forget + catch: když
  // stránka neexistuje (článek/404), výsledky se prostě nepoužijí.
  // Předehříváme jen do rozumné hloubky hierarchie — bez stropu by uměle
  // dlouhá (např. nepřátelská) URL rozjela desítky zbytečných DB dotazů na
  // neexistující cestu. Skutečný detail se dohledá dál bez ohledu na strop.
  const MAX_PREWARM_DEPTH = 6
  const prewarmDepth = Math.min(slug.length, MAX_PREWARM_DEPTH)
  for (let i = 1; i < prewarmDepth; i++) {
    const prefix = slug.slice(0, i).join('/')
    void fetchPageLightByFullSlug(prefix).catch(() => {})
    // Kontext podnavigace bývá některý z předků — předehřejeme i levný počet
    // článků (viz contextFlags v Page), ať poslední vlna nečeká.
    void pageHasArticlesBySlug('/' + prefix).catch(() => {})
  }

  // Rozhodnutí stránka/článek/404 sdílíme s layoutem přes resolveSlugRoute
  // (React-cache → stejné DB dotazy, žádné opakování). Tvrdý 404 řeší už layout
  // NAD loading kostrou; tady jen vykreslíme obsah (notFound() zůstává jako
  // pojistka, kdyby se sem 404 dostal).
  const resolution = await resolveSlugRoute(fullSlug)
  // Spodní reklamní pruh (legacy bottomAds) — na stránkách míst i článcích;
  // homepage je samostatná route, tam pruh záměrně není.
  //
  // VÝJIMKA: statické stránky (O nás, Reklama, Podmínky). Jsou krátké, takže
  // pruh na nich končí jako nejvýraznější prvek pod pár odstavci — a na
  // „Reklamě" by to byla reklama na stránce, která reklamu prodává. Na
  // návštěvnosti těchto stránek se ztráta zobrazení neprojeví.
  if (resolution.kind === 'page')
    return (
      <>
        <Page page={resolution.page} />
        {resolution.page.category !== PageCategory.Staticka_stranka && <BottomAdStrip />}
      </>
    )
  if (resolution.kind === 'article')
    return (
      <>
        <Article article={resolution.article} contextSlug={resolution.parentSlug} />
        <BottomAdStrip />
      </>
    )

  notFound()
}

/** Spodní responzivní reklamní pruh pod obsahem stránky/článku. */
function BottomAdStrip() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-12 pt-4">
      <LeaderboardAd />
    </div>
  )
}
