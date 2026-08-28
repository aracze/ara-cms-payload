/**
 * True, pokud jde o Cloudinary URL (přímou, nebo už přepsanou na media proxy),
 * kterou umíme transformovat (obsahuje `/upload/`). Ostatní zdroje (lokální
 * /assets, Payload uploads) transformovat nejdou — u nich nemá `next/image`
 * optimalizace přes tento loader smysl.
 */
export function isCloudinary(src: string): boolean {
  return (src.includes('res.cloudinary.com') || isMediaProxyUrl(src)) && src.includes('/upload/')
}

/**
 * Strop šířky doručovaných fotek. Next.js jinak pro retina/4K displeje žádá
 * varianty až w_3840 — 4× víc pixelů než Full HD, vizuálně k nerozeznání,
 * ale v srpnu 2026 dělaly přes polovinu přenosů z Cloudinary (překročený
 * limit kreditů free plánu). Strop musí držet KAŽDÝ loader, který skládá
 * `w_` (viz PlaceCardImage/DealCardImage); `deviceSizes` v next.config.mjs
 * drží stejnou mez, aby srcset větší varianty ani nenabízel.
 */
export const MAX_IMAGE_WIDTH = 1920

/** Šířka pro Cloudinary transformaci, nikdy nad MAX_IMAGE_WIDTH. */
export function capImageWidth(width: number): number {
  return Math.min(width, MAX_IMAGE_WIDTH)
}

/**
 * Základna media proxy (Cloudflare Worker na media.ara.cz, viz
 * workers/media-proxy). Nastavená jen v produkčním buildu — bez ní (dev) se
 * adresy nepřepisují a jdou přímo na Cloudinary.
 */
const MEDIA_BASE_URL = process.env.NEXT_PUBLIC_MEDIA_BASE_URL
/** Jen produkční cloud `ara` — dev cloud z lokálního .env proxy nezná. */
const CLOUDINARY_PROD_PREFIX = 'https://res.cloudinary.com/ara/'
/** Prefix proxy adres vč. lomítka — pro detekci a zpětný převod. */
const MEDIA_PROXY_PREFIX = MEDIA_BASE_URL ? `${MEDIA_BASE_URL.replace(/\/+$/, '')}/` : null

/** True, pokud adresa už vede na media proxy (jen s nastavenou env, tj. prod). */
function isMediaProxyUrl(url: string): boolean {
  return MEDIA_PROXY_PREFIX != null && url.startsWith(MEDIA_PROXY_PREFIX)
}

/**
 * Přepíše produkční Cloudinary URL na media proxy. Adresy, které už na proxy
 * vedou (data z CMS je od hooku `rewriteUploadUrlsToMediaProxy` nesou rovnou),
 * i všechno ostatní nechává být — volání je idempotentní, takže zůstává
 * posledním krokem emise URL (po složení transformace).
 */
export function toMediaProxy(url: string): string {
  if (!MEDIA_PROXY_PREFIX || !url.startsWith(CLOUDINARY_PROD_PREFIX)) {
    return url
  }
  return `${MEDIA_PROXY_PREFIX}${url.slice(CLOUDINARY_PROD_PREFIX.length)}`
}

/**
 * Zpětný převod proxy adresy na kanonickou Cloudinary podobu. Pro kód, který
 * z adresy něco ODVOZUJE (regex v rich-text-html, host check v maplibre-map,
 * stažení originálu pro R2 zálohu) — ten normalizuje vstup tudy a na konci
 * emise zase volá `toMediaProxy`. Ne-proxy adresy vrací beze změny.
 */
export function fromMediaProxy(url: string): string {
  if (!isMediaProxyUrl(url)) {
    return url
  }
  return `${CLOUDINARY_PROD_PREFIX}${url.slice(MEDIA_PROXY_PREFIX!.length)}`
}

/**
 * Vloží Cloudinary transformaci hned za `/upload/`. Ne-Cloudinary zdroje
 * (lokální /assets, Payload uploads) vrací beze změny — nedají se transformovat.
 */
export function cloudinaryVariant(src: string, transform: string): string {
  if (!isCloudinary(src)) {
    return src
  }
  return toMediaProxy(src.replace('/upload/', `/upload/${transform}/`))
}

/**
 * Custom next/image loader: Cloudinary URL dostane transformaci
 * (automatický formát AVIF/WebP, kvalitu a šířku dle vykreslené velikosti),
 * takže prohlížeč stahuje jen tak velký obrázek, jaký opravdu zobrazí.
 * Ostatní zdroje projdou beze změny.
 */
export default function cloudinaryLoader({
  src,
  width,
  quality,
}: {
  src: string
  width: number
  quality?: number
}): string {
  // c_limit = zmenšit na danou šířku, ale nikdy nezvětšovat nad originál
  return cloudinaryVariant(src, `f_auto,q_${quality ?? 'auto'},c_limit,w_${capImageWidth(width)}`)
}
