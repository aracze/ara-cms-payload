/**
 * SEO metadata webu — jedno místo, kde se z dat CMS skládá `<title>`, popisek,
 * kanonická adresa, Open Graph/Twitter karty a JSON-LD článku.
 *
 * Proč helper: Next.js NESLUČUJE vnořená pole metadat (`openGraph`, `twitter`)
 * mezi layoutem a stránkou — stránka, která nastaví `openGraph.images`, by
 * přišla o `siteName`/`locale` z layoutu. Každá stránka proto skládá celý
 * `openGraph` tudy.
 */
import type { Metadata } from 'next'
import { cloudinaryVariant } from '@/lib/cloudinary-loader'
import { absoluteMediaUrl, getSiteURL, richTextToPlainText } from '@/lib/utils'

export const SITE_NAME = 'Ara.cz'
/**
 * Jediná přípona titulků na celém webu (layout šablona `%s | Ara.cz`). Krátká
 * schválně: Google ukazuje ~60 znaků a klíčová slova („cestovní průvodce")
 * nesou samy titulky stránek — homepage má vlastní absolutní titulek.
 */
export const SITE_TITLE_SUFFIX = SITE_NAME
/**
 * Výchozí popisek (homepage + stránky bez vlastního textu). Úvodní věta je ze
 * starého webu (znění vybral Jan 30. 8. 2026), zbytek nese hledaná slova;
 * 147 znaků → na počítači se ve výsledku zobrazí celý.
 */
export const DEFAULT_DESCRIPTION =
  'Web věnovaný lidem, co milují cestování. Cestovní rady a tipy, kam jet a co vidět, praktické informace před cestou a poctivě napsané rady na cestu.'

/** Horní mez popisku pro výsledky hledání (Google zobrazuje ~155–160 znaků). */
export const DESCRIPTION_MAX = 160

/** Cloudinary transformace náhledu pro sdílení — stejný tvar, jaký generuje
 *  `cloudinaryLoader` (šířka 1200 je ve whitelistu media proxy). */
export const OG_IMAGE_TRANSFORM = 'f_auto,q_auto,c_limit,w_1200'

/** RSS kanál nových článků (src/app/(frontend)/feed.xml/route.ts). */
export const RSS_PATH = '/feed.xml'
export const RSS_TITLE = 'Ara.cz – nové články'
/** `<link rel="alternate" type="application/rss+xml">` — do `alternates.types`. */
export const RSS_ALTERNATE = { 'application/rss+xml': [{ url: RSS_PATH, title: RSS_TITLE }] }

/** Logo pro strukturovaná data (Organization/publisher) — čtvercové PNG 512 px. */
export const SITE_LOGO_PATH = '/icon-512.png'
/** Výchozí náhled ke sdílení (1200×630, logo na modré) pro stránky bez fotky. */
export const OG_FALLBACK_IMAGE_PATH = '/og-default.png'

/** SEO záložka z CMS (plugin-seo) — stránky i články mají stejný tvar. */
export type SeoMeta = { title?: string | null; description?: string | null } | null | undefined

/**
 * Titulky ze starého webu končí značkou v několika podobách: „ • Ara.cz"
 * (2 881 stránek), „ - cestovní průvodce Ara.cz" / „: Cestovní průvodce Ara.cz"
 * (170), „ - Cestovní inspirace Ara.cz" (rubriky) i překlep „ •vAra.cz";
 * generátor plugin-seo dává „ | Ara.cz". Příponu odřízneme, aby ji layout
 * šablona přidala jednotně (a ne dvakrát). „Ara.cz" uprostřed věty („Reklama
 * a spolupráce na Ara.cz") zůstává — chybí oddělovač i fráze.
 */
export function stripSiteSuffix(title: string): string {
  return title
    .replace(
      /(?:\s*[•|–—-]\s*(?:cestovní\s+(?:průvodce|inspirace)\s+)?|\s+cestovní\s+(?:průvodce|inspirace)\s+|\s*•\s*v)Ara\.cz\s*$/i,
      '',
    )
    .replace(/[\s:•|–—-]+$/, '')
    .trim()
}

/**
 * Titulek stránky BEZ přípony webu (tu přidá layout šablona `%s | Ara.cz`):
 * vyplněný SEO titulek z CMS má přednost, jinak `fallback` (šablona kategorie
 * nebo kontextový titulek).
 */
export function resolveSeoTitle(meta: SeoMeta, fallback: string): string {
  const custom = meta?.title?.trim()
  if (custom) {
    const bare = stripSiteSuffix(custom)
    if (bare) return bare
  }
  return fallback
}

/** Zkrátí text na mez pro popisek — na hranici slova, s výpustkou. */
export function truncateDescription(text: string, max = DESCRIPTION_MAX): string {
  const compact = text.replace(/\s+/g, ' ').trim()
  if (compact.length <= max) return compact
  const cut = compact.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(' ')
  // Useknutí uprostřed slova jen když by hranice slova zahodila přes 40 % textu
  // (extrémně dlouhé „slovo", typicky URL).
  const base = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut
  return `${base.replace(/[\s,;:(–—-]+$/, '')}…`
}

/**
 * Popisek: vyplněný z CMS beze změny (autorský text; delší Google zkrátí sám),
 * jinak šablona podle kategorie (`templateFallback`, viz seo-templates.ts),
 * jinak začátek textu stránky/článku. Nic z toho → `undefined`, aby se
 * uplatnil výchozí popisek z layoutu.
 */
export function resolveSeoDescription(
  meta: SeoMeta,
  text: unknown,
  templateFallback?: string | null,
): string | undefined {
  const custom = meta?.description?.trim()
  if (custom) return custom
  if (templateFallback?.trim()) return templateFallback.trim()
  const plain = richTextToPlainText(text)
  return plain ? truncateDescription(plain) : undefined
}

/**
 * Základna webu jako URL pro `metadataBase`. Vyhodnocuje se při načtení
 * layoutu — špatně nastavená `NEXT_PUBLIC_SITE_URL` (bez schématu) by jinak
 * shodila celý web místo špatného canonicalu; proto pojistka na výchozí doménu.
 */
export function getSiteURLObject(): URL {
  try {
    return new URL(getSiteURL())
  } catch {
    return new URL('https://ara.cz')
  }
}

/** Absolutní adresa na webu z cesty (`/norsko` → `https://ara.cz/norsko`). */
export function absoluteUrl(path: string): string {
  return `${getSiteURL()}${path.startsWith('/') ? path : `/${path}`}`
}

/**
 * Náhled pro sdílení: Cloudinary fotka dostane zmenšující transformaci
 * (originály mívají megabajty a tisíce pixelů), ostatní zdroje beze změny.
 */
export function ogImageUrl(url: string | null | undefined): string | null {
  const abs = absoluteMediaUrl(url)
  return abs ? cloudinaryVariant(abs, OG_IMAGE_TRANSFORM) : null
}

export type PageMetadataInput = {
  /** Titulek bez přípony (šablonu doplní layout), nebo `{ absolute }` pro homepage. */
  title: NonNullable<Metadata['title']>
  description?: string
  /** Kanonická cesta na webu (s úvodním lomítkem). */
  path: string
  imageUrl?: string | null
  type?: 'website' | 'article'
  publishedTime?: string | null
  modifiedTime?: string | null
  /** Absolutní URL profilů autorů (Open Graph `article:author`). */
  authors?: string[]
}

/**
 * Kompletní metadata stránky: titulek, popisek, absolutní canonical, Open Graph
 * (vč. siteName/locale, viz hlavička souboru) a Twitter karta. `openGraph.title`
 * a `description` neuvádíme — Next je doplní z titulku/popisku stránky.
 */
export function buildPageMetadata(input: PageMetadataInput): Metadata {
  const url = absoluteUrl(input.path)
  // Bez fotky (homepage, statické stránky, cíl bez obrázku) jde ven výchozí
  // obrázek se značkou — sdílený odkaz bez náhledu má výrazně nižší proklik.
  const image = ogImageUrl(input.imageUrl) ?? absoluteUrl(OG_FALLBACK_IMAGE_PATH)
  const type = input.type ?? 'website'

  return {
    title: input.title,
    ...(input.description ? { description: input.description } : {}),
    // `alternates` je vnořené pole → stránka jím přepíše layout celý, proto tu
    // je i odkaz na RSS.
    alternates: { canonical: url, types: RSS_ALTERNATE },
    openGraph: {
      type,
      url,
      siteName: SITE_NAME,
      locale: 'cs_CZ',
      images: [{ url: image }],
      ...(type === 'article'
        ? {
            ...(input.publishedTime ? { publishedTime: input.publishedTime } : {}),
            ...(input.modifiedTime ? { modifiedTime: input.modifiedTime } : {}),
            ...(input.authors?.length ? { authors: input.authors } : {}),
          }
        : {}),
    },
    twitter: { card: 'summary_large_image' },
  }
}

export type ArticleJsonLdInput = {
  title: string
  description?: string | null
  /** Kanonická cesta článku na webu. */
  path: string
  imageUrl?: string | null
  publishedAt?: string | null
  modifiedAt?: string | null
  author?: { name: string; profilePath?: string | null } | null
}

/**
 * Strukturovaná data článku (schema.org Article) — autor, datum vydání
 * a aktualizace, fotka, vydavatel. Google z nich čerpá pro Discover, výsledky
 * s datem a AI přehledy. `<` escapujeme jako u ostatních JSON-LD, aby text
 * nemohl utéct ze script tagu.
 */
export function articleJsonLd(input: ArticleJsonLdInput): string {
  const site = getSiteURL()
  const url = absoluteUrl(input.path)
  const image = ogImageUrl(input.imageUrl)

  const data = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.title,
    ...(input.description ? { description: input.description } : {}),
    ...(image ? { image: [image] } : {}),
    ...(input.publishedAt ? { datePublished: input.publishedAt } : {}),
    ...(input.modifiedAt ? { dateModified: input.modifiedAt } : {}),
    author: input.author
      ? {
          '@type': 'Person',
          name: input.author.name,
          ...(input.author.profilePath ? { url: absoluteUrl(input.author.profilePath) } : {}),
        }
      : { '@type': 'Organization', name: SITE_NAME, url: site },
    publisher: organizationNode(),
    mainEntityOfPage: url,
    url,
    inLanguage: 'cs',
  }
  return toJsonLd(data)
}

/**
 * Serializace JSON-LD s escapováním `<` (text nemůže utéct ze script tagu) —
 * jediné místo pro všechny `application/ld+json` bloky webu.
 */
export function toJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

/** Vydavatel webu — sdílený uzel pro Article.publisher, WebSite.publisher a Organization. */
function organizationNode() {
  const site = getSiteURL()
  return {
    '@type': 'Organization',
    name: SITE_NAME,
    url: site,
    logo: { '@type': 'ImageObject', url: `${site}${SITE_LOGO_PATH}`, width: 512, height: 512 },
  }
}

/**
 * Homepage: `WebSite` se `SearchAction` (Google pak umí u výsledku webu
 * nabídnout vyhledávací pole vedoucí rovnou na /hledani) + `Organization`
 * (název, logo) jako dva grafy v jednom skriptu.
 */
export function homepageJsonLd(): string {
  const site = getSiteURL()
  return toJsonLd({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${site}/#website`,
        name: SITE_NAME,
        alternateName: 'Ara.cz – Cestovní průvodce',
        url: site,
        description: DEFAULT_DESCRIPTION,
        inLanguage: 'cs',
        publisher: { '@id': `${site}/#organization` },
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${site}/hledani?q={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        },
      },
      { ...organizationNode(), '@id': `${site}/#organization` },
    ],
  })
}

export type TouristDestinationJsonLdInput = {
  name: string
  description?: string | null
  path: string
  imageUrl?: string | null
  latitude?: number | null
  longitude?: number | null
  /** Nadřazené místo (země u města, kontinent u země…) — z drobečků. */
  containedIn?: string | null
}

/**
 * Stránky „Místo k navštívení" (země, region, město): schema.org
 * `TouristDestination` — název, popis, fotka, souřadnice a kde místo leží.
 */
export function touristDestinationJsonLd(input: TouristDestinationJsonLdInput): string {
  const image = ogImageUrl(input.imageUrl)
  const hasGeo =
    input.latitude != null &&
    input.longitude != null &&
    Number.isFinite(input.latitude) &&
    Number.isFinite(input.longitude)
  return toJsonLd({
    '@context': 'https://schema.org',
    '@type': 'TouristDestination',
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    url: absoluteUrl(input.path),
    ...(image ? { image: [image] } : {}),
    ...(hasGeo
      ? { geo: { '@type': 'GeoCoordinates', latitude: input.latitude, longitude: input.longitude } }
      : {}),
    ...(input.containedIn
      ? { containedInPlace: { '@type': 'Place', name: input.containedIn } }
      : {}),
    touristType: 'čeští cestovatelé',
    inLanguage: 'cs',
  })
}
