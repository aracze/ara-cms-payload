'use client'

import Image from 'next/image'
import { capImageWidth, cloudinaryVariant, isCloudinary } from '@/lib/cloudinary-loader'

/**
 * Obrázek karty místa s ořezem podle zařízení (art direction).
 *
 * Tvar karty se mění podle displeje: na mobilu jsou dvě dlaždice vedle sebe a karta
 * je na výšku (~172×240), na tabletu taky dvě, ale širší, takže je na šířku, a na
 * desktopu je vedle mapy na výšku, bez mapy skoro čtvercová. Pro každý případ proto
 * Cloudinary ořízne jiný poměr (`c_fill,g_auto`), aby se nestahovaly pixely, které
 * `object-cover` stejně ořízne.
 *
 * Art direction řešíme dvěma `next/image` variantami přepínanými `hidden lg:block`
 * / `lg:hidden` (místo `<picture>`), aby obrázky procházely optimalizací Next.js.
 * Každá varianta má vlastní `loader` s jiným ořezem; šířky dopočítá `next/image`
 * z `sizes`, takže displeje s neceločíselným zvětšením (125 %, 150 %) stáhnou
 * přesně potřebnou velikost místo skoku na dvojnásobek.
 *
 * Ne-Cloudinary zdroje (dev/localhost, Payload) se nedají ořezávat → `unoptimized`,
 * aby `next/image` nenabízel duplicitní srcset kandidáty se stejnou URL.
 */

const BASE = 'f_auto,q_auto'

/** `next/image` loader s pevným Cloudinary ořezem (poměr stran dle varianty). */
function cropLoader(crop: string) {
  return ({ src, width }: { src: string; width: number }) =>
    cloudinaryVariant(src, `${BASE},${crop},w_${capImageWidth(width)}`)
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
  // Desktop: vedle mapy portrét (~207×280 → 5:7), jinak skoro čtverec (~278×280 → 1:1)
  const desktopAr = hasMap ? '5:7' : '1:1'
  const desktopSizes = hasMap ? '210px' : '280px'
  const unoptimized = !isCloudinary(src)

  return (
    <>
      {/* Desktop (≥1024 px) */}
      <Image
        src={src}
        alt={alt}
        fill
        loader={cropLoader(`c_fill,g_auto,ar_${desktopAr}`)}
        sizes={desktopSizes}
        unoptimized={unoptimized}
        className={`hidden lg:block ${className ?? ''}`}
      />
      {/* Tablet (640–1023 px): dvě dlaždice vedle sebe, ale široké → na šířku */}
      <Image
        src={src}
        alt={alt}
        fill
        loader={cropLoader('c_fill,g_auto,ar_3:2')}
        sizes="50vw"
        unoptimized={unoptimized}
        className={`hidden sm:block lg:hidden ${className ?? ''}`}
      />
      {/* Mobil (<640 px): dvě dlaždice vedle sebe → karta na výšku (~172×240);
          jedna přes celou šířku → na šířku (3:2) a srcset na 100vw */}
      <Image
        src={src}
        alt={alt}
        fill
        loader={cropLoader(
          mobileLayout === 'full' ? 'c_fill,g_auto,ar_3:2' : 'c_fill,g_auto,ar_5:7',
        )}
        sizes={mobileLayout === 'full' ? '100vw' : '50vw'}
        unoptimized={unoptimized}
        className={`sm:hidden ${className ?? ''}`}
      />
    </>
  )
}
