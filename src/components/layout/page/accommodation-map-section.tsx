import React from 'react'
import { ArrowRight } from 'lucide-react'
import { MapLibreMap, type FitPadding } from '@/components/features/maplibre-map'
import type { AccommodationMapMarker } from '@/lib/payload'
import { BedIcon } from './legacy-icons'

/**
 * Blok v textu podstránky „Ubytování" (za prvním nadpisem a jeho odstavcem — viz
 * `midText` v MainContent): mapa místa s piny jeho turistických cílů a v levém
 * dolním rohu výzva „Hledat ubytování" vedoucí přes /go/ubytovani na Booking
 * (provize přes síť CJ). Nahrazuje mapový widget Bookingu ze starého webu, který
 * se zrušeným partnerským účtem nejde obnovit. Bez titulku nad mapou — mapa
 * navazuje rovnou na úvodní odstavec (rozhodnutí uživatele 4. 9. 2026). Místo
 * bez souřadnic dostane jen výzvu.
 */

// Štítek je nízký (~56 px) v levém dolním rohu — piny se dorámují nad něj. Konstanta modulu: mapa se při změně reference odsazení
// bourá a staví znovu.
const FIT_PADDING: FitPadding = { top: 56, right: 40, bottom: 92, left: 40 }

export interface AccommodationMapSectionProps {
  placeTitle: string
  /** 6. pád místa („na Zakynthosu") pro název výzvy; bez něj se použije název. */
  locative: string | null
  center: { lat: number; lng: number } | null
  /** Zoom v Google škále (jak ho ukládá CMS). */
  zoom: number
  markers: AccommodationMapMarker[]
  /** Cíl tlačítka — /go/ubytovani[/cesta] (viz accommodationHref). */
  href: string
}

export function AccommodationMapSection({
  placeTitle,
  locative,
  center,
  zoom,
  markers,
  href,
}: AccommodationMapSectionProps) {
  const title = locative ? `Ubytování ${locative}` : `Ubytování – ${placeTitle}`

  // Štítek: ikona, název a tlačítko v jedné oblé kapsli široké podle obsahu
  // (z variant vybral uživatel 5. 9. 2026 — nejméně zakrývá mapu, tlačítko
  // je přesto vidět hned).
  const chip = (
    <div className="inline-flex max-w-full flex-wrap items-center gap-3 rounded-full border border-[#e6ebf1] bg-white py-1.5 pl-4 pr-1.5 lg:shadow-[0_10px_28px_rgba(26,63,108,0.18)]">
      <span className="shrink-0 text-[#1a3f6c]" aria-hidden="true">
        <BedIcon height={22} />
      </span>
      <h3 className="font-heading text-[15px] font-bold leading-tight text-[#1a3f6c]">{title}</h3>
      <a
        href={href}
        target="_blank"
        rel="nofollow sponsored noopener"
        className="inline-flex items-center justify-center gap-2 rounded-full bg-[#215491] px-4 py-2.5 text-[13.5px] font-semibold text-white no-underline transition-colors hover:bg-[#1a4578] hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#215491] focus-visible:ring-offset-2"
      >
        Hledat
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </a>
    </div>
  )

  if (!center) {
    return <div className="my-10">{chip}</div>
  }

  return (
    <section className="my-10" aria-label={`${placeTitle} na mapě`}>
      <div className="relative">
        <MapLibreMap
          markers={markers}
          centerLat={center.lat}
          centerLng={center.lng}
          zoom={zoom}
          height="460px"
          fitToMarkers
          fitPadding={FIT_PADDING}
        />
        {/* Na širokém displeji štítek pluje v levém dolním rohu mapy (licenční
            text je sbalený do ⓘ vpravo, viz MapLibreMap), na užším stojí pod mapou. */}
        <div className="mt-4 lg:absolute lg:bottom-3.5 lg:left-3.5 lg:mt-0">{chip}</div>
      </div>
    </section>
  )
}
