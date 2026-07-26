import React from 'react'
import Link from 'next/link'
import { PageCategory, PageChild, RichTextRoot } from '@/types/payload'
import { GoogleMap, MapMarker } from '@/components/features/google-map'
import { richTextToHtml } from '@/lib/rich-text-html'
import { getTurnstileSiteKey } from '@/lib/comment-spam'
import { ExpandableTouristPoint, type TouristPointAuthor } from './expandable-tourist-point'
import { PlaceCardImage } from './place-card-image'
import type { PageReviewStats } from '@/lib/payload'

/**
 * Autor cíle pro výpis — VÝHRADNĚ z veřejného virtuálního pole `createdByPublic`
 * (bezpečná podmnožina; surová relace createdBy se na frontend nevystavuje).
 * Mini podoba: jen avatar + jméno (username, případně jméno a příjmení).
 */
function touristPointAuthor(child: PageChild): TouristPointAuthor | null {
  const author = child.createdByPublic
  if (!author) return null
  const name =
    author.username || [author.firstName, author.lastName].filter(Boolean).join(' ') || null
  if (!name) return null
  return {
    name,
    avatarUrl: author.avatar?.url ?? null,
    profileHref: author.username ? `/profil/${author.username}` : null,
  }
}

interface PlacesToVisitProps {
  pageChildren: PageChild[]
  mapCenter?: { lat: number; lng: number } | null
  mapZoom?: number
  /** Map from child page ID → resolved image URL */
  imageUrlMap?: Map<number | string, string>
  /** Title of the parent page (e.g. "Dubrovníku") for the section heading */
  parentLocative?: string | null
  /** Souhrny recenzí dětí (id → počet + průměr) pro hvězdičky ve výpisu cílů */
  reviewStats?: Record<number, PageReviewStats>
}

function getFullHtml(text: string | RichTextRoot | null | undefined): string {
  if (!text) return ''
  // richTextToHtml je centrální sanitizační hranice (DOMPurify) — string i
  // RichTextRoot musí projít přes ni, ať se nevrací neošetřené HTML.
  return richTextToHtml(text)
}

/** Plain-text náhled odvozený z už vyrenderovaného HTML (bez dalšího renderu). */
function htmlToPlain(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&[^;]+;/g, ' ')
    .trim()
}

function toPreviewText(plain: string, maxLength = 280): string {
  if (plain.length <= maxLength) return plain
  return plain.slice(0, maxLength).replace(/\s+\S*$/, '') + '...'
}

export const PlacesToVisit: React.FC<PlacesToVisitProps> = ({
  pageChildren,
  mapCenter,
  mapZoom = 7,
  imageUrlMap,
  parentLocative,
  reviewStats,
}) => {
  const placeCategories = [
    PageCategory.Misto_k_navstiveni,
    PageCategory.Turisticky_cil,
    PageCategory.Mista,
  ]

  const places = pageChildren.filter((child) => {
    const cat = child.category?.trim()
    return cat && placeCategories.includes(cat as PageCategory)
  })

  if (places.length === 0) return null

  // Determine mode: if any child is "Místo k navštívení" or "Místa" → grid cards (superordinate)
  // If ALL children are "Turistický cíl" → inline article list (last-parent / detail)
  const hasPlaceChildren = places.some((p) => {
    const cat = p.category?.trim()
    return cat === PageCategory.Misto_k_navstiveni || cat === PageCategory.Mista
  })
  const isSuperordinate = hasPlaceChildren

  // Build map markers from places that have coordinates
  const markers: MapMarker[] = places
    .filter((p) => p.detail?.latitude && p.detail?.longitude)
    .map((p) => ({
      id: p.id,
      title: p.title,
      fullSlug: p.fullSlug,
      lat: parseFloat(p.detail!.latitude!),
      lng: parseFloat(p.detail!.longitude!),
      imageUrl: imageUrlMap?.get(p.id) ?? null,
    }))

  const hasMap = mapCenter && markers.length > 0

  const sectionTitle = parentLocative ? `Co vidět ${parentLocative}` : 'Co vidět v této oblasti'

  return (
    <section id="mista" className="w-full py-16 bg-white">
      <div className="max-w-7xl mx-auto px-4 md:px-12">
        <div className="flex flex-col mb-12 items-center text-center">
          <h2 className="text-3xl font-bold text-[#1a3f6c] mb-3 font-heading tracking-tight">
            {sectionTitle}
          </h2>
          <div className="w-[30px] h-[1px] bg-[#d45145] rounded-full mb-5"></div>
          <p className="text-[17px] text-gray-400 max-w-xl leading-relaxed">
            {parentLocative
              ? `Objevte nejkrásnější místa. Co vidět a kam ${parentLocative} vyrazit.`
              : 'Objevte nejkrásnější místa. Co vidět a kam vyrazit.'}
          </p>
        </div>

        <div className={hasMap ? 'flex flex-col lg:flex-row gap-6' : ''}>
          {/* Place cards or tourist point articles */}
          <div className={hasMap ? 'w-full lg:w-[56%]' : 'w-full'}>
            {isSuperordinate ? (
              <SuperordinateGrid places={places} imageUrlMap={imageUrlMap} hasMap={!!hasMap} />
            ) : (
              <TouristPointList
                places={places}
                imageUrlMap={imageUrlMap}
                reviewStats={reviewStats}
                turnstileSiteKey={getTurnstileSiteKey()}
              />
            )}
          </div>

          {/* Map */}
          {hasMap && (
            <div className="w-full lg:w-[44%]">
              <div className="lg:sticky lg:top-5">
                <GoogleMap
                  markers={markers}
                  centerLat={mapCenter.lat}
                  centerLng={mapCenter.lng}
                  zoom={mapZoom}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

/** Grid of place cards (for superordinate pages like Chorvatsko) */
function SuperordinateGrid({
  places,
  imageUrlMap,
  hasMap,
}: {
  places: PageChild[]
  imageUrlMap?: Map<number | string, string>
  hasMap: boolean
}) {
  return (
    <div
      className={
        hasMap
          ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5'
          : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6'
      }
    >
      {places.map((place) => {
        const imageUrl = imageUrlMap?.get(place.id) ?? null
        return (
          <Link
            key={place.id}
            href={place.fullSlug}
            data-poiid={place.id}
            className="poi-article group relative flex flex-col bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-xl transition-all duration-500 h-[280px]"
          >
            <div className="relative h-full w-full overflow-hidden">
              {imageUrl ? (
                <PlaceCardImage
                  src={imageUrl}
                  alt={place.title}
                  hasMap={hasMap}
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-[#1a3f6c]/5 to-[#1a3f6c]/10 flex items-center justify-center">
                  <span className="text-[#1a3f6c]/20 font-bold uppercase tracking-[0.2em] text-[10px]">
                    Bez náhledu
                  </span>
                </div>
              )}
              <div className="absolute top-3 left-3 w-7 h-7 bg-white/80 rounded-full flex items-center justify-center shadow-sm">
                <svg className="w-4 h-4 text-[#1a3f6c]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                </svg>
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent"></div>
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <h3 className="text-lg font-bold text-white leading-tight drop-shadow-md">
                  {place.title}
                </h3>
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}

/** Inline article list for tourist points (like Dubrovník's children) */
function TouristPointList({
  places,
  imageUrlMap,
  reviewStats,
  turnstileSiteKey,
}: {
  places: PageChild[]
  imageUrlMap?: Map<number | string, string>
  reviewStats?: Record<number, PageReviewStats>
  turnstileSiteKey?: string | null
}) {
  return (
    <div className="divide-y divide-gray-100">
      {places.map((place, index) => {
        const imageUrl = imageUrlMap?.get(place.id) ?? null
        // richTextToHtml voláme jen jednou; náhled i délku odvodíme z výsledku.
        const fullHtml = getFullHtml(place.text)
        const plainFull = htmlToPlain(fullHtml)
        const previewText = toPreviewText(plainFull)
        const hasMoreContent = plainFull.length > 280
        const stats = reviewStats?.[Number(place.id)]

        return (
          <div key={place.id} className={`${index > 0 ? 'pt-10' : ''} pb-10`}>
            <ExpandableTouristPoint
              id={place.id}
              title={place.title}
              fullSlug={place.fullSlug}
              imageUrl={imageUrl}
              previewText={previewText}
              fullHtml={fullHtml}
              hasMoreContent={hasMoreContent}
              reviewCount={stats?.count}
              reviewAvg={stats?.avg}
              turnstileSiteKey={turnstileSiteKey}
              address={place.detail?.googleMapsAddress ?? null}
              websiteUrl={place.detail?.website ?? null}
              author={touristPointAuthor(place)}
            />
          </div>
        )
      })}
    </div>
  )
}
