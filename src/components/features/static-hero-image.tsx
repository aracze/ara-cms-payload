import Image from 'next/image'

interface StaticHeroImageProps {
  imageUrl: string | null
  /**
   * Popis fotky pro čtečky a Google Obrázky. Hero je největší obrázek stránky
   * a ilustruje její h1 → stránky předávají název místa/článku. Prázdný řetězec
   * jen u čistě dekorativních obálek (profil, přihlášení).
   */
  alt: string
  styleCss?: string
  /** Rozmazaný náhled (data URI) — zobrazí se, dokud se nenačte fotka. */
  blurDataURL?: string
}

/**
 * Vrátí hodnotu pro `object-position` z pole `featureImageStyleCss`.
 * Přijme `background-position: 50% 42%;`, `object-position: 50% 42%;`
 * i holé `50% 42%`. Prázdné / nerozpoznané → střed.
 */
function parseObjectPosition(styleCss?: string): string {
  if (!styleCss) return '50% 50%'
  const pos = styleCss
    .replace(/(?:background|object)-position\s*:\s*/i, '')
    .replace(/;/g, '')
    .trim()
  // Zbyla-li dvojtečka, šlo o jinou/nevalidní vlastnost → radši střed.
  if (!pos || pos.includes(':')) return '50% 50%'
  return pos
}

export const StaticHeroImage = ({ imageUrl, alt, styleCss, blurDataURL }: StaticHeroImageProps) => {
  // Bez obrázku necháme prosvítat tmavé pozadí sekce (bg-[#3b444f]).
  if (!imageUrl) return null

  return (
    <Image
      src={imageUrl}
      alt={alt}
      fill
      priority
      // Hero je přes celou šířku → prohlížeč si podle šířky okna a DPR vybere
      // přiměřenou variantu (mobil malou, retina desktop až originál).
      sizes="100vw"
      // Rozmazaný náhled (pár set bajtů přímo v HTML) překryje pozadí sekce od
      // první vteřiny, takže než dojde fotka, není vidět holá barva. Předává ho
      // jen profil — stránky mají hero fotku z CMS, kde náhled po ruce není.
      {...(blurDataURL ? { placeholder: 'blur' as const, blurDataURL } : {})}
      className="object-cover transition-transform duration-[10000ms] hover:scale-105"
      style={{ objectPosition: parseObjectPosition(styleCss) }}
    />
  )
}
