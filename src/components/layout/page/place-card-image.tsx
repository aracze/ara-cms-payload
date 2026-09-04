'use client'

/* eslint-disable @next/next/no-img-element -- zmenšování i ořez dělá Cloudinary
   (viz cloudinary-loader); next/image tu jen nafukoval srcset, viz níže. */
import { capImageWidth, cloudinaryVariant, isCloudinary } from '@/lib/cloudinary-loader'
import { cn } from '@/lib/utils'

/**
 * Obrázek karty místa s ořezem podle zařízení (art direction).
 *
 * Tvar karty se mění podle displeje: na mobilu jsou dvě dlaždice vedle sebe a karta
 * je na výšku (~172×240), na tabletu taky dvě, ale širší, takže je na šířku, a na
 * desktopu je vedle mapy na výšku, bez mapy skoro čtvercová. Pro každý případ proto
 * Cloudinary ořízne jiný poměr (`c_fill,g_auto`), aby se nestahovaly pixely, které
 * `object-cover` stejně ořízne.
 *
 * Art direction řeší nativní `<picture>` se třemi `<source media>` — prohlížeč
 * si podle šířky okna a hustoty pixelů vybere JEDNU variantu a stáhne jen ji.
 * Do 4. 9. 2026 to byly tři `next/image` s `fill` přepínané `hidden lg:block`;
 * u pevné šířky v pixelech (`sizes="210px"`) ale `next/image` vypisuje všech
 * 14 šířek z `imageSizes` + `deviceSizes`, takže jedna dlaždice nesla 26 adres
 * (~4,3 kB) a Řecko s 96 místy mělo 420 kB HTML jen v adresách fotek. Tady má
 * každá varianta 3–4 kandidáty přesně pro svůj rozsah šířek a hustot.
 *
 * Ne-Cloudinary zdroje (dev/localhost, Payload) se nedají ořezávat → prostý
 * `<img src>` bez srcsetu.
 *
 * Zůstává klientská komponenta, i když žádný stav nemá: přes RSC hranici tak
 * jdou jen props (src, alt, hasMap…), ne hotový `<picture>` se všemi adresami.
 * Jako serverová komponenta by RSC payload Řecka narostl o 127 kB (adresy by
 * byly v HTML i v datech pro hydrataci) a půlka úspory by se ztratila.
 */

const BASE = 'f_auto,q_auto'

/** Kandidáti srcsetu pro jeden Cloudinary ořez (šířky v px, stropované). */
function srcSetFor(src: string, crop: string, widths: number[]): string {
  return widths
    .map((w) => `${cloudinaryVariant(src, `${BASE},${crop},w_${capImageWidth(w)}`)} ${w}w`)
    .join(', ')
}

interface PlaceCardImageProps {
  src: string
  alt: string
  className?: string
  /** true = karta vedle mapy (3 sloupce, na výšku); false = 4 sloupce, skoro čtverec */
  hasMap?: boolean
  /**
   * Rozložení na mobilu: `pair` = dvě dlaždice vedle sebe (Co vidět → ořez na
   * výšku 5:7), `full` = jedna dlaždice přes celou šířku (Co dalšího vidět,
   * profil → ořez na šířku 3:2 a plná šířka pro srcset). S `pair` v plné
   * šířce se stahoval úzký portrét a roztahoval do šířky — rozmazané.
   */
  mobileLayout?: 'pair' | 'full'
}

export function PlaceCardImage({
  src,
  alt,
  className,
  hasMap = false,
  mobileLayout = 'pair',
}: PlaceCardImageProps) {
  // Vyplní rám dlaždice stejně jako dřív `next/image fill` (absolutní vrstva).
  const imgClass = cn('absolute inset-0 h-full w-full', className)

  if (!isCloudinary(src)) {
    return <img src={src} alt={alt} loading="lazy" decoding="async" className={imgClass} />
  }

  // Šířky JEN z whitelistu media proxy (ALLOWED_WIDTHS ve
  // workers/media-proxy/src/media-path.ts) — jiná šířka = 400 z Workeru.
  // Desktop (≥1024 px): vedle mapy portrét (~207×280 → 5:7), jinak skoro čtverec
  // (~278×280 → 1:1). Pevná šířka → kandidáti pro 1×, 1,5× a 2× hustotu.
  const desktop = hasMap
    ? { crop: 'c_fill,g_auto,ar_5:7', sizes: '210px', widths: [256, 384, 420] }
    : { crop: 'c_fill,g_auto,ar_1:1', sizes: '280px', widths: [384, 420, 640] }
  // Tablet (640–1023 px): dvě dlaždice vedle sebe, ale široké → na šířku.
  // 50vw = 320–512 CSS px, při 2× hustotě až 1024.
  const tablet = { crop: 'c_fill,g_auto,ar_3:2', sizes: '50vw', widths: [384, 640, 828, 1080] }
  // Mobil (<640 px): dvě dlaždice vedle sebe → karta na výšku (≤320 CSS px,
  // hustota 2–3× → do 960); jedna přes celou šířku → na šířku (3:2) a 100vw.
  const mobile =
    mobileLayout === 'full'
      ? { crop: 'c_fill,g_auto,ar_3:2', sizes: '100vw', widths: [640, 828, 1080, 1200, 1920] }
      : { crop: 'c_fill,g_auto,ar_5:7', sizes: '50vw', widths: [384, 640, 828] }

  return (
    <picture>
      <source
        media="(min-width: 1024px)"
        sizes={desktop.sizes}
        srcSet={srcSetFor(src, desktop.crop, desktop.widths)}
      />
      <source
        media="(min-width: 640px)"
        sizes={tablet.sizes}
        srcSet={srcSetFor(src, tablet.crop, tablet.widths)}
      />
      <img
        src={cloudinaryVariant(src, `${BASE},${mobile.crop},w_${mobile.widths[1]}`)}
        srcSet={srcSetFor(src, mobile.crop, mobile.widths)}
        sizes={mobile.sizes}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={imgClass}
      />
    </picture>
  )
}
