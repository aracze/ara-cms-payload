'use client'

import Image from 'next/image'
import { cloudinaryVariant, isCloudinary } from '@/lib/cloudinary-loader'

/**
 * Fotka deal karty v sekci „Akční nabídky". Cloudinary zdroje (fotka místa)
 * se ořezávají na poměr karty (`c_fill,g_auto`), externí fotky z Invia feedu
 * (inviacdn.net) transformovat nejdou → `unoptimized` a ořez řeší CSS
 * `object-cover`. Stejný vzor jako PlaceCardImage.
 */
export function DealCardImage({
  src,
  alt,
  aspect = '2:1',
  sizes = '(min-width: 768px) 50vw, 100vw',
}: {
  src: string
  alt: string
  /** Poměr Cloudinary ořezu — velká karta 2:1 / 21:8, miniatura 3:2, dlaždice 16:9. */
  aspect?: '2:1' | '21:8' | '3:2' | '16:9'
  sizes?: string
}) {
  const unoptimized = !isCloudinary(src)
  return (
    <Image
      src={src}
      alt={alt}
      fill
      loader={({ src: s, width }) =>
        cloudinaryVariant(s, `f_auto,q_auto,c_fill,g_auto,ar_${aspect},w_${width}`)
      }
      sizes={sizes}
      unoptimized={unoptimized}
      className="object-cover transition-transform duration-300 ease-in group-hover:scale-105"
    />
  )
}
