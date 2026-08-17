/**
 * True, pokud jde o Cloudinary URL, kterou umíme transformovat (obsahuje
 * `/upload/`). Ostatní zdroje (lokální /assets, Payload uploads) transformovat
 * nejdou — u nich nemá `next/image` optimalizace přes tento loader smysl.
 */
export function isCloudinary(src: string): boolean {
  return src.includes('res.cloudinary.com') && src.includes('/upload/')
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
 * Vloží Cloudinary transformaci hned za `/upload/`. Ne-Cloudinary zdroje
 * (lokální /assets, Payload uploads) vrací beze změny — nedají se transformovat.
 */
export function cloudinaryVariant(src: string, transform: string): string {
  if (!isCloudinary(src)) {
    return src
  }
  return src.replace('/upload/', `/upload/${transform}/`)
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
