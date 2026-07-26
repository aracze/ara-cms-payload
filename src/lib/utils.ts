import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Article } from '@/types/payload'

// Čisté (klientsky bezpečné) utility. Rendering rich-textu do HTML (s těžkou
// závislostí DOMPurify) je záměrně v samostatném `rich-text-html.ts`, aby se
// DOMPurify nedostal do klientského bundlu přes tento sdílený modul.

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isProduction() {
  return process.env.NODE_ENV === 'production'
}

/** České skloňování počtu recenzí: 1 recenze, 2–4 recenze, 5+ recenzí. */
export function reviewsCountLabel(count: number): string {
  if (count >= 1 && count <= 4) return 'recenze'
  return 'recenzí'
}

/** Zobrazovaný text webu cíle: bez protokolu, www a koncového lomítka. */
export function websiteLabel(url: string): string {
  return url
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/, '')
}

/** Odkaz na web cíle: doplní protokol, když v datech chybí. */
export function websiteHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

export function getPayloadURL() {
  // Klientsky bezpečné: v prohlížeči je dostupná jen proměnná s prefixem
  // `NEXT_PUBLIC_`. Fallback na localhost drží lokální vývoj.
  return (process.env.NEXT_PUBLIC_PAYLOAD_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
}

/**
 * Public base URL of the site itself (not the Payload API) — used for absolute
 * URLs in the sitemap, canonical links, etc. Nastav `NEXT_PUBLIC_SITE_URL` v env.
 */
export function getSiteURL() {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.ara.cz').replace(/\/$/, '')
}

export function richTextToPlainText(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  if (!value || typeof value !== 'object') {
    return ''
  }

  const texts: string[] = []

  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') {
      return
    }

    if ('text' in node && typeof (node as { text?: unknown }).text === 'string') {
      texts.push((node as { text: string }).text)
    }

    if ('children' in node && Array.isArray((node as { children?: unknown[] }).children)) {
      for (const child of (node as { children: unknown[] }).children) {
        visit(child)
      }
    }

    if ('root' in node) {
      visit((node as { root?: unknown }).root)
    }
  }

  visit(value)

  return texts.join(' ').replace(/\s+/g, ' ').trim()
}

// ─── Sdílené odvozeniny pro článkové karty/seznamy (jedno místo pravdy) ──────

/** Plain-text perex z rich-textu článku. */
export function getArticleExcerpt(article: Article): string {
  return richTextToPlainText(article.text)
}

/**
 * URL náhledového obrázku článku. `featuredImage.image` je populovaný media objekt
 * (po enrichArticleImages), před tím číselné id → v tom případě vrátíme null.
 */
export function getArticleImageUrl(article: Article): string | null {
  const media = article.featuredImage?.image
  const rawUrl = media && typeof media === 'object' ? media.url : null
  if (!rawUrl) return null
  return rawUrl.startsWith('/') ? `${getPayloadURL()}${rawUrl}` : rawUrl
}

/** Odkaz na detail článku (pod rodičovskou stránkou, fallback /blog/<slug>). */
export function getArticleHref(article: Article, parentFullSlug?: string): string {
  return parentFullSlug
    ? `${parentFullSlug.replace(/\/$/, '')}/${article.slug}`
    : `/blog/${article.slug}`
}

/**
 * #21: Je cesta z URL platným rodičem článku? Článek smí žít jen pod svou
 * `mainPage` NEBO některou z `pages` — jinak jde o „ducha" (starý/cizí odkaz,
 * překlep) a route má vrátit 404. `validParentSlugs` chodí z datové vrstvy už
 * normalizované (bez lomítek); `parentSlug` z URL (join segmentů) taky nemá
 * lomítka, ale pro jistotu ho normalizujeme taky.
 */
export function isValidArticleParent(parentSlug: string, validParentSlugs?: string[]): boolean {
  if (!validParentSlugs?.length) return false
  const normalized = parentSlug.replace(/^\/+|\/+$/g, '')
  return validParentSlugs.includes(normalized)
}

/** Stabilní React key pro článek (documentId → slug → title+index). */
export function getArticleKey(article: Article, index: number): string {
  return article.documentId || article.slug || `${article.title}-${index}`
}
