import { Page as PayloadPage, PageCategory } from '@/types/payload'
import { ArticlesList } from '@/components/features/articles-list'
import { ArticlesListClassic } from '@/components/features/articles-list-classic'
import { HeroSection } from './hero-section'
import { Subnavigation } from './subnavigation'
import { MainContent } from './main-content'
import { PlacesToVisit } from './places-to-visit'
import { ReviewsSection } from '@/components/features/reviews/reviews-section'
import { RelatedTouristPoints } from './related-tourist-points'
import { PreparationSection } from './preparation-section'
import { DealsSection, parseAffiliateDeals } from './deals-section'
import { ClimateSection, parseClimateNormals, climateHeading } from './climate-section'
import { WeatherNowSection, WeatherForecastSection, forecastHeading } from './weather-now-section'
import { fetchPlaceWeather } from '@/lib/weather'
import {
  fetchPageLightByFullSlug,
  fetchMediaUrlsByIds,
  fetchPageReviews,
  fetchPageReviewStats,
  fetchDerivedPlaceRatings,
  isPlaceListingCategory,
  type DerivedRatingPlace,
  type PageReviewStats,
  fetchTouristPointSiblings,
  pageHasArticlesBySlug,
  fetchPracticalInfoSections,
  fetchTeamSection,
  fetchInheritedAffiliateDeals,
} from '@/lib/payload'
import { TeamSection } from './team-section'
import { ABOUT_PAGE_SLUG } from '@/lib/team'
import { composePracticalInfoHtml } from '@/lib/practical-info'
import { fetchExchangeRate } from '@/lib/exchange-rate'
import { buildPageTitle, rootPageCategories } from '@/lib/page-title'
import {
  breadcrumbListJsonLd,
  buildBreadcrumbs,
  menuOwnerCategories,
  type Breadcrumb,
} from '@/lib/page-hierarchy'
import { breadcrumbsFromSlug, fetchAncestorChain } from '@/lib/page-ancestors'
import { getCurrentUser } from '@/lib/auth'
import { getPayloadURL, getSiteURL, websiteHref } from '@/lib/utils'
import { DEFAULT_COVER_BLUR, DEFAULT_COVER_POSITION, DEFAULT_COVER_URL } from '@/lib/default-cover'
import type { ReviewPublic } from '@/types/payload'

const exchangeRateCategories: PageCategory[] = [
  PageCategory.Misto_k_navstiveni,
  PageCategory.Turisticky_cil,
  // Praktické informace: kurz plní blok „Aktuální měna" ve vlastním textu
  // stránky i texty skládaných sekcí (Měna a ceny) — bez něj zůstane „--".
  PageCategory.Prakticke_informace,
]

export const Page = async ({ page }: { page: PayloadPage }) => {
  const pageChildren = page.children?.docs ?? []
  // Sekce „Co vidět" — rekurzivně vyřešený seznam (místa i cíle, viz
  // resolvePlacesToVisitUncached), NE `pageChildren` (ty zůstávají pro menu/taby
  // s ostatními kategoriemi — Praktické informace, Doprava...).
  const placesToVisit = page.resolvedPlacesToVisit ?? []

  // Akční nabídky — JSON z denního syncu přes type-guard; jen místa k navštívení.
  const ownAffiliateDeals =
    page.category === PageCategory.Misto_k_navstiveni
      ? parseAffiliateDeals(page.affiliate?.deals)
      : null
  // Místo bez vlastních nabídek dědí od NEJBLIŽŠÍHO předka, který je má
  // (Dubrovník → Chorvatsko); slugy z breadcrumbs od nejbližšího, bez stránky
  // samotné. Promise startuje hned, await až v poslední vlně s ostatními.
  const ancestorSlugsForDeals =
    !ownAffiliateDeals && page.category === PageCategory.Misto_k_navstiveni
      ? (page.breadcrumbs ?? [])
          .map((b) => b?.url)
          .filter((u): u is string => typeof u === 'string' && !!u && u !== page.fullSlug)
          .reverse()
      : []
  const inheritedDealsPromise =
    ancestorSlugsForDeals.length > 0
      ? fetchInheritedAffiliateDeals(ancestorSlugsForDeals)
      : Promise.resolve(null)

  // Nezávislé dotazy běží PARALELNĚ — sekvenční čekání (ancestors → menu →
  // kurz → obrázky) sčítalo ~0,3 s režii CMS za každý dotaz. React cache()
  // dedupuje sdílené ancestor fetche uvnitř větví.
  const childImageIdsEarly = placesToVisit
    .map<number | null>((c) => {
      const imgField = c.featuredImage?.image
      return typeof imgField === 'number' ? imgField : null
    })
    .filter((id): id is number => id !== null)

  const [rootPage, imageUrlMap, currentUser] = await Promise.all([
    fetchRootPage(page),
    fetchMediaUrlsByIds(childImageIdsEarly),
    getCurrentUser(),
  ])
  const safeRootPage = rootPage ?? page

  // Determine which Place "owns" the menu for this page.
  // e.g. on Dubrovník's Počasí → menuContext = Dubrovník's children
  // e.g. on Chorvatsko's Počasí → menuContext = Chorvatsko's children
  // (breadcrumbs i menuContext čtou stejné ancestor fetche — dedupováno.)
  const effectiveCurrencyCode = page.detail?.currencyCode || safeRootPage.detail?.currencyCode
  // Kurz dává smysl jen na stránkách typu „místo" (sidebar s časem/kurzem).
  // Na ostatních podstránkách by to byl jen zbytečný externí request navíc.
  const shouldFetchExchangeRate = exchangeRateCategories.includes(page.category)
  // Kurz rozjedeme hned (await až v poslední vlně), ale jen když se bude renderovat.
  const exchangePromise =
    shouldFetchExchangeRate && effectiveCurrencyCode
      ? fetchExchangeRate(effectiveCurrencyCode)
      : Promise.resolve(null)
  // Recenze mají jen turistické cíle (jako na legacy webu). Dotaz startuje hned,
  // await až v poslední vlně s ostatními.
  const reviewsPromise =
    page.category === PageCategory.Turisticky_cil
      ? fetchPageReviews(Number(page.id))
      : Promise.resolve(null)
  // Souhrny recenzí dětí-cílů (hvězdičky + počet ve výpisu „Co vidět…") —
  // jeden hromadný dotaz pro všechny cíle (vč. cílů „přibublaných" ze zanoření).
  const touristPointChildIds = placesToVisit
    .filter((c) => c.category?.trim() === PageCategory.Turisticky_cil)
    .map((c) => Number(c.id))
    .filter((id) => Number.isInteger(id))
  const reviewStatsPromise =
    touristPointChildIds.length > 0
      ? fetchPageReviewStats(touristPointChildIds)
      : Promise.resolve({})
  // Odvozené hodnocení míst — hvězdičky spočítané z recenzí turistických cílů
  // pod místem. Míří na dvě místa: do záhlaví TÉTO stránky (je-li místem) a na
  // dlaždice míst v „Co vidět". Kdo na hodnocení nemá nárok (země a regiony,
  // které se rozbalují na další místa) a co nemá dost recenzí, odfiltruje
  // fetchDerivedPlaceRatings — jeden dotaz na úroveň stromu, ne na dlaždici.
  // Kontinent (stránka bez rodiče) vypisuje země a ty nárok nikdy nemají — bez
  // této zkratky by se procházely děti všech zemí kontinentu (stovky řádků)
  // jen proto, aby se výsledek zahodil.
  const derivedRatingPlaces: DerivedRatingPlace[] = !page.parent
    ? []
    : [
        ...(isPlaceListingCategory(page.category) ? [page] : []),
        ...placesToVisit.filter((c) => isPlaceListingCategory(c.category)),
      ]
        .map((p) => ({
          id: Number(p.id),
          stopDisplayingChildPlaces: p.stopDisplayingChildPlaces,
        }))
        .filter((p) => Number.isInteger(p.id))
  const derivedPlaceRatingsPromise: Promise<Record<number, PageReviewStats>> =
    derivedRatingPlaces.length > 0
      ? fetchDerivedPlaceRatings(derivedRatingPlaces)
      : Promise.resolve({})
  // Sousední cíle pro pás „Další vyhledávaná Místa…" (jen na detailu cíle).
  const siblingsParentSlug =
    page.category === PageCategory.Turisticky_cil
      ? page.fullSlug
          .replace(/^\/+|\/+$/g, '')
          .split('/')
          .slice(0, -1)
          .join('/')
      : null
  const siblingsPromise = siblingsParentSlug
    ? fetchTouristPointSiblings(siblingsParentSlug, Number(page.id))
    : Promise.resolve([])
  const [breadcrumbs, menuContext] = await Promise.all([
    getBreadcrumbs(page),
    fetchMenuContext(page, safeRootPage),
  ])

  // Podstránka se vždy týká NEJBLIŽŠÍHO místa, do kterého je vložená — počasí pod
  // Košicemi je počasí Košic, ne Slovenska. Titulek i hero fotka proto berou
  // kontextové místo z menu (stejné jako legacy `getRootPage`), ne kořenovou zemi.
  const contextPlace = menuContext.contextPage
  // Graf „Průměrné měsíční teploty a srážky" — jen stránky kategorie Počasí
  // s daty z měsíčního syncu (/api/sync-climate-normals). Nadpis skloňuje
  // kontextové místo (počasí pod Londýnem je počasí Londýna, ne Anglie).
  const climateNormals =
    page.category === PageCategory.Pocasi ? parseClimateNormals(page.climateNormals) : null
  const climateLocative = contextPlace.detail?.locative || `v ${contextPlace.title}`
  // Druhý pád VČETNĚ předložky, jak ho drží admin („do Londýna", „na Maltu") —
  // nadpis z něj skládá „Nejlepší doba na cestu do Londýna".
  const climateGenitive = contextPlace.detail?.genitive || `do ${contextPlace.title}`
  // Živé počasí (OpenWeather One Call 3.0) — jen stránky Počasí, souřadnice
  // z kontextového místa (stránka počasí vlastní nemá). Promise startuje hned,
  // await až v poslední vlně s ostatními dotazy.
  const weatherLat = Number.parseFloat(contextPlace.detail?.latitude ?? '')
  const weatherLng = Number.parseFloat(contextPlace.detail?.longitude ?? '')
  const weatherPromise =
    page.category === PageCategory.Pocasi &&
    Number.isFinite(weatherLat) &&
    Number.isFinite(weatherLng)
      ? fetchPlaceWeather(weatherLat, weatherLng)
      : Promise.resolve(null)
  // Fotka: nejbližší místo, a když žádnou nemá, spadneme na zemi, ať hero nezůstane
  // prázdné (legacy mělo jen dvě úrovně, tady je fallback navíc).
  const cmsImageUrl = getHeroImage(page, contextPlace) ?? getHeroImage(page, safeRootPage)
  // Statická stránka nemá nad sebou žádné místo, ze kterého by fotku podědila,
  // takže bez vyplněného obrázku v CMS zůstal v heru holý tmavý pruh. Spadneme
  // proto na sdílenou výchozí obálku (stejnou, jakou mají profily) — jakmile se
  // v adminu vyplní vlastní fotka, má přednost.
  const isStaticPage = page.category === PageCategory.Staticka_stranka
  const useDefaultCover = isStaticPage && !cmsImageUrl
  // Sekce „Náš tým" patří jen na O nás (kdo web píše), ne na Reklamu ani Podmínky.
  const isAboutPage = isStaticPage && page.fullSlug === `/${ABOUT_PAGE_SLUG}`
  const imageUrl = useDefaultCover ? DEFAULT_COVER_URL : cmsImageUrl
  const pageTitle = buildPageTitle(page, contextPlace)

  // Sekundární menu se nezobrazuje na rubrikách ani statických stránkách.
  const showSubnavigation =
    page.category !== PageCategory.Rubrika && page.category !== PageCategory.Staticka_stranka

  // "Místa"/"Články" v sekundárním menu patří kontextovému místu (např. Chorvatsko),
  // ne aktuální podstránce (Vstupní podmínky). Data kontextové stránky načítáme jen když
  // se menu vůbec renderuje (jinak zbytečný fetch pro rubriky/statické stránky).
  const [
    practicalInfoSource,
    contextFlags,
    exchangeData,
    reviewsData,
    reviewStats,
    derivedPlaceRatings,
    siblings,
    practicalInfoSections,
    teamSection,
    inheritedDeals,
    placeWeather,
  ] = await Promise.all([
    fetchPracticalInfoSource(page, safeRootPage, menuContext.isSubPlace),
    (async (): Promise<{ hasPlaces: boolean; hasArticles: boolean }> => {
      if (!showSubnavigation) return { hasPlaces: false, hasArticles: false }
      if (menuContext.contextFullSlug === page.fullSlug) {
        // Kontext je aktuální stránka — máme její plná data (vč. článků).
        return {
          hasPlaces: (page.children?.docs?.length ?? 0) > 0,
          hasArticles: (page.articles?.length ?? 0) > 0,
        }
      }
      // Kontext je předek (Místo) — načteme ho lehce (je už v cache z předků)
      // a existenci článků zjistíme levným počtem místo těžkého detailu.
      // (Obojí je typicky předehřáté z route — viz prefire v [...slug]/page.tsx.)
      const [ctxRes, hasArticles] = await Promise.all([
        fetchPageLightByFullSlug(menuContext.contextFullSlug),
        pageHasArticlesBySlug(menuContext.contextFullSlug),
      ])
      const ctx = ctxRes.data.pages[0]
      return {
        hasPlaces: (ctx?.children?.docs?.length ?? 0) > 0,
        hasArticles: ctx ? hasArticles : false,
      }
    })(),
    exchangePromise,
    reviewsPromise,
    reviewStatsPromise,
    derivedPlaceRatingsPromise,
    siblingsPromise,
    // Složená stránka „Praktické informace" — texty sousedních podstránek
    // (děti kontextového místa) v jednom dotazu; jinde prázdné pole zdarma.
    page.category === PageCategory.Prakticke_informace
      ? fetchPracticalInfoSections(menuContext.contextFullSlug)
      : Promise.resolve([]),
    // Sekce „Náš tým" — jen na stránce O nás, jinde by šlo o dotaz nazdařbůh.
    isAboutPage ? fetchTeamSection() : Promise.resolve(null),
    inheritedDealsPromise,
    weatherPromise,
  ])

  // Vstupy sekce „Akční nabídky": vlastní data stránky, jinak zděděná od
  // předka — pak karty nesou PŘEDKOVO jméno, skloňování i fotku (chorvatská
  // letenka pod titulkem „do Dubrovníku" by byla zavádějící).
  const absoluteMediaUrl = (url: string | null | undefined): string | null =>
    url ? (url.startsWith('/') ? new URL(url, getPayloadURL()).toString() : url) : null
  const inheritedParsedDeals = inheritedDeals ? parseAffiliateDeals(inheritedDeals.deals) : null
  const dealsSection = ownAffiliateDeals
    ? {
        genitive: page.detail?.genitive || `do ${page.title}`,
        placeTitle: page.title,
        // Vlastní fotka stránky (bez fallbacku na kořen jako u hera — cizí
        // fotka by u nabídky destinace byla zavádějící).
        placeImageUrl: absoluteMediaUrl(page.featuredImage?.image?.url),
        deals: ownAffiliateDeals,
      }
    : inheritedDeals && inheritedParsedDeals
      ? {
          genitive: inheritedDeals.genitive || `do ${inheritedDeals.title}`,
          placeTitle: inheritedDeals.title,
          placeImageUrl: absoluteMediaUrl(inheritedDeals.imageUrl),
          deals: inheritedParsedDeals,
        }
      : null
  const contextHasPlaces = contextFlags.hasPlaces
  const contextHasArticles = contextFlags.hasArticles

  // Praktické informace = složená stránka (legacy parita): vlastní text (úvod,
  // karty Nice-to-know) + sekce z textů podstránek místa s kotvami a odkazy
  // na samostatné stránky. Bez nalezených sekcí zůstává jen vlastní text.
  const mainText =
    page.category === PageCategory.Prakticke_informace && practicalInfoSections.length > 0
      ? composePracticalInfoHtml(page.text, practicalInfoSections, {
          currencyCode: effectiveCurrencyCode,
          exchangeRate: exchangeData?.rate,
        })
      : page.text

  // Pás „Další vyhledávaná Místa…" — jen při více než 2 sousedech (legacy
  // pravidlo). Obrázky a rodič (titulek + lokál pro nadpis) se dotahují až
  // tady; oba dotazy jsou cachované a rodič je už předehřátý z drobečků.
  let relatedItems: { id: number; title: string; fullSlug: string; imageUrl: string | null }[] = []
  let relatedParent: { title: string; fullSlug: string; locative: string | null } | null = null
  if (siblingsParentSlug && siblings.length > 2) {
    const [siblingImageMap, parentRes] = await Promise.all([
      fetchMediaUrlsByIds(siblings.map((s) => s.imageId).filter((id): id is number => id !== null)),
      fetchPageLightByFullSlug(siblingsParentSlug),
    ])
    const parent = parentRes.data.pages[0]
    if (parent) {
      relatedParent = {
        title: parent.title,
        fullSlug: parent.fullSlug,
        locative: parent.detail?.locative ?? null,
      }
      relatedItems = siblings.map((s) => ({
        id: s.id,
        title: s.title,
        fullSlug: s.fullSlug,
        imageUrl: s.imageId != null ? (siblingImageMap.get(s.imageId) ?? null) : null,
      }))
    }
  }

  // Build a map from child page ID → image URL (imageUrlMap načteno paralelně výše)
  // — jen pro PlacesToVisit, proto ze `placesToVisit`, ne `pageChildren`.
  const childImageUrlMap = new Map<number | string, string>()
  for (const child of placesToVisit) {
    const imgField = child.featuredImage?.image
    const imgId = typeof imgField === 'number' ? imgField : null
    if (imgId && imageUrlMap.has(imgId)) {
      childImageUrlMap.set(child.id, imageUrlMap.get(imgId)!)
    } else if (
      typeof imgField === 'object' &&
      imgField !== null &&
      'url' in imgField &&
      imgField.url
    ) {
      childImageUrlMap.set(child.id, String(imgField.url))
    }
  }

  // Map center from page detail
  const mapCenter =
    page.detail?.latitude && page.detail?.longitude
      ? {
          lat: parseFloat(page.detail.latitude),
          lng: parseFloat(page.detail.longitude),
        }
      : null
  const mapZoom = page.detail?.googleMapsZoom ?? 7

  // Souhrn recenzí pro hero (hvězdičky + počet pod názvem cíle) — spočtený
  // z už načtených recenzí, žádný dotaz navíc.
  const heroRating =
    reviewsData && reviewsData.reviews.length > 0
      ? {
          avg:
            reviewsData.reviews.reduce((sum, r) => sum + r.rating, 0) / reviewsData.reviews.length,
          count: reviewsData.reviews.length,
        }
      : null

  // Místo (město, ostrov) vlastní recenze nemá — v záhlaví ukazuje odvozený
  // průměr z recenzí svých cílů. Nikdy obojí: odvozené hodnocení se počítá jen
  // pro kategorie míst, zatímco `heroRating` patří cíli.
  const derivedHeroRating = heroRating ? null : (derivedPlaceRatings[Number(page.id)] ?? null)

  // Hodnocení na dlaždicích „Co vidět": cíl ukazuje vlastní recenze (od první,
  // jako všude jinde na webu), místo odvozený průměr (od tří recenzí výš).
  // Id stránek se nepřekrývají, takže obě mapy stačí sloučit.
  const cardRatings = { ...reviewStats, ...derivedPlaceRatings }

  // Karta „Praktické informace" v pravém sloupci (jen turistické cíle):
  // adresa, oficiální web, mapa s pinem cíle; autora si MainContent bere
  // z createdByPublic (přesouvá se z místa pod textem).
  const touristPointInfo =
    page.category === PageCategory.Turisticky_cil
      ? {
          address: page.detail?.googleMapsAddress ?? null,
          websiteUrl: page.detail?.website ?? null,
          mapCenter,
          mapZoom,
          title: page.title,
          fullSlug: page.fullSlug,
        }
      : null

  // Karta „Praktické informace" v pravém sloupci u míst (legacy `_pageHighlights`/
  // `_weatherPageHighlights`): místo bez vlastní podstránky Praktické informace
  // (San Francisco) zdědí tu nejbližšího předka (USA) — a nadpis karty se pak
  // musí týkat TOHO předka, ne aktuální stránky, jinak by odkaz na USA nesl
  // titulek San Francisca.
  const ownPracticalInfoChild = pageChildren.find(
    (child) => child.category === PageCategory.Prakticke_informace,
  )
  const practicalInfoChild =
    ownPracticalInfoChild ??
    practicalInfoSource.children.find(
      (child) => child.category === PageCategory.Prakticke_informace,
    )
  const practicalInfoOwner = ownPracticalInfoChild ? page : practicalInfoSource.sourcePage
  const practicalInfo = practicalInfoChild
    ? {
        fullSlug: practicalInfoChild.fullSlug,
        ownerTitle: practicalInfoOwner.title,
        ownerGenitive: practicalInfoOwner.detail?.genitive ?? null,
      }
    : null

  return (
    <div className="flex flex-col bg-white transition-all duration-500">
      {/* Strukturovaná data pro vyhledávače (TouristAttraction + AggregateRating
          + recenze) — Google pak může u výsledku zobrazit hvězdičky. Jen na
          detailu cíle s alespoň jednou recenzí. */}
      {heroRating && reviewsData && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: touristPointJsonLd(page, reviewsData.reviews, heroRating),
          }}
        />
      )}
      {/* Drobečky pro vyhledávače (BreadcrumbList) — cesta ve výsledku hledání. */}
      {breadcrumbs.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: breadcrumbListJsonLd(
              breadcrumbs,
              { title: pageTitle, href: page.fullSlug },
              getSiteURL(),
            ),
          }}
        />
      )}
      <article key={page.id} className="w-full">
        {/* 1. HERO SECTION (initial-photo) */}
        <HeroSection
          title={pageTitle}
          imageUrl={imageUrl}
          styleCss={
            useDefaultCover
              ? DEFAULT_COVER_POSITION
              : page.featuredImage?.featureImageStyleCss || undefined
          }
          blurDataURL={useDefaultCover ? DEFAULT_COVER_BLUR : undefined}
          filterId={`blurFilter-${page.id}`}
          breadcrumbs={breadcrumbs}
          rating={heroRating ?? derivedHeroRating}
          // Místo posílá klik na výpis cílů — vlastní sekci recenzí nemá.
          ratingHref={derivedHeroRating ? '#mista' : '#recenze'}
          ratingCountSuffix={derivedHeroRating ? 'cílů' : undefined}
        />

        {/* Sub-navigation bar style — not shown on rubric or static content pages */}
        {showSubnavigation && (
          <Subnavigation
            contextTitle={menuContext.contextTitle}
            contextFullSlug={menuContext.contextFullSlug}
            pageChildren={menuContext.menuChildren}
            currentPageFullSlug={page.fullSlug}
            hasPlaces={contextHasPlaces}
            hasArticles={contextHasArticles}
            // Turistický cíl je v menu schovaný (patří pod sekci „Místa" svého
            // místa), takže by jinak nesvítilo nic — zvýrazníme „Místa", stejně
            // jako článek zvýrazňuje „Články".
            activeSection={page.category === PageCategory.Turisticky_cil ? 'mista' : undefined}
          />
        )}

        {/* 2. CONTENT AREA */}
        <MainContent
          text={mainText}
          pageCategory={page.category}
          timezone={page.detail?.timezone || safeRootPage?.detail?.timezone}
          currencyCode={effectiveCurrencyCode}
          exchangeRate={exchangeData?.rate}
          practicalInfo={practicalInfo}
          createdByPublic={page.createdByPublic}
          touristPointInfo={touristPointInfo}
          // Aktuální počasí nad textem „Kdy jet…", klima a předpověď pod ním —
          // pořadí bloků jako na starém webu.
          aboveText={
            placeWeather ? (
              <WeatherNowSection weather={placeWeather} locative={climateLocative} />
            ) : null
          }
          belowText={
            teamSection ? (
              <TeamSection {...teamSection} />
            ) : climateNormals || placeWeather ? (
              <>
                {climateNormals && (
                  <ClimateSection
                    normals={climateNormals}
                    locative={climateLocative}
                    genitive={climateGenitive}
                  />
                )}
                {placeWeather && (
                  <WeatherForecastSection weather={placeWeather} locative={climateLocative} />
                )}
              </>
            ) : null
          }
          preHeadings={
            placeWeather
              ? [
                  {
                    id: 'aktualni-pocasi',
                    text: `Aktuální počasí ${climateLocative}`,
                    level: 2,
                  },
                ]
              : undefined
          }
          extraHeadings={[
            ...(climateNormals
              ? [
                  {
                    id: 'prumerne-teploty-a-srazky',
                    text: climateHeading(climateGenitive),
                    level: 2,
                  },
                ]
              : []),
            ...(placeWeather && placeWeather.days.length > 0
              ? [
                  {
                    id: 'predpoved-pocasi',
                    text: forecastHeading(placeWeather, climateLocative),
                    level: 2,
                  },
                ]
              : []),
          ]}
          // Na stránkách počasí patří podpis autora až za předpověď (rozhodnutí
          // uživatele) — mezi textem a grafy by rozdělil související sekce.
          contributorAtEnd={page.category === PageCategory.Pocasi}
          centerColumn={isStaticPage}
        />

        {/* Recenze — jen turistické cíle (parita s legacy webem) */}
        {reviewsData && (
          <ReviewsSection
            pageId={Number(page.id)}
            pageTitle={page.title}
            reviews={reviewsData.reviews}
            // Kam se vrátit po přihlášení z pruhu nad formulářem recenze.
            backTo={page.fullSlug}
          />
        )}

        {/* Další cíle stejného místa (legacy „Další vyhledávaná Místa…") */}
        {relatedParent && (
          <RelatedTouristPoints
            items={relatedItems}
            parentTitle={relatedParent.title}
            parentFullSlug={relatedParent.fullSlug}
            parentLocative={relatedParent.locative}
          />
        )}

        {/* Akční nabídky (nejlevnější letenka Kiwi + zájezd Invia) — jen místa
            k navštívení, NAD sekcí „Co vidět" (legacy parita s _highlights.gsp).
            Data plní denní sync /api/sync-affiliate-deals; místo bez vlastních
            dat dědí nabídky nejbližšího předka; jinak se sekce nezobrazí. */}
        {dealsSection && <DealsSection {...dealsSection} />}

        {/* 3. PLACES TO VISIT SECTION */}
        {placesToVisit.length > 0 && (
          <PlacesToVisit
            pageChildren={placesToVisit}
            mapCenter={mapCenter}
            mapZoom={mapZoom}
            imageUrlMap={childImageUrlMap}
            parentLocative={page.detail?.locative ?? null}
            reviewStats={reviewStats}
            cardRatings={cardRatings}
            showAnalyticsDebug={currentUser?.isAdmin ?? false}
          />
        )}

        {/* Příprava do … (pojištění, zájezdy, ubytování, auto, praktické
            informace) — jen místa k navštívení, mezi „Co vidět" a články
            (legacy parita). */}
        {page.category === PageCategory.Misto_k_navstiveni && (
          <PreparationSection
            genitive={page.detail?.genitive || `do ${page.title}`}
            affiliate={page.affiliate}
            practicalInfo={practicalInfo}
          />
        )}

        {/* Rubriky používají mřížkový layout, ostatní stránky (místa k navštívení)
            klasický vertikální seznam s reklamním sloupcem. */}
        {page.articles?.length > 0 &&
          (page.category === PageCategory.Rubrika ? (
            <ArticlesList articles={page.articles} parentFullSlug={page.fullSlug} />
          ) : (
            <ArticlesListClassic
              articles={page.articles}
              parentFullSlug={page.fullSlug}
              destinationLocative={page.detail?.locative}
            />
          ))}
      </article>
    </div>
  )
}

/**
 * JSON-LD pro detail turistického cíle: TouristAttraction s AggregateRating
 * a jednotlivými recenzemi (schema.org). Znak menšítka se escapuje na
 * unicode sekvenci (viz replace níže), aby obsah recenze nemohl utéct
 * ze script tagu.
 */
function touristPointJsonLd(
  page: PayloadPage,
  reviews: ReviewPublic[],
  rating: { avg: number; count: number },
): string {
  const lat = page.detail?.latitude ? parseFloat(page.detail.latitude) : null
  const lng = page.detail?.longitude ? parseFloat(page.detail.longitude) : null

  const data = {
    '@context': 'https://schema.org',
    '@type': 'TouristAttraction',
    name: page.title,
    url: getSiteURL() + page.fullSlug,
    ...(page.detail?.googleMapsAddress ? { address: page.detail.googleMapsAddress } : {}),
    ...(page.detail?.website ? { sameAs: websiteHref(page.detail.website) } : {}),
    ...(lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
      ? { geo: { '@type': 'GeoCoordinates', latitude: lat, longitude: lng } }
      : {}),
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: Math.round(rating.avg * 10) / 10,
      reviewCount: rating.count,
      bestRating: 5,
      worstRating: 1,
    },
    // Do JSON-LD stačí VZOREK (nejnovějších 10) — vyhledávače víc nepotřebují
    // a u oblíbeného cíle by kompletní výpis zbytečně nafukoval HTML;
    // souhrn drží aggregateRating a plný výpis je v těle stránky.
    review: reviews.slice(0, 10).map((r) => ({
      '@type': 'Review',
      author: { '@type': 'Person', name: r.authorName },
      ...(r.reviewedAt ? { datePublished: r.reviewedAt.slice(0, 10) } : {}),
      reviewBody: r.body,
      reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5, worstRating: 1 },
    })),
  }
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

function getHeroImage(page: PayloadPage, rootPage: PayloadPage) {
  let pageForHeroImage = page
  if (!rootPageCategories.includes(page.category)) {
    pageForHeroImage = rootPage
  }
  return pageForHeroImage.featuredImage?.image?.url
    ? pageForHeroImage.featuredImage.image.url.startsWith('/')
      ? new URL(pageForHeroImage.featuredImage.image.url, getPayloadURL()).toString()
      : pageForHeroImage.featuredImage.image.url
    : null
}

async function fetchRootPage(page: PayloadPage): Promise<PayloadPage> {
  if (rootPageCategories.includes(page.category)) {
    return page
  }

  const ancestors = await fetchAncestorChain(page.fullSlug)
  // Find the first valid root page in the chain
  for (const ancestor of ancestors) {
    if (!('isPlaceholder' in ancestor) && rootPageCategories.includes(ancestor.category)) {
      return ancestor
    }
  }

  return page
}

async function fetchMenuContext(
  page: PayloadPage,
  rootPage: PayloadPage,
): Promise<{
  contextTitle: string
  contextFullSlug: string
  /** Stránka kontextového místa — kromě menu z ní jde titulek a hero fotka. */
  contextPage: PayloadPage
  menuChildren: PayloadPage['children']['docs']
  isSubPlace: boolean
}> {
  if (menuOwnerCategories.includes(page.category)) {
    const ancestors = await fetchAncestorChain(page.fullSlug)
    const hasParentMenuOwner = ancestors.some(
      (ancestor) =>
        !('isPlaceholder' in ancestor) && menuOwnerCategories.includes(ancestor.category),
    )

    return {
      contextTitle: page.title,
      contextFullSlug: page.fullSlug,
      contextPage: page,
      menuChildren: page.children?.docs ?? [],
      isSubPlace: hasParentMenuOwner,
    }
  }

  const ancestors = await fetchAncestorChain(page.fullSlug)
  // Walk backwards through resolved ancestors to find the nearest Place
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const ancestor = ancestors[i]
    if (!('isPlaceholder' in ancestor) && menuOwnerCategories.includes(ancestor.category)) {
      const isRoot = ancestor.fullSlug === rootPage.fullSlug
      return {
        contextTitle: ancestor.title,
        contextFullSlug: ancestor.fullSlug,
        contextPage: ancestor,
        menuChildren: ancestor.children?.docs ?? [],
        isSubPlace: !isRoot,
      }
    }
  }

  return {
    contextTitle: rootPage.title,
    contextFullSlug: rootPage.fullSlug,
    contextPage: rootPage,
    menuChildren: rootPage.children?.docs ?? [],
    isSubPlace: false,
  }
}

async function fetchPracticalInfoSource(
  page: PayloadPage,
  rootPage: PayloadPage,
  isSubPlace: boolean,
): Promise<{ sourcePage: PayloadPage; children: PayloadPage['children']['docs'] }> {
  if (!isSubPlace) {
    return { sourcePage: rootPage, children: rootPage.children?.docs ?? [] }
  }

  const ancestors = await fetchAncestorChain(page.fullSlug)

  // Prefer the nearest ancestor that has a Praktické informace child.
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const ancestor = ancestors[i]
    if ('isPlaceholder' in ancestor) continue

    const children = ancestor.children?.docs ?? []
    const hasPracticalInfo = children.some(
      (child) => child.category === PageCategory.Prakticke_informace,
    )

    if (hasPracticalInfo) {
      return { sourcePage: ancestor, children }
    }
  }

  return { sourcePage: rootPage, children: rootPage.children?.docs ?? [] }
}

async function getBreadcrumbs(page: PayloadPage): Promise<Breadcrumb[]> {
  // Drobečky jdou po HIERARCHII v CMS, ne po URL — jinak z nich vypadnou
  // stránky s `includeInChildUrlPaths: false` (např. „Kalifornie" nad San
  // Franciscem). Detaily pravidel viz buildBreadcrumbs.
  if (page.breadcrumbs?.length) {
    return buildBreadcrumbs(page)
  }

  // Pojistka pro stránku bez uloženého řetězce (starý import, který ještě
  // neprošel resave pluginu): dopočítáme předky ze slugu jako dřív, ať drobečky
  // úplně nezmizí. Skryté stránky v nich pak chybí — proto jen fallback.
  return breadcrumbsFromSlug(page.fullSlug)
}
