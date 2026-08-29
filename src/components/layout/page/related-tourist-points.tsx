import React from 'react'
import Link from 'next/link'
import { PlaceCardImage } from './place-card-image'
import { PhotoTile } from '@/components/features/photo-tile'

export interface RelatedTouristPointItem {
  id: number
  title: string
  fullSlug: string
  imageUrl: string | null
}

/**
 * Pás „Co dalšího vidět…" pod recenzemi na detailu cíle: až 4 karty sousedních
 * cílů stejného místa. Zobrazuje se jen při více než 2 sousedech (pravidlo
 * legacy webu). Bílé pozadí; karty = sdílená fotodlaždice PhotoTile (M 180);
 * nadpis navazuje na sekci „Co vidět…" ze stránek míst, vpravo odkaz na místo.
 */
export function RelatedTouristPoints({
  items,
  parentTitle,
  parentFullSlug,
  parentLocative,
}: {
  items: RelatedTouristPointItem[]
  parentTitle: string
  parentFullSlug: string
  parentLocative?: string | null
}) {
  if (items.length <= 2) return null
  const shown = items.slice(0, 4)
  const heading = parentLocative ? `Co dalšího vidět ${parentLocative}` : 'Co dalšího vidět'

  return (
    // Měkký stín odděluje CELÝ pruh od okolí nahoře i dole (legacy
    // .stripe-container); karty uvnitř jsou čisté (obrázek + název).
    <section className="relative w-full bg-white py-12 [box-shadow:0_0.3rem_2.9rem_0_rgba(0,0,0,0.08)]">
      <div className="mx-auto max-w-7xl px-4 md:px-12">
        <div className="mb-7 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h2 className="text-[22px] font-bold text-[#1a3f6c]">{heading}</h2>
          <Link
            href={parentFullSlug}
            className="inline-flex items-center gap-1.5 text-[14px] font-bold text-[#1a3f6c] transition-colors hover:text-[#d45145]"
          >
            {parentTitle}
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        {/* Sdílená fotodlaždice (M 180, titulek v obrázku) — jednotné s „Co vidět"
            i homepage; podoba s titulkem pod fotkou zrušena po živém srovnání
            (rozhodnutí uživatele 29. 8. 2026). */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {shown.map((item) => (
            <PhotoTile key={item.id} href={item.fullSlug} title={item.title} size="md">
              {item.imageUrl && (
                <PlaceCardImage
                  src={item.imageUrl}
                  alt={item.title}
                  hasMap={false}
                  className="object-cover"
                />
              )}
            </PhotoTile>
          ))}
        </div>
      </div>
    </section>
  )
}
