import Image from 'next/image'
import type { InspirationLink } from '@/types/payload'
import { SectionHeading } from './section-heading'
import { PhotoTile } from '@/components/features/photo-tile'

// Dlaždicová sekce „Inspirace na cestu" (pod sekcí článků) — denní výběr míst
// s fotkou. Dlaždice = sdílená PhotoTile (S 150), viz photo-tile.tsx.

export function InspirationPlacesSection({ places }: { places: InspirationLink[] }) {
  if (places.length === 0) return null

  return (
    <section aria-labelledby="inspiration-places-heading" className="max-w-5xl mx-auto text-left">
      <SectionHeading id="inspiration-places-heading">Inspirace na cestu</SectionHeading>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {places.map((place) => (
          <PhotoTile
            key={place.key}
            href={place.href}
            title={place.title}
            sub={place.sub}
            size="sm"
          >
            {place.imageUrl && (
              <Image
                src={place.imageUrl}
                alt=""
                fill
                className="object-cover"
                sizes="(max-width: 768px) 50vw, 25vw"
              />
            )}
          </PhotoTile>
        ))}
      </div>
    </section>
  )
}
