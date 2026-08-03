import Link from 'next/link'
import Image from 'next/image'
import type { InspirationLink } from '@/types/payload'

// Dlaždicová sekce „Inspirace na cestu" na konci homepage — denní výběr míst
// s fotkou (schválený styl varianty A). Jméno místa sedí na lokálním gradientu
// u spodní hrany (žádné celoplošné ztmavení — viz designová pravidla).

export function InspirationPlacesSection({ places }: { places: InspirationLink[] }) {
  if (places.length === 0) return null

  return (
    <section aria-labelledby="inspiration-places-heading" className="max-w-5xl mx-auto text-left">
      <div className="flex items-baseline justify-between gap-x-6 gap-y-1 flex-wrap mb-4">
        <h2
          id="inspiration-places-heading"
          className="text-2xl font-bold text-gray-800 tracking-tight"
        >
          Inspirace na cestu
        </h2>
        <span className="text-[13px] text-gray-400">zítra tu najdete jiná místa</span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {places.map((place) => (
          <Link
            key={place.key}
            href={place.href}
            className="group relative block h-36 md:h-40 rounded-2xl overflow-hidden shadow-[0_4px_16px_-8px_rgba(0,0,0,0.18)]"
          >
            {place.imageUrl ? (
              <Image
                src={place.imageUrl}
                alt=""
                fill
                className="object-cover transition-transform duration-700 group-hover:scale-105"
                sizes="(max-width: 768px) 50vw, 25vw"
              />
            ) : (
              <span className="absolute inset-0 bg-gradient-to-br from-[#1a3f6c]/10 to-[#1a3f6c]/20" />
            )}
            <span
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-[#0f1a2a]/70 to-transparent"
            />
            <span className="absolute left-4 right-3 bottom-3 flex flex-col">
              <span className="text-white font-bold text-[17px] leading-tight [text-shadow:0_1px_3px_rgba(0,0,0,0.35)]">
                {place.title}
              </span>
              {place.sub && <span className="text-white/75 text-xs mt-0.5">{place.sub}</span>}
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
