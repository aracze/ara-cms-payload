/**
 * Frontendové view-modely — normalizovaný tvar dat, který web kreslí.
 *
 * NEJSOU to náhrady generovaných typů. Surové kolekce/globaly žijí v
 * `@/payload-types` (generuje `pnpm generate:types`); datová vrstva
 * (src/lib/payload.ts) z nich skládá tenhle normalizovaný tvar (children.docs,
 * articles[], populovaný featuredImage.image, sloučené primary/secondary…).
 *
 * Části, které jen kopírují schéma (kategorie, `detail`), jsou proto ODVOZENÉ
 * z generovaných typů, aby změna schématu shodila `tsc` a typy nezastaraly
 * (žádný tichý drift).
 */
import type { Page as GeneratedPage, Article as GeneratedArticle } from '@/payload-types'

export interface StrapiMedia {
  url: string
  alternativeText: string | null
}

export interface Homepage {
  /** Věta pod herem — nepovinná; prázdná/null = na webu se nezobrazí nic. */
  title?: string | null
  /**
   * Obecné partnerské odkazy (cíle redirectů /go/*) — prázdné pole = výchozí
   * hodnota z kódu, viz `src/lib/affiliate.ts`.
   */
  affiliate?: {
    insuranceUrl?: string | null
    toursUrl?: string | null
    accommodationUrl?: string | null
    carRentalUrl?: string | null
  } | null
  /**
   * Zdroj dlaždic zájezdů v sekci „Dnešní akční nabídky" (homepage): URL Invia
   * feedu s defaultním cílením + JSON s nasyncovaným výběrem (plní denní sync
   * /api/sync-affiliate-deals, tvar `HomepageTourDeals`).
   */
  dealsOfDay?: {
    inviaFeedUrl?: string | null
    deals?: unknown
  } | null
}

/**
 * Jeden zájezd pro dlaždice „Dnešní akční nabídky" na homepage — z Invia feedu
 * s defaultním cílením (kurátorovaný výběr invia.cz), po filtru letecky +
 * odlet z Prahy, seřazeno podle slevy a bez duplicitních hotelů. Tvar prvku
 * JSON pole `dealsOfDay.deals.tours` globálu Homepage; plní denní sync
 * /api/sync-affiliate-deals (přímým SQL jako u stránek) a čte se přes
 * type-guard v src/lib/payload.ts (JSON pole nemá v generovaných typech tvar).
 * Propadlé termíny a pestrost destinací řeší až web při čtení.
 */
export interface HomepageTourDeal extends AffiliateDealInvia {
  /** Země česky („Egypt", „Kanárské ostrovy"). */
  country: string
  /** Oblast/město („Marsa Alam"); null = feed neuvedl. */
  locality: string | null
  /** Sleva v procentech (0 = bez slevy). */
  discount: number
  /** Odletové letiště v ČR („Praha", „Brno"…); null = starší záznam bez údaje. */
  departure: string | null
}

/** Tvar JSON pole `dealsOfDay.deals` globálu Homepage. */
export interface HomepageTourDeals {
  tours: HomepageTourDeal[]
  /** ISO timestamp posledního úspěšného syncu. */
  updatedAt?: string
}

/**
 * Sekce „Akční nabídky" — nejlevnější letenka a zájezd pro destinaci. Tvar
 * JSON pole `affiliate.deals` na stránce; plní ho denní sync
 * /api/sync-affiliate-deals (viz src/endpoints/syncAffiliateDeals.ts).
 * Čte se přes type-guard `parseAffiliateDeals` (deals-section.tsx) — JSON pole
 * nemá v generovaných typech tvar.
 */
export interface AffiliateDealKiwi {
  /** Cena ZPÁTEČNÍ letenky v CZK (Kiwi Search API s curr=CZK). */
  price: number
  /** Odkaz s provizí (affilid) na kiwi.com. */
  deepLink: string
  /** Datum odletu ve formátu ISO (YYYY-MM-DD). */
  departureDate: string
  /** Počet nocí v destinaci; null = Kiwi hodnotu nevrátil. */
  nights: number | null
  /**
   * Odletové město v ČR („Praha", „Brno"…) — hledá se z celé republiky;
   * null = starší záznam z doby hledání jen z Prahy.
   */
  departure: string | null
  /**
   * Obvyklá cena = medián denních nejlevnějších cen za posledních 90 dní
   * (`kiwiPriceHistory`); karta z ní počítá štítek „levnější než obvykle".
   * null = zatím málo dní historie (viz src/lib/kiwi-deals.ts).
   */
  usualPrice: number | null
}

/** Jeden den historie nejlevnější letenky destinace (základ obvyklé ceny). */
export interface KiwiPricePoint {
  /** Den syncu v pražském čase, YYYY-MM-DD. */
  date: string
  /** Nejlevnější zpáteční cena toho dne v CZK. */
  price: number
}

export interface AffiliateDealInvia {
  /** Celková cena v CZK (nejlevnější nabídka s odletem z Prahy). */
  price: number
  /** Odkaz s provizí (aid) na invia.cz. */
  deepLink: string
  /** Fotka hotelu z feedu (inviacdn.net); null = použije se fotka místa. */
  photoUrl: string | null
  hotel: string
  /** Datum odjezdu ve formátu ISO (YYYY-MM-DD). */
  termFrom: string
  days: number
  /** Strava („Snídaně", „All Inclusive"…); null = feed neuvedl. */
  food: string | null
}

export interface AffiliateDeals {
  kiwi?: AffiliateDealKiwi | null
  invia?: AffiliateDealInvia | null
  /**
   * Denní ceny letenky za posledních 90 dní (seřazené podle data, jeden bod
   * na den) — přežívá i den, kdy Kiwi selže, ať se historie nerozbije.
   */
  kiwiPriceHistory?: KiwiPricePoint[]
  /** ISO timestamp posledního úspěšného syncu. */
  updatedAt?: string
}

/**
 * Dlouhodobé měsíční průměry počasí pro stránky kategorie „Počasí" (sekce
 * „Nejlepší doba na cestu…") — klouzavé okno posledních 20 let. Tvar JSON pole
 * `climateNormals` na stránce; plní ho sync /api/sync-climate-normals
 * (viz src/endpoints/syncClimateNormals.ts) z Meteostat API. Čte se přes
 * type-guard `parseClimateNormals` (climate-section.tsx) — JSON pole nemá
 * v generovaných typech tvar.
 */
export interface ClimateNormalMonth {
  /** Měsíc 1–12. */
  month: number
  /** Průměrná minimální teplota (°C); null = stanice hodnotu nemá. */
  tmin: number | null
  /** Průměrná maximální teplota (°C); null = stanice hodnotu nemá. */
  tmax: number | null
  /** Průměrný úhrn srážek (mm); null = stanice hodnotu nemá. */
  prcp: number | null
}

export interface ClimateNormals {
  months: ClimateNormalMonth[]
  /**
   * Roky, ze kterých se průměry počítají — klouzavé okno posledních 20
   * ukončených let (např. 2006–2025), ne pevné normály WMO. Posouvá se
   * s každým ročním syncem, viz src/endpoints/syncClimateNormals.ts.
   */
  period?: { start: number; end: number } | null
  /** ISO timestamp posledního úspěšného syncu. */
  updatedAt?: string
}

export interface SharedImageComponent {
  alternativeText: string
  url: string | URL
  image: StrapiMedia | null
  featureImageStyleCss: string | null
}

export interface NavLink {
  id: number
  title: string
  href: string
  isExternal: boolean
  isButtonLink: boolean
}

export interface ImageLink {
  id: number
  svgCode: string | null
  image: SharedImageComponent | null
  link: NavLink | null
}

export interface GlobalHeader {
  id: number
  logo: ImageLink | null
  navItems: NavLink[]
  login: NavLink | null
}

export interface PageChild {
  id: string | number
  title: string
  fullSlug: string
  documentId: string
  category?: string
  featuredImage?: SharedImageComponent | null
  text?: string | RichTextRoot | null
  children?: {
    docs: PageChild[]
  }
  // Odvozeno ze schématu (superset — web čte jen latitude/longitude/zoom/adresu).
  detail?: GeneratedPage['detail']
  /** Bezpečný veřejný autor (virtuální pole) — výpis cílů zobrazuje avatar + jméno. */
  createdByPublic?: Page['createdByPublic']
  /** Zobrazení za 12 měsíců (GA4) — řazení v sekci „Co vidět" (resolvePlacesToVisit). */
  analyticsPageViews?: number | null
  /** Ostrov apod. — u rodiče se nerozbaluje na vlastní podřazená místa (resolvePlacesToVisit). */
  stopDisplayingChildPlaces?: boolean | null
  /** Jen pro seskupení podle rodiče v resolvePlacesToVisit (dávkové BFS). */
  parent?: number | { id: number } | null
}

export interface RichTextRoot {
  root?: {
    children?: unknown[]
  }
}

/**
 * Jedna sekce složené stránky „Praktické informace" — sousední podstránka
 * místa (Vstupní podmínky, Měna a ceny…), ze které se skládá text i kotva.
 */
export interface PracticalInfoSection {
  title: string
  fullSlug: string
  category: string
  text?: string | RichTextRoot | null
}

export interface ArticleMainPage {
  id: string | number
  title: string
  fullSlug: string
}

export interface ArticleAuthor {
  username?: string | null
  name?: string | null
  description?: string | null
  avatar?: { url?: string | null } | null
}

/**
 * Article featured image. From a page's articles join `image` comes back as a numeric
 * media id (uploads aren't deep-populated); after `enrichArticleImages` it's a populated
 * media object. Model both instead of casting.
 */
export interface ArticleFeaturedImage extends Omit<SharedImageComponent, 'image'> {
  image: StrapiMedia | number | null
}

export interface Article {
  id: number
  documentId: string
  title: string
  slug: string
  text: string | RichTextRoot
  attribution?: string | RichTextRoot | null
  category: GeneratedArticle['category']
  publishedAt: string
  featuredImage: ArticleFeaturedImage | null
  mainPage?: ArticleMainPage | null
  createdByPublic?: ArticleAuthor | null
}

export interface Page {
  id: string | number
  title: string
  fullSlug: string
  category: PageCategory
  text: string | RichTextRoot
  publishedAt: string
  featuredImage: SharedImageComponent | null
  children: {
    docs: PageChild[]
  }
  /**
   * Sekce „Co vidět" — rekurzivně vyřešený seznam míst a cílů (viz
   * `resolvePlacesToVisitUncached` v `src/lib/payload.ts`), NE prosté přímé
   * děti (`children`). Ty zůstávají pro menu/taby s ostatními kategoriemi.
   */
  resolvedPlacesToVisit?: PageChild[]
  articles: Article[]
  /**
   * Řetězec předků z CMS (pole `breadcrumbs` pluginu nested-docs) — od nejvyšší
   * úrovně po tuto stránku VČETNĚ. Zdroj drobečkové navigace: jde po HIERARCHII,
   * takže obsahuje i stránky vynechané z URL (`includeInChildUrlPaths: false`,
   * např. „Kalifornie" v /usa/san-francisco). Čte se přes `buildBreadcrumbs`
   * v `src/lib/page-hierarchy.ts`.
   */
  breadcrumbs?: { label?: string | null; url?: string | null }[] | null
  // Odvozeno ze schématu (payload-types.ts) — nebude se rozcházet s CMS.
  detail?: GeneratedPage['detail']
  /**
   * Partnerské odkazy pro sekci „Příprava do …“ — deep-linky pro konkrétní
   * destinaci (zájezdy/ubytování/auto). Prázdné pole = obecný výchozí odkaz
   * (viz PreparationSection).
   */
  affiliate?: GeneratedPage['affiliate']
  /**
   * Klimatické normály pro stránky „Počasí" (surový JSON z měsíčního syncu
   * /api/sync-climate-normals) — tvar ověří `parseClimateNormals`.
   */
  climateNormals?: GeneratedPage['climateNormals']
  createdBy?:
    | {
        username?: string | null
        name?: string | null
        avatar?: StrapiMedia | null
      }
    | number
    | null
  createdByPublic?: {
    id: number
    username?: string | null
    name?: string | null
    avatar?: StrapiMedia | null
  } | null
  /** Bez rodiče = kontinent (root „Místo k navštívení") — viz resolvePlacesToVisit. */
  parent?: number | { id: number } | null
  /**
   * Ostrov apod. — u rodiče se nerozbaluje na vlastní podřazená místa. Zároveň
   * rozhoduje, že místo má nárok na odvozené hodnocení z recenzí svých cílů
   * (viz `fetchDerivedPlaceRatings` v `src/lib/payload.ts`).
   */
  stopDisplayingChildPlaces?: boolean | null
}

export interface PagesResponse {
  data: {
    pages: Page[]
    global: {
      header: GlobalHeader
    } | null
    homepage: Homepage | null
  }
}

/**
 * Normalizovaný komentář pro veřejný web. Skládá ho datová vrstva
 * (fetchArticleComments) z kolekce `comments`: bezpečná pole + veřejný autor
 * (username/avatar z virtuálního `authorPublic`). Nikdy neobsahuje e-mail,
 * role ani interní vazby.
 */
export interface CommentPublic {
  id: number
  authorName: string
  body: string
  /** Datum vložení (createdAt; u migrovaných = původní datum ze staré DB). */
  commentedAt: string | null
  /** Username registrovaného autora (odkaz na profil), jinak null. */
  authorUsername: string | null
  /** URL avataru registrovaného autora, jinak null (frontend vykreslí iniciály). */
  avatarUrl: string | null
  /** true = autor tohoto článku (zobrazí štítek „autor"). */
  isAuthor: boolean
  /** ID komentáře, na který tento reaguje (odpověď), jinak null. */
  parentId: number | null
}

/**
 * Vlákno komentářů: kořenový komentář + jeho odpovědi (jedna úroveň zanoření).
 * Odpovědi na odpovědi se zobrazují také pod kořenem (bez dalšího odsazování).
 */
export interface CommentThread {
  comment: CommentPublic
  replies: CommentPublic[]
}

/**
 * Normalizovaná recenze turistického cíle pro veřejný web. Skládá ji datová
 * vrstva (fetchPageReviews) z kolekce `comments` (type = review): bezpečná pole
 * + veřejný autor (username/avatar z virtuálního `authorPublic`). Recenze nemají
 * vlákna (odpovědi) — jen plochý seznam s hvězdičkovým hodnocením.
 */
export interface ReviewPublic {
  id: number
  authorName: string
  body: string
  /** Hvězdičkové hodnocení 1–5 (kolekce ho u recenze vynucuje). */
  rating: number
  /** Datum vložení (createdAt; u migrovaných = původní datum ze staré DB). */
  reviewedAt: string | null
  /** Username registrovaného autora (odkaz na profil), jinak null. */
  authorUsername: string | null
  /** URL avataru registrovaného autora, jinak null (frontend vykreslí papouška). */
  avatarUrl: string | null
}

export enum PageCategory {
  Misto_k_navstiveni = 'Místo k navštívení',
  Turisticky_cil = 'Turistický cíl',
  Prakticke_informace = 'Praktické informace',
  Vstupni_podminky = 'Vstupní podmínky',
  Cesta = 'Cesta',
  Pocasi = 'Počasí',
  Doprava = 'Doprava',
  Mena_a_ceny = 'Měna a ceny',
  Zdravi_a_bezpeci = 'Zdraví a bezpečí',
  Jazyk_a_kultura = 'Jazyk a kultura',
  Jidlo_a_pit = 'Jídlo a pití',
  Ubytovani = 'Ubytování',
  Clanky = 'Články',
  Rubrika = 'Rubrika',
  Staticka_stranka = 'Statická stránka',
}

// Anchor: hodnoty PageCategory MUSÍ existovat v generovaném schématu
// (Page['category'] z payload-types.ts). Když se v CMS kategorie přejmenuje nebo
// odebere, výraz se vyhodnotí jako `false` a `_AssertTrue<false>` shodí `tsc`.
type _AssertTrue<T extends true> = T
export type _PageCategoryMatchesSchema = _AssertTrue<
  `${PageCategory}` extends GeneratedPage['category'] ? true : false
>

// ─── Veřejný profil uživatele (/profil/<username>) ──────────────────────────
// Vše skládá datová vrstva (fetchUserProfile) jen z BEZPEČNÝCH polí — nikdy
// e-mail, role ani interní vazby. Stejný princip jako createdByPublic.

/**
 * Karta článku na profilu. Stejný tvar jako karta místa (fotka + název + cesta
 * v hierarchii) — profil má jeden vizuální jazyk, takže perex nepotřebuje.
 */
export interface ProfileArticleItem {
  key: string
  title: string
  href: string
  imageUrl: string | null
  /** Kde článek žije — cesta rodičovské stránky („Asie / Myanmar"). */
  path: string | null
}

/** Bod na mapě profilu (místo nebo turistický cíl se souřadnicemi). */
export interface ProfileMapPin {
  id: number
  title: string
  fullSlug: string
  lat: number
  lng: number
  /**
   * Náhledová fotka. S ní kreslí mapa kulatý „avatarový" pin a v bublině
   * fotku místa; bez ní obecný červený pin a v bublině „Bez náhledu".
   */
  imageUrl: string | null
}

/** Karta místa / turistického cíle na profilu. */
export interface ProfilePlaceItem {
  id: number
  title: string
  fullSlug: string
  imageUrl: string | null
  /** Cesta předků pro popisek pod názvem („USA / San Francisco"), jinak null. */
  path: string | null
}

/** Recenze na profilu — orientovaná na CÍL (autor je vlastník profilu). */
export interface ProfileReviewItem {
  id: number
  targetTitle: string
  targetHref: string
  rating: number
  body: string
  reviewedAt: string | null
}

/** Komentář na profilu — orientovaný na cíl (článek/stránku), pod který patří. */
export interface ProfileCommentItem {
  id: number
  targetTitle: string
  targetHref: string
  body: string
  commentedAt: string | null
}

/** Položka homepage sekce „Co je nového" — nové místo, recenze, nebo komentář. */
export interface ActivityItem {
  kind: 'place' | 'review' | 'comment'
  /** Stabilní klíč pro React (kolekce+id — id se mezi kolekcemi můžou potkat). */
  key: string
  /** Název cílové stránky/článku. */
  title: string
  href: string
  /** ISO datum události (vytvoření místa / vložení recenze či komentáře). */
  date: string | null
  authorName: string | null
  /** Přezdívka registrovaného autora → proklik na /profil/<username>. */
  authorUsername: string | null
  avatarUrl: string | null
  /** Úryvek textu místa, resp. citace recenze/komentáře. */
  text: string | null
  /** Drobečková cesta — u místa jeho poloha, u recenze/komentáře poloha cíle. */
  context: string | null
  /** Fotka místa (jen kind=place). */
  image: string | null
  /** Hvězdičky (jen kind=review). */
  rating: number | null
}

// ─── Homepage: sekce rad, míst a rubrik (schválená varianta D, 8/2026) ──────
// Vše skládá datová vrstva (fetchHomepageInspiration) — komponenty jen kreslí.

/** Odkaz s fotkou pro homepage sekce (dlaždice rady/místa, řádek článku…). */
export interface InspirationLink {
  /** Stabilní klíč pro React (kolekce+id). */
  key: string
  title: string
  href: string
  imageUrl: string | null
  /** Poloha místa (přímý rodič z drobečků, např. „Česká republika"); jinde null. */
  sub?: string | null
}

/** Data homepage sekcí „Rady na cestu", „Inspirace na cestu" a „Témata ke čtení". */
export interface HomepageInspiration {
  /** Denní výběr rad pro dlaždice 2×2 (jen rady s fotkou). */
  rady: InspirationLink[]
  /** Odkaz na rubriku Rady na cestu („Všechny rady na cestu"). */
  radyHref: string
  /** Nejnovější články mimo rady — boční seznam „Nejnovější články". */
  articles: InspirationLink[]
  /** Denní výběr míst pro dlaždicovou sekci „Inspirace na cestu". */
  places: InspirationLink[]
  /** Rubriky článků pro sekci „Témata ke čtení" na konci stránky
   *  (bez Rad na cestu — ty mají vlastní vitrínu nahoře). */
  rubriky: InspirationLink[]
}

/** Denní výběr místa pro hero fotku a placeholder vyhledávání na homepage. */
export interface HomepageHeroPlace {
  title: string
  imageUrl: string | null
  /** Zarovnání hero fotky (CSS `object-position`), viz `featureImageStyleCss`. */
  styleCss: string | null
}

export interface UserProfileData {
  /** ID účtu — potřebné jen k rozpoznání „tohle je můj profil" (tlačítko Upravit). */
  id: number
  username: string
  /** Celé jméno v záhlaví profilu. Příspěvky podepisuje uživatelské jméno. */
  name: string | null
  description: string | null
  myWebUrl: string | null
  avatarUrl: string | null
  articles: ProfileArticleItem[]
  touristPoints: ProfilePlaceItem[]
  places: ProfilePlaceItem[]
  reviews: ProfileReviewItem[]
  comments: ProfileCommentItem[]
  /** Body na mapu „kde všude jsem byl" — místa i cíle, které mají souřadnice. */
  mapPins: ProfileMapPin[]
}

/** Počty příspěvků v medailonku — stejné kategorie jako čísla na profilu. */
export interface TeamMemberCounts {
  places: number
  touristPoints: number
  articles: number
  reviews: number
}

/**
 * Člen týmu v sekci „Náš tým" na stránce O nás (jen veřejná pole profilu).
 * Medailonek „o mně" se ZÁMĚRNĚ nenačítá — karta ho nezobrazuje, viz
 * team-section.tsx.
 */
export interface TeamMemberPublic {
  username: string
  /** Celé jméno; když ho autor nevyplnil, zbývá uživatelské jméno. */
  name: string | null
  avatarUrl: string | null
  counts: TeamMemberCounts
}

/** Tvář v řadě dřívějších přispěvatelů pod týmem (odkaz na profil). */
export interface ContributorFace {
  username: string
  name: string | null
  avatarUrl: string
}

export interface TeamSectionData {
  /** Členové v pořadí, v jakém je vyjmenovává TEAM_USERNAMES. */
  members: TeamMemberPublic[]
  faces: ContributorFace[]
  /** Kolik dalších přispěvatelů se do řady tváří nevešlo (0 = řada je celá). */
  remainingContributors: number
}

export interface FooterNavItem {
  label: string
  href: string
}

/** Kontaktní blok patičky — e-mail a osoba, která na něj odpovídá. */
export interface FooterContact {
  email: string | null
  personName: string | null
  /** Profil kontaktní osoby (/profil/<username>), jinak null = jméno bez odkazu. */
  personHref: string | null
}

export interface GlobalFooter {
  logo?: ImageLink | null
  /** Krátká výzva vedle loga; prázdná = řádek se nevykreslí. */
  lede: string | null
  contact: FooterContact
  navItems: FooterNavItem[]
  copyrightText: RichTextRoot | null
}
