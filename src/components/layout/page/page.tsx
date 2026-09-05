import { Page as PayloadPage, PageCategory } from '@/types/payload'
import { ArticlesList } from '@/components/features/articles-list'
import { ArticlesListClassic } from '@/components/features/articles-list-classic'
import { HeroSection } from './hero-section'
import { Subnavigation } from './subnavigation'
import { MainContent } from './main-content'
import { PlacesToVisit } from './places-to-visit'
import { ReviewsSection } from '@/components/features/reviews/reviews-section'
import { RelatedTouristPoints } from './related-tourist-points'
import { PreparationSection, accommodationHref } from './preparation-section'
import { AccommodationMapSection } from './accommodation-map-section'
import {
  PracticalInfoLinks,
  practicalInfoPanelDefs,
  type PracticalInfoLinkItem,
} from './practical-info-links'
import { DealsSection, parseAffiliateDeals } from './deals-section'
import { ClimateSection, parseClimateNormals, climateHeading } from './climate-section'
import { WeatherNowSection, WeatherForecastSection, forecastHeading } from './weather-now-section'
import { WeatherOverviewSection, type WeatherOverviewItem } from './weather-overview-section'
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
  fetchInheritedPlaceDetail,
  EMPTY_INHERITED_PLACE_DETAIL,
  type InheritedPlaceDetail,
  fetchWeatherOverviewPlaces,
  fetchPlaceWeatherChild,
  fetchAccommodationMapData,
} from '@/lib/payload'
import { extractSeasonalityBlock, seasonFromClimate } from '@/lib/seasonality'
import { TeamSection } from './team-section'
import { ABOUT_PAGE_SLUG } from '@/lib/team'
import { composePracticalInfoHtml } from '@/lib/practical-info'
import { fetchExchangeRate } from '@/lib/exchange-rate'
import { buildPageTitle, getGenitivePlace, rootPageCategories } from '@/lib/page-title'
import {
  ancestorSlugsNearestFirst,
  breadcrumbListJsonLd,
  buildBreadcrumbs,
  menuOwnerCategories,
  type Breadcrumb,
} from '@/lib/page-hierarchy'
import { absoluteUrl, ogImageUrl, toJsonLd, touristDestinationJsonLd } from '@/lib/seo'
import { resolvePageSeo } from '@/lib/page-seo'
import { breadcrumbsFromSlug, fetchAncestorChain } from '@/lib/page-ancestors'
import { getCurrentUser } from '@/lib/auth'
import { getPayloadURL, getSiteURL, websiteHref } from '@/lib/utils'
import { DEFAULT_COVER_BLUR, DEFAULT_COVER_POSITION, DEFAULT_COVER_URL } from '@/lib/default-cover'
import type { ReviewPublic } from '@/types/payload'

/** Kategorie s panelem „Aktuální info" (čas + kurz) — viz MainContent. */
const placePanelCategories: PageCategory[] = [
  PageCategory.Misto_k_navstiveni,
  PageCategory.Turisticky_cil,
]

/**
 * Má text stránky kartu Nice-to-know? Karta „čas" i „měna" berou hodnotu ze
 * zděděného detailu, a blok může editor vložit do JAKÉKOLI kategorie — proto se
 * kontroluje obsah, ne jen kategorie. Hledá se v už načteném JSON (žádný dotaz).
 */
function hasNiceToKnowBlock(text: unknown): boolean {
  if (!text || typeof text !== 'object') return false
  return JSON.stringify(text).includes('niceToKnowBlock')
}

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
  // Předci od NEJBLIŽŠÍHO — sdílený vstup pro všechno, co se dědí po hierarchii
  // (nabídky, měna, časové pásmo). Bere se z breadcrumbs, ne z adresy, ať v řetězu
  // zůstanou předci skrytí z URL (viz ancestorSlugsNearestFirst).
  const ancestorSlugs = ancestorSlugsNearestFirst(page)
  // Místo bez vlastních nabídek dědí od NEJBLIŽŠÍHO předka, který je má
  // (Dubrovník → Chorvatsko). Promise startuje hned, await až v poslední vlně.
  // `.catch` tu MUSÍ být: promise se čeká až o 300 řádků dál, takže když mezitím
  // spadne jiný dotaz, zůstala by odmítnutá promise bez obsluhy (unhandledRejection).
  const inheritedDealsPromise =
    !ownAffiliateDeals &&
    page.category === PageCategory.Misto_k_navstiveni &&
    ancestorSlugs.length > 0
      ? fetchInheritedAffiliateDeals(ancestorSlugs).catch(() => null)
      : Promise.resolve(null)

  // Měna a časové pásmo se dědí stejně (Toulouse → Francie, Kiži → Karelie):
  // u potomků zůstávají políčka prázdná, takže přechod země na euro je jedna
  // změna na jednom místě. Vlastní hodnota vždy vyhrává — tím se řeší země
  // s víc měnami (výjimka u regionu). Dotaz jde jen když stránce něco chybí
  // a běží v první vlně, aby nepřidal další sekvenční čekání.
  // Selhání dotazu nesmí shodit celou stránku: sedí v `Promise.all` první vlny,
  // takže bez `.catch` by jeden výpadek databáze při dohledávání měny znamenal
  // chybu 500 místo chybějících hodin a kurzu (dřív se hodnoty braly z už
  // načtených dat, takže tahle cesta selhat neumělo).
  //
  // Ptáme se jen tam, kde se hodnota SKUTEČNĚ VYKRESLÍ: panel s časem a kurzem
  // mají místa a cíle, kurz navíc složené Praktické informace — a kdekoli může
  // být v textu karta Nice-to-know (čas/měna), proto ještě kontrola obsahu.
  // Bez toho platily dotaz i stránky jako Doprava nebo Zdraví, které výsledek
  // jen zahodí.
  const ownCurrencyCode = page.detail?.currencyCode?.trim() || null
  const ownTimezone = page.detail?.timezone?.trim() || null
  const rendersInheritedDetail =
    placePanelCategories.includes(page.category) ||
    exchangeRateCategories.includes(page.category) ||
    hasNiceToKnowBlock(page.text)
  const inheritedDetailPromise: Promise<InheritedPlaceDetail> =
    rendersInheritedDetail && (!ownCurrencyCode || !ownTimezone) && ancestorSlugs.length > 0
      ? fetchInheritedPlaceDetail(ancestorSlugs).catch(() => EMPTY_INHERITED_PLACE_DETAIL)
      : Promise.resolve(EMPTY_INHERITED_PLACE_DETAIL)

  // Nezávislé dotazy běží PARALELNĚ — sekvenční čekání (ancestors → menu →
  // kurz → obrázky) sčítalo ~0,3 s režii CMS za každý dotaz. React cache()
  // dedupuje sdílené ancestor fetche uvnitř větví.
  const childImageIdsEarly = placesToVisit
    .map<number | null>((c) => {
      const imgField = c.featuredImage?.image
      return typeof imgField === 'number' ? imgField : null
    })
    .filter((id): id is number => id !== null)

  const [rootPage, imageUrlMap, currentUser, inheritedDetail] = await Promise.all([
    fetchRootPage(page),
    fetchMediaUrlsByIds(childImageIdsEarly),
    getCurrentUser(),
    inheritedDetailPromise,
  ])
  const safeRootPage = rootPage ?? page

  // Determine which Place "owns" the menu for this page.
  // e.g. on Dubrovník's Počasí → menuContext = Dubrovník's children
  // e.g. on Chorvatsko's Počasí → menuContext = Chorvatsko's children
  // (breadcrumbs i menuContext čtou stejné ancestor fetche — dedupováno.)
  const effectiveCurrencyCode = ownCurrencyCode ?? inheritedDetail.currencyCode
  const effectiveTimezone = ownTimezone ?? inheritedDetail.timezone
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
  // Data grafu klimatu se čtou vždy, ale vykreslí se jen u konkrétních míst —
  // u zemí by se počítala z jejich geometrického středu (viz `showOverview` níž).
  const climateNormalsRaw =
    page.category === PageCategory.Pocasi ? parseClimateNormals(page.climateNormals) : null
  const climateLocative = contextPlace.detail?.locative || `v ${contextPlace.title}`
  // Druhý pád VČETNĚ předložky, jak ho drží admin („do Londýna", „na Maltu") —
  // nadpis z něj skládá „Nejlepší doba na cestu do Londýna".
  const climateGenitive = getGenitivePlace(contextPlace)
  // Stránka počasí se chová dvojím způsobem podle toho, co je pod ní:
  //  · má-li pod sebou místa s vlastní stránkou počasí (Chorvatsko → Dubrovník,
  //    Split, Záhřeb), vypíše jejich PŘEHLED. „Vlastní" počasí by se počítalo ze
  //    souřadnic země, a to je její geometrický střed — Chorvatsko tak hlásilo
  //    26 °C z lesů u Plitvic, zatímco všechna tři města měla 30 °C.
  //  · jinak jde o konkrétní místo (Londýn, Kréta) a ukáže vlastní počasí,
  //    graf klimatu i předpověď.
  // Země bez podřazených míst s počasím (Thajsko, Rumunsko) nedostanou nic —
  // jejich souřadnice mají tutéž vadu a přehled není z čeho složit.
  const isWeatherPage = page.category === PageCategory.Pocasi
  const contextPlaceId = Number(contextPlace.id)
  const overviewPlacesPromise =
    isWeatherPage && Number.isInteger(contextPlaceId)
      ? fetchWeatherOverviewPlaces(contextPlaceId)
      : Promise.resolve([])
  const overviewPlaces = await overviewPlacesPromise
  const showOverview = overviewPlaces.length > 0
  // Země BEZ podřazených míst s počasím (Japonsko, Egypt, Rumunsko…) živé
  // počasí nedostanou vůbec: jejich souřadnice jsou geometrický střed země —
  // japonský leží v Alpách, novozélandský v moři — takže by stránka hlásila
  // něco, co nikde neplatí. Rozpozná se z drobečků: kontinent › země › Počasí
  // jsou tři články, kdežto místo (Londýn, Kréta) má vždycky víc.
  // Jakmile se pod zemi doplní město se stránkou počasí, objeví se přehled sám.
  const isCountryLevel = (page.breadcrumbs?.length ?? 0) <= 3
  const showOwnWeather = isWeatherPage && !showOverview && !isCountryLevel
  // Graf klimatu patří jen konkrétním místům — u zemí by kreslil dvacetiletý
  // průměr z jejich geometrického středu (tatáž vada jako u živého počasí).
  const climateNormals = showOwnWeather ? climateNormalsRaw : null
  // Živé počasí (OpenWeather One Call 3.0) — souřadnice z kontextového místa
  // (stránka počasí vlastní nemá). Promise startuje hned, await až v poslední
  // vlně s ostatními dotazy.
  const weatherLat = Number.parseFloat(contextPlace.detail?.latitude ?? '')
  const weatherLng = Number.parseFloat(contextPlace.detail?.longitude ?? '')
  const weatherPromise =
    showOwnWeather && Number.isFinite(weatherLat) && Number.isFinite(weatherLng)
      ? fetchPlaceWeather(weatherLat, weatherLng)
      : Promise.resolve(null)
  // Přehled: počasí každého místa zvlášť (každé má vlastní cache 15 min).
  // Dotazy jdou po dávkách, ne všechny naráz — u země s mnoha městy by jinak
  // jeden render vystřelil desítky souběžných volání na OpenWeather.
  // (Počet míst navíc omezuje MAX_WEATHER_OVERVIEW_PLACES v payload.ts.)
  const OVERVIEW_WEATHER_CONCURRENCY = 6
  const overviewWeatherPromise = showOverview
    ? (async (): Promise<WeatherOverviewItem[]> => {
        const items: WeatherOverviewItem[] = []
        for (let i = 0; i < overviewPlaces.length; i += OVERVIEW_WEATHER_CONCURRENCY) {
          const batch = overviewPlaces.slice(i, i + OVERVIEW_WEATHER_CONCURRENCY)
          const settled = await Promise.all(
            batch.map(async (place) => {
              const weather = await fetchPlaceWeather(place.lat, place.lng)
              return weather
                ? {
                    title: place.title,
                    href: place.weatherFullSlug,
                    imageUrl: place.imageUrl,
                    weather,
                  }
                : null
            }),
          )
          for (const item of settled) if (item) items.push(item)
        }
        return items
      })()
    : Promise.resolve([])
  // Fotka: nejbližší místo, a když žádnou nemá, spadneme na zemi, ať hero nezůstane
  // prázdné (legacy mělo jen dvě úrovně, tady je fallback navíc). URL, popisek
  // (alt média z CMS) i pozice ohniska (featureImageStyleCss) musí pocházet ze
  // STEJNÉ stránky — jinak by zděděná fotka dostala výřez/popisek jiné fotky.
  const heroOwnerPage = getHeroImage(page, contextPlace)
    ? heroImageOwner(page, contextPlace)
    : heroImageOwner(page, safeRootPage)
  const cmsImageUrl = getHeroImage(page, contextPlace) ?? getHeroImage(page, safeRootPage)
  const cmsImageAlt = heroOwnerPage.featuredImage?.image?.alternativeText || null
  const cmsStyleCss = heroOwnerPage.featuredImage?.featureImageStyleCss || undefined
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
  // Popis pro strukturovaná data — tentýž, jaký jde do meta description
  // (sdílený resolver, React-cache s generateMetadata).
  const seoDescription = (await resolvePageSeo(page)).description ?? null

  // Sekundární menu se nezobrazuje na rubrikách ani statických stránkách.
  const showSubnavigation =
    page.category !== PageCategory.Rubrika && page.category !== PageCategory.Staticka_stranka

  // ── Pravý panel u míst: pruh „Kdy jet do…" a teplota ──────────────────
  // Místo, které v sobě má další místa (Chorvatsko, Evropa), se chová jako
  // ZEMĚ: jeho souřadnice jsou geometrický střed, takže se z nich nesmí nic
  // počítat — u Chorvatska je to vnitrozemí u Plitvic. Sezónu proto vezme
  // jedině z ručního bloku v adminu a teplotu neukáže vůbec. Konkrétní místo
  // (Dubrovník) má střed tam, kam se opravdu jede, takže dostane obojí.
  // Rešerše referenčních webů dopadla stejně: celozemní „kdy jet" nikdo
  // nepočítá, je to redaktorský úsudek (Lonely Planet, Rough Guides).
  const isPlacePage = page.category === PageCategory.Misto_k_navstiveni
  const hasSubPlaces = pageChildren.some(
    (child) => child.category === PageCategory.Misto_k_navstiveni,
  )
  // Existenci podstránky počasí zjistíme z už načtených dětí (bez dotazu);
  // dotaz níž doplňuje jen její text a klimatická data.
  const weatherChildMeta = pageChildren.find((child) => child.category === PageCategory.Pocasi)
  const pageIdNumber = Number(page.id)
  const seasonSourcePromise =
    isPlacePage && weatherChildMeta && Number.isInteger(pageIdNumber)
      ? fetchPlaceWeatherChild(pageIdNumber)
      : Promise.resolve(null)
  const panelLat = Number.parseFloat(page.detail?.latitude ?? '')
  const panelLng = Number.parseFloat(page.detail?.longitude ?? '')
  const panelWeatherPromise =
    isPlacePage &&
    !hasSubPlaces &&
    weatherChildMeta &&
    Number.isFinite(panelLat) &&
    Number.isFinite(panelLng)
      ? fetchPlaceWeather(panelLat, panelLng)
      : Promise.resolve(null)

  // Mapa s kartou „Hledat ubytování" pod textem podstránky Ubytování: piny =
  // cíle kontextového místa (rodič podstránky), střed/zoom z jeho detailu,
  // Booking deep-link zděděný po předcích. Kontext rovný stránce samé by
  // znamenal, že žádné místo nad ní není — pak se blok nekreslí.
  const isAccommodationPage = page.category === PageCategory.Ubytovani
  const accommodationPlace =
    isAccommodationPage && menuContext.contextFullSlug !== page.fullSlug
      ? menuContext.contextPage
      : null
  const accommodationPlaceId = Number(accommodationPlace?.id)
  const accommodationMapPromise =
    accommodationPlace && Number.isInteger(accommodationPlaceId)
      ? fetchAccommodationMapData(accommodationPlaceId, ancestorSlugs).catch(() => null)
      : Promise.resolve(null)

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
    overviewItems,
    seasonSource,
    panelWeather,
    accommodationMap,
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
    overviewWeatherPromise,
    seasonSourcePromise,
    panelWeatherPromise,
    accommodationMapPromise,
  ])

  // Blok mapy se štítkem (viz accommodationMapPromise). Bez souřadnic místa
  // zůstane jen štítek. Blok nemá nadpis, takže ani položku v obsahu vpravo.
  const accommodationLat = Number.parseFloat(accommodationPlace?.detail?.latitude ?? '')
  const accommodationLng = Number.parseFloat(accommodationPlace?.detail?.longitude ?? '')
  const accommodationCenter =
    Number.isFinite(accommodationLat) && Number.isFinite(accommodationLng)
      ? { lat: accommodationLat, lng: accommodationLng }
      : null
  const accommodationProps = accommodationPlace
    ? {
        placeTitle: accommodationPlace.title,
        locative: accommodationPlace.detail?.locative ?? null,
        center: accommodationCenter,
        zoom: accommodationPlace.detail?.googleMapsZoom ?? 7,
        markers: accommodationMap?.markers ?? [],
        href: accommodationHref(accommodationMap?.accommodationUrl),
      }
    : null
  const accommodationSection = accommodationProps ? (
    <AccommodationMapSection {...accommodationProps} />
  ) : null

  // Sezóna pro pruh v panelu: ruční blok z adminu má vždycky přednost (umí
  // říct i „na severu jinak než na jihu"), automat z klimatu je jen záskok
  // a jen u konkrétních míst. Když není ani jedno, pruh se nekreslí.
  const manualSeason = seasonSource ? extractSeasonalityBlock(seasonSource.text) : null
  const autoSeason =
    !manualSeason && !hasSubPlaces && seasonSource
      ? (() => {
          const normals = parseClimateNormals(seasonSource.climateNormals)
          return normals ? seasonFromClimate(normals) : null
        })()
      : null
  const panelSeason = manualSeason ?? autoSeason
  const seasonPanel =
    panelSeason && seasonSource
      ? {
          season: panelSeason,
          heading: `Kdy jet ${getGenitivePlace(page)}`,
          href: seasonSource.fullSlug,
        }
      : null

  // Vstupy sekce „Akční nabídky": vlastní data stránky, jinak zděděná od
  // předka — pak karty nesou PŘEDKOVO jméno, skloňování i fotku (chorvatská
  // letenka pod titulkem „do Dubrovníku" by byla zavádějící).
  const absoluteMediaUrl = (url: string | null | undefined): string | null =>
    url ? (url.startsWith('/') ? new URL(url, getPayloadURL()).toString() : url) : null
  const inheritedParsedDeals = inheritedDeals ? parseAffiliateDeals(inheritedDeals.deals) : null
  const dealsSection = ownAffiliateDeals
    ? {
        genitive: getGenitivePlace(page),
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
          timezone: effectiveTimezone,
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
  // Podstránka dané kategorie: nejdřív mezi vlastními dětmi, jinak u dětí
  // nejbližšího předka s praktickými informacemi. JEDINÉ místo s tímhle
  // pravidlem dědění — sdílí ho karta v pravém sloupci i dlaždice panelu,
  // aby se od sebe nemohly rozjet. Vrací i vlastníka (čí je stránka), ze
  // kterého se skloňují nadpisy.
  const findInheritedChild = (category: PageCategory) => {
    const own = pageChildren.find((child) => child.category === category)
    if (own) return { child: own, owner: page }
    const inherited = practicalInfoSource.children.find((child) => child.category === category)
    return inherited ? { child: inherited, owner: practicalInfoSource.sourcePage } : null
  }

  const practicalInfoLookup = findInheritedChild(PageCategory.Prakticke_informace)
  // Nadpisy se musí týkat VLASTNÍKA praktických informací, ne aktuální
  // stránky — jinak by odkaz na stránky USA nesl titulek San Francisca.
  const practicalInfoOwner = practicalInfoLookup?.owner ?? practicalInfoSource.sourcePage
  const practicalInfo = practicalInfoLookup
    ? {
        fullSlug: practicalInfoLookup.child.fullSlug,
        ownerTitle: practicalInfoOwner.title,
        ownerGenitive: practicalInfoOwner.detail?.genitive ?? null,
      }
    : null

  // Panel „Praktické informace do …" pod články (legacy `_practicalInfo.gsp`):
  // dlaždice vede na podstránku své kategorie (dědění viz findInheritedChild;
  // žádný dotaz navíc). Dlaždice bez stránky se vynechá. Kontinent (stránka
  // bez rodiče) panel nemá — legacy parita; jeho děti jsou země a jejich
  // praktické informace mu nepatří.
  const practicalInfoLinkItems: PracticalInfoLinkItem[] =
    page.category === PageCategory.Misto_k_navstiveni && page.parent
      ? practicalInfoPanelDefs.flatMap((def) => {
          const target = findInheritedChild(def.category)
          return target ? [{ def, href: target.child.fullSlug }] : []
        })
      : []

  return (
    <div className="flex flex-col bg-white transition-all duration-500">
      {/* Strukturovaná data pro vyhledávače. Cíl: TouristAttraction (s recenzemi
          i AggregateRating, když nějaké má — Google pak u výsledku ukáže
          hvězdičky; bez recenzí jen popis, fotka a poloha). Místo (země, město):
          TouristDestination s fotkou, souřadnicemi a nadřazeným místem. */}
      {page.category === PageCategory.Turisticky_cil && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: touristPointJsonLd({
              page,
              reviews: reviewsData?.reviews ?? [],
              rating: heroRating,
              breadcrumbs,
              description: seoDescription,
              imageUrl,
            }),
          }}
        />
      )}
      {page.category === PageCategory.Misto_k_navstiveni && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: touristDestinationJsonLd({
              name: page.title,
              description: seoDescription,
              path: page.fullSlug,
              imageUrl,
              latitude: page.detail?.latitude ? parseFloat(page.detail.latitude) : null,
              longitude: page.detail?.longitude ? parseFloat(page.detail.longitude) : null,
              containedIn: breadcrumbs.at(-1)?.title ?? null,
            }),
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
          // Popisek fotky z CMS (co je na ní), jinak název stránky; sdílená
          // výchozí obálka je dekorace → bez popisku.
          imageAlt={useDefaultCover ? '' : cmsImageAlt || pageTitle}
          styleCss={useDefaultCover ? DEFAULT_COVER_POSITION : cmsStyleCss}
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
          timezone={effectiveTimezone}
          currencyCode={effectiveCurrencyCode}
          exchangeRate={exchangeData?.rate}
          // Země (místo s dalšími místy uvnitř) kartu Praktických informací
          // v panelu nemá — vede na tutéž stránku, kterou má hned vedle
          // v sekundárním menu. U konkrétních míst zůstává.
          practicalInfo={isPlacePage && hasSubPlaces ? null : practicalInfo}
          seasonPanel={seasonPanel}
          // Teplota do panelu jen u konkrétních míst (viz seasonPanel výš) —
          // a jen když má místo vlastní stránku počasí, kam se dá prokliknout.
          panelWeather={
            panelWeather && seasonSource
              ? {
                  temp: panelWeather.current.temp,
                  condition: panelWeather.current.condition,
                  icon: panelWeather.current.icon,
                  href: seasonSource.fullSlug,
                }
              : null
          }
          createdByPublic={page.createdByPublic}
          touristPointInfo={touristPointInfo}
          // Pořadí bloků (rozhodnutí uživatele): aktuální počasí, dlouhodobé
          // průměry po měsících, text z adminu („Kdy jet do…"), který to
          // komentuje, a úplně nakonec předpověď na týden. Čtenář jde od toho,
          // co je teď, k tomu, co bývá; předpověď zavírá stránku jako praktický
          // dovětek a podpis autora patří až za ni (viz contributorAtEnd).
          aboveText={
            overviewItems.length > 0 ? (
              <WeatherOverviewSection items={overviewItems} locative={climateLocative} />
            ) : placeWeather || climateNormals ? (
              <>
                {placeWeather && (
                  <WeatherNowSection weather={placeWeather} locative={climateLocative} />
                )}
                {climateNormals && (
                  <ClimateSection
                    normals={climateNormals}
                    locative={climateLocative}
                    genitive={climateGenitive}
                  />
                )}
              </>
            ) : null
          }
          // Předpověď na týden je ÚPLNĚ POSLEDNÍ blok stránky, až za textem
          // z adminu (rozhodnutí uživatele). Nad textem tak zůstane jen to,
          // co text komentuje — aktuální stav a dlouhodobé průměry; krátkodobá
          // předpověď je praktický dovětek, ne úvod.
          // Mapa se štítkem ubytování jde MEZI text — za první nadpis a jeho
          // odstavec (čtenář si zorientuje ostrov dřív, než čte o jednotlivých
          // letoviscích; výzvu vidí i kdo nedočte). Text bez nadpisu ji dostane
          // až za sebe.
          midText={accommodationSection}
          belowText={
            teamSection ? (
              <TeamSection {...teamSection} />
            ) : placeWeather && placeWeather.days.length > 0 ? (
              <div className="mt-10">
                <WeatherForecastSection weather={placeWeather} locative={climateLocative} />
              </div>
            ) : null
          }
          // Obsah v pravém sloupci kopíruje pořadí bloků: aktuální počasí
          // a graf klimatu nad textem, předpověď pod ním (extraHeadings).
          preHeadings={[
            ...(placeWeather || overviewItems.length > 0
              ? [{ id: 'aktualni-pocasi', text: `Aktuální počasí ${climateLocative}`, level: 2 }]
              : []),
            ...(climateNormals
              ? [
                  {
                    id: 'prumerne-teploty-a-srazky',
                    text: climateHeading(climateGenitive),
                    level: 2,
                  },
                ]
              : []),
          ]}
          extraHeadings={[
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
            genitive={getGenitivePlace(page)}
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

        {/* Panel odkazů „Praktické informace do …" — poslední sekce stránky
            místa, pod články (legacy parita s _practicalInfo.gsp). Nadpis
            skloňuje vlastníka praktických informací, ne aktuální stránku:
            Dubrovník s vlastním počasím, ale chorvatskými praktickými
            informacemi dostane „do Chorvatska" (legacy parita — titulek se
            řídil stránkou Praktické informace, ne jednotlivými dlaždicemi). */}
        {practicalInfoLinkItems.length > 0 && (
          <PracticalInfoLinks
            genitive={getGenitivePlace(practicalInfoOwner)}
            items={practicalInfoLinkItems}
          />
        )}
      </article>
    </div>
  )
}

/**
 * JSON-LD pro detail turistického cíle: TouristAttraction s AggregateRating
 * a jednotlivými recenzemi (schema.org). Znak menšítka se escapuje na
 * unicode sekvenci (viz replace níže), aby obsah recenze nemohl utéct
 * ze script tagu.
 *
 * Dvojí @type: samotný TouristAttraction Google pro hvězdičky u recenzí
 * nepodporuje (Search Console: „Invalid object type for field <parent_node>"),
 * LocalBusiness ano — recenzujeme cizí atrakce, ne sebe, takže se na nás
 * nevztahuje zákaz „samoobslužných" recenzí (jsme třetí strana jako Yelp).
 *
 * LocalBusiness ale Google váže na povinnou `address` typu PostalAddress, a tu
 * skládáme z HIERARCHIE (drobečky = země → … → město), ne z `googleMapsAddress`:
 * to je volný text, který u poloviny cílů není adresa, ale jen název („Eiffelova
 * věž"). Bez země proto LocalBusiness raději vynecháme a zůstane samotný
 * TouristAttraction — nevalidní značka je horší než chybějící hvězdičky.
 */
function touristPointJsonLd({
  page,
  reviews,
  rating,
  breadcrumbs,
  description,
  imageUrl,
}: {
  page: PayloadPage
  reviews: ReviewPublic[]
  rating: { avg: number; count: number } | null
  breadcrumbs: Breadcrumb[]
  description: string | null
  imageUrl: string | null
}): string {
  const image = ogImageUrl(imageUrl)
  const lat = page.detail?.latitude ? parseFloat(page.detail.latitude) : null
  const lng = page.detail?.longitude ? parseFloat(page.detail.longitude) : null

  // Drobečky u cíle jsou `[země, …, město]` (kontinent i cíl sám jsou odříznuté
  // v `buildBreadcrumbs`). Mělká hierarchie `/slovensko/oravsky-hrad` má jen
  // zemi — pak jde ven adresa bez `addressLocality`.
  const country = breadcrumbs[0]?.title ?? null
  const locality =
    breadcrumbs.length > 1 ? (breadcrumbs[breadcrumbs.length - 1]?.title ?? null) : null
  const address = country
    ? {
        '@type': 'PostalAddress',
        ...(locality ? { addressLocality: locality } : {}),
        addressCountry: country,
      }
    : null

  const data = {
    '@context': 'https://schema.org',
    '@type': address ? ['TouristAttraction', 'LocalBusiness'] : 'TouristAttraction',
    name: page.title,
    url: absoluteUrl(page.fullSlug),
    ...(description ? { description } : {}),
    ...(image ? { image: [image] } : {}),
    ...(address ? { address } : {}),
    ...(page.detail?.website ? { sameAs: websiteHref(page.detail.website) } : {}),
    ...(lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
      ? { geo: { '@type': 'GeoCoordinates', latitude: lat, longitude: lng } }
      : {}),
    // Hodnocení jen s aspoň jednou recenzí — prázdný AggregateRating by byl
    // nevalidní. Bez recenzí zůstane cíl jen s popisem, fotkou a polohou.
    ...(rating && rating.count > 0
      ? {
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
            reviewRating: {
              '@type': 'Rating',
              ratingValue: r.rating,
              bestRating: 5,
              worstRating: 1,
            },
          })),
        }
      : {}),
  }
  return toJsonLd(data)
}

/** Stránka, jejíž fotka je v heru: kořenové kategorie vlastní, podstránky kontext/kořen. */
function heroImageOwner(page: PayloadPage, rootPage: PayloadPage): PayloadPage {
  return rootPageCategories.includes(page.category) ? page : rootPage
}

function getHeroImage(page: PayloadPage, rootPage: PayloadPage) {
  const url = heroImageOwner(page, rootPage).featuredImage?.image?.url
  return url ? (url.startsWith('/') ? new URL(url, getPayloadURL()).toString() : url) : null
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
