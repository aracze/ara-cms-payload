import { Page } from '@/components/layout/page/page'
import { Article } from '@/components/layout/article/article'
import { AdSenseScript, LeaderboardAd } from '@/components/features/article-ad'
import {
  fetchPageByFullSlug,
  fetchPageLightByFullSlug,
  fetchArticleBySlug,
  pageHasArticlesBySlug,
} from '@/lib/payload'
import { buildPageTitle, rootPageCategories } from '@/lib/page-title'
import { isValidArticleParent } from '@/lib/utils'
import { resolveSlugRoute } from '@/lib/resolve-route'
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

  // 1. Try fetching as a Page
  const { data: pageData } = await fetchPageByFullSlug(fullSlug)

  if (pageData?.pages.length > 0) {
    const page = pageData.pages[0]

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

    return { title: buildPageTitle(page, rootPage) }
  }

  // 2. If not a page, try fetching as an Article (last segment = article slug)
  if (slug.length > 1) {
    const articleSlug = slug[slug.length - 1]
    const parentSlug = slug.slice(0, -1).join('/')
    const { data: articleData } = await fetchArticleBySlug(articleSlug, parentSlug)

    const article = articleData?.articles[0]
    // #21: článek uznáme jen pod platným rodičem (mainPage nebo některá z pages);
    // pod „duchem" (cizí/starou cestou) propadneme na notFound() níže.
    if (article && isValidArticleParent(parentSlug, articleData.validParentSlugs)) {
      const canonicalSlug = article.mainPage?.fullSlug
        ? `${article.mainPage.fullSlug}/${article.slug}`
        : null

      return {
        title: article.title,
        ...(canonicalSlug
          ? {
              alternates: {
                canonical: canonicalSlug,
              },
            }
          : {}),
      }
    }
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
  // Spodní reklamní pruh (legacy bottomAds) — na všech stránkách i článcích;
  // homepage je samostatná route, tam pruh záměrně není.
  if (resolution.kind === 'page')
    return (
      <>
        <Page page={resolution.page} />
        <BottomAdStrip />
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
      <AdSenseScript />
      <LeaderboardAd />
    </div>
  )
}
