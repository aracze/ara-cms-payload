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
  title: string
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
}

export interface RichTextRoot {
  root?: {
    children?: unknown[]
  }
}

export interface ArticleMainPage {
  id: string | number
  title: string
  fullSlug: string
}

export interface ArticleAuthor {
  username?: string | null
  firstName?: string | null
  lastName?: string | null
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
  createdBy?:
    | {
        username?: string | null
        firstName?: string | null
        lastName?: string | null
        avatar?: StrapiMedia | null
      }
    | number
    | null
  createdByPublic?: {
    id: number
    username?: string | null
    firstName?: string | null
    lastName?: string | null
    avatar?: StrapiMedia | null
  } | null
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
  /** Datum vložení (legacy `commentedAt`, u nových = čas vytvoření). */
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
  /** Datum vložení (legacy `commentedAt`, u nových = čas vytvoření). */
  reviewedAt: string | null
  /** Username registrovaného autora (odkaz na profil), jinak null. */
  authorUsername: string | null
  /** URL avataru registrovaného autora, jinak null (frontend vykreslí papouška). */
  avatarUrl: string | null
}

export enum PageCategory {
  Misto_k_navstiveni = 'Místo k navštívení',
  Turisticky_cil = 'Turistický cíl',
  Mista = 'Místa',
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

export interface UserProfileData {
  username: string
  firstName: string | null
  lastName: string | null
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

export interface FooterNavItem {
  label: string
  href: string
}

export interface GlobalFooter {
  logo?: ImageLink | null
  navItems: FooterNavItem[]
  copyrightText: RichTextRoot | null
}
