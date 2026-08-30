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
import { getPayloadURL, getSiteURL, richTextToPlainText } from '@/lib/utils'

export const SITE_NAME = 'Ara.cz'
/** Přípona titulků z layout šablony (`%s | Ara.cz - Cestovní průvodce`). */
export const SITE_TITLE_SUFFIX = 'Ara.cz - Cestovní průvodce'
/** Výchozí popisek (homepage + stránky bez vlastního textu). */
export const DEFAULT_DESCRIPTION =
  'Cestovní průvodce po světě: tipy, kam jet a co vidět, praktické informace o vízech, měně, počasí a dopravě, cestopisy a rady na cestu od lidí, kteří tam byli.'

/** Horní mez popisku pro výsledky hledání (Google zobrazuje ~155–160 znaků). */
export const DESCRIPTION_MAX = 160

/** Cloudinary transformace náhledu pro sdílení — stejný tvar, jaký generuje
 *  `cloudinaryLoader` (šířka 1200 je ve whitelistu media proxy). */
export const OG_IMAGE_TRANSFORM = 'f_auto,q_auto,c_limit,w_1200'

/** SEO záložka z CMS (plugin-seo) — stránky i články mají stejný tvar. */
export type SeoMeta = { title?: string | null; description?: string | null } | null | undefined

/**
 * Titulky ze starého webu končí „ • Ara.cz", generátor plugin-seo dává
 * „ | Ara.cz". Příponu odřízneme, aby ji web přidal jednotně (a ne dvakrát).
 */
export function stripSiteSuffix(title: string): string {
  return title.replace(/\s*[•|–—-]\s*Ara\.cz\s*$/i, '').trim()
}

/**
 * Titulek stránky: vyplněný SEO titulek z CMS má přednost (jako ABSOLUTNÍ
 * titulek s krátkou příponou „| Ara.cz" — legacy titulky už slovo „průvodce"
 * typicky obsahují, s dlouhou šablonou by se opakovalo). Bez SEO titulku se
 * použije fallback, na který layout aplikuje šablonu.
 */
export function resolveSeoTitle(
  meta: SeoMeta,
  fallback: string,
): { title: NonNullable<Metadata['title']>; text: string } {
  const custom = meta?.title?.trim()
  if (custom) {
    const bare = stripSiteSuffix(custom)
    if (bare) {
      const text = `${bare} | ${SITE_NAME}`
      return { title: { absolute: text }, text }
    }
  }
  return { title: fallback, text: `${fallback} | ${SITE_TITLE_SUFFIX}` }
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
 * jinak začátek textu stránky/článku. Prázdný text → `undefined`, aby se
 * uplatnil výchozí popisek z layoutu.
 */
export function resolveSeoDescription(meta: SeoMeta, text: unknown): string | undefined {
  const custom = meta?.description?.trim()
  if (custom) return custom
  const plain = richTextToPlainText(text)
  return plain ? truncateDescription(plain) : undefined
}

/** Absolutní adresa na webu z cesty (`/norsko` → `https://ara.cz/norsko`). */
export function absoluteUrl(path: string): string {
  return `${getSiteURL()}${path.startsWith('/') ? path : `/${path}`}`
}

/** Absolutní adresa média (relativní Payload upload → přes base URL CMS). */
export function absoluteMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null
  return url.startsWith('/') ? `${getPayloadURL()}${url}` : url
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
  const image = ogImageUrl(input.imageUrl)
  const type = input.type ?? 'website'

  return {
    title: input.title,
    ...(input.description ? { description: input.description } : {}),
    alternates: { canonical: url },
    openGraph: {
      type,
      url,
      siteName: SITE_NAME,
      locale: 'cs_CZ',
      ...(image ? { images: [{ url: image }] } : {}),
      ...(type === 'article'
        ? {
            ...(input.publishedTime ? { publishedTime: input.publishedTime } : {}),
            ...(input.modifiedTime ? { modifiedTime: input.modifiedTime } : {}),
            ...(input.authors?.length ? { authors: input.authors } : {}),
          }
        : {}),
    },
    twitter: { card: image ? 'summary_large_image' : 'summary' },
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
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: site,
      logo: { '@type': 'ImageObject', url: `${site}/apple-icon.png` },
    },
    mainEntityOfPage: url,
    url,
    inLanguage: 'cs',
  }
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
