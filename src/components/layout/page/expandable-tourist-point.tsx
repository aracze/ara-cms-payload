'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Globe, MapPin } from 'lucide-react'
import { isCloudinary } from '@/lib/cloudinary-loader'
import { reviewsCountLabel, websiteHref, websiteLabel } from '@/lib/utils'
import { StarRating } from '@/components/features/reviews/star-rating'
import { StarInput } from '@/components/features/reviews/star-input'
import {
  InlineReviews,
  type InlineReviewRateRequest,
} from '@/components/features/reviews/inline-reviews'
import { UserAvatar } from '@/components/user-avatar'

/** Autor cíle pro výpis — bezpečná mini podoba (jen avatar + jméno). */
export interface TouristPointAuthor {
  name: string
  avatarUrl: string | null
  profileHref: string | null
}

interface ExpandableTouristPointProps {
  id: string | number
  title: string
  fullSlug: string
  imageUrl: string | null
  previewText: string
  fullHtml: string
  hasMoreContent: boolean
  /** Počet recenzí cíle (0/undefined = řádek hodnocení se nezobrazí). */
  reviewCount?: number
  /** Průměrné hodnocení 1–5 (zobrazí se zaokrouhlené na půl hvězdičky jako legacy). */
  reviewAvg?: number
  /** Turnstile site key pro inline formulář recenze (null = bez widgetu). */
  turnstileSiteKey?: string | null
  /** Adresa cíle (detail.googleMapsAddress) — řádek s ikonou pod názvem. */
  address?: string | null
  /** Oficiální web cíle (detail.website) — odkaz s ikonou pod názvem. */
  websiteUrl?: string | null
  /** Autor cíle — po rozbalení jako podpis hned pod textem. */
  author?: TouristPointAuthor | null
}

/**
 * Cíl ve výpisu „Co vidět…". Rozbalení („Zobrazit více") ukáže celý text
 * A POD NÍM recenze cíle (varianta A — vše na stránce místa): výpis + formulář
 * řeší InlineReviews, který se mountuje až po rozbalení (líné načtení).
 *
 * Vstupy do rozbalení: tlačítko v akcích, hodnocení vedle názvu (naroluje
 * rovnou na recenze) a kotva v URL (#golden-gate-bridge) — funguje pro
 * sdílené odkazy i budoucí proklik ze špendlíku mapy.
 */
export function ExpandableTouristPoint({
  id,
  title,
  fullSlug,
  imageUrl,
  previewText,
  fullHtml,
  hasMoreContent,
  reviewCount,
  reviewAvg,
  turnstileSiteKey = null,
  address = null,
  websiteUrl = null,
  author = null,
}: ExpandableTouristPointProps) {
  const [expanded, setExpanded] = useState(false)
  const [rateRequest, setRateRequest] = useState<InlineReviewRateRequest | null>(null)
  const articleRef = useRef<HTMLElement>(null)
  const reviewsRef = useRef<HTMLDivElement>(null)
  const rateNonceRef = useRef(0)

  const showRating = !!reviewCount && reviewCount > 0 && reviewAvg != null
  // Kotva cíle = poslední segment slugu (např. golden-gate-bridge).
  const anchor = fullSlug.split('/').filter(Boolean).pop() ?? ''

  // Deep-link: /usa/san-francisco#golden-gate-bridge cíl rovnou rozbalí a naroluje.
  // setState běží až v timeoutu — synchronní setState v efektu zakazuje ESLint
  // (kaskádové rendery), stejný vzor jako u formuláře komentářů.
  useEffect(() => {
    if (!anchor) return
    let hash = ''
    try {
      hash = decodeURIComponent(window.location.hash)
    } catch {
      hash = window.location.hash
    }
    if (hash !== `#${anchor}`) return
    const t = window.setTimeout(() => {
      setExpanded(true)
      window.setTimeout(() => articleRef.current?.scrollIntoView({ block: 'start' }), 50)
    }, 0)
    return () => window.clearTimeout(t)
  }, [anchor])

  const openReviews = () => {
    setExpanded(true)
    // Po vykreslení rozbaleného obsahu naroluj na blok recenzí.
    window.setTimeout(
      () => reviewsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      100,
    )
  }

  // „Ohodnoť jako první": rozbal cíl a předej formuláři vybraný počet hvězd
  // (0 = jen otevřít) přes prop — nonce zajistí reakci i na opakované kliknutí.
  const rateFirst = (stars: number) => {
    rateNonceRef.current += 1
    setRateRequest({ rating: stars, nonce: rateNonceRef.current })
    setExpanded(true)
    window.setTimeout(
      () => reviewsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      100,
    )
  }

  // Sbalený stav: cíle bez delšího textu rozbalují jen recenze — popisek to říká.
  const collapsedLabel = hasMoreContent
    ? 'Zobrazit více'
    : showRating
      ? `Recenze (${reviewCount})`
      : 'Napsat recenzi'

  return (
    <article
      ref={articleRef}
      id={anchor || undefined}
      data-poiid={id}
      className="poi-article group scroll-mt-24"
    >
      {/* Hlavička: název + hvězdičky na JEDNOM řádku, pod nimi adresa a web */}
      <div className="px-2 sm:px-6">
        <div
          className={`flex flex-wrap items-center gap-x-12 gap-y-1 ${address || websiteUrl ? 'mb-2' : 'mb-2'}`}
        >
          <Link href={fullSlug} className="block">
            <h2 className="text-[22px] sm:text-[26px] font-bold text-[#1a3f6c] leading-snug hover:text-[#2a5a9c] transition-colors">
              {title}
            </h2>
          </Link>

          {/* Hodnocení vedle názvu:
              — S recenzemi: PRŮMĚR (zobrazení, půl hvězdičky jako legacy finalRating);
                klik rozbalí cíl a naroluje na recenze.
              — Bez recenzí: hvězdičky jsou VSTUP („Ohodnoť jako první") — klik
                rozbalí cíl a otevře formulář s předvyplněným počtem hvězd. */}
          {showRating ? (
            <button
              type="button"
              onClick={openReviews}
              className="inline-flex items-center gap-2 text-[13px] text-[#888] hover:text-[#1a3f6c] transition-colors"
            >
              <StarRating rating={Math.round(reviewAvg! * 2) / 2} size={14} />
              <span>
                {reviewCount} {reviewsCountLabel(reviewCount!)}
              </span>
            </button>
          ) : (
            <span className="inline-flex items-center gap-2 text-[13px] text-[#888]">
              {/* Stejná velikost i plný styl jako průměr u ohodnocených cílů —
                  hlavičky v seznamu vypadají jednotně a nekřičí. */}
              <StarInput value={0} onSelect={rateFirst} size={14} appearance="filled" />
              <button
                type="button"
                onClick={() => rateFirst(0)}
                className="hover:text-[#1a3f6c] transition-colors"
              >
                Ohodnoť jako první
              </button>
            </span>
          )}
        </div>

        {/* Rychlá fakta: adresa a oficiální web (tichý řádek s ikonami, vzor Google Maps) */}
        {(address || websiteUrl) && (
          <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13.5px] leading-snug text-[#6b7681]">
            {address && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin
                  aria-hidden="true"
                  className="h-[15px] w-[15px] shrink-0 text-[#9aa6b1]"
                  strokeWidth={1.8}
                />
                {address}
              </span>
            )}
            {websiteUrl && (
              <a
                href={websiteHref(websiteUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-semibold text-[#215491] hover:underline"
              >
                <Globe
                  aria-hidden="true"
                  className="h-[15px] w-[15px] shrink-0 text-[#9aa6b1]"
                  strokeWidth={1.8}
                />
                {websiteLabel(websiteUrl)}
              </a>
            )}
          </div>
        )}
      </div>

      {/* Image */}
      {imageUrl && (
        <Link href={fullSlug} className="block mb-5">
          <div className="relative w-full h-[320px] rounded-xl overflow-hidden shadow-sm">
            <Image
              src={imageUrl}
              alt={title}
              fill
              className="object-cover transition-transform duration-700 hover:scale-[1.03]"
              sizes="(max-width: 1024px) 100vw, 56vw"
              unoptimized={!isCloudinary(imageUrl)}
            />
          </div>
        </Link>
      )}

      {/* Text — preview or full */}
      <div className="px-2 sm:px-6">
        {expanded ? (
          // Dopisový podpis „— jméno" navazuje PŘÍMO za poslední větou textu:
          // poslední odstavec se přepne na inline (jen když je podpis), takže
          // podpis pluje na stejné řádce a při nedostatku místa se přirozeně
          // zalomí. Obal s display:contents nechá odstavce z HTML chovat se
          // jako přímé děti (kvůli selektorům i toku řádků).
          <div
            className={`text-[16px] text-[#4a4a4a] leading-[1.85] tracking-[0.01rem] mb-4 [&_p]:mb-4 [&_p:last-child]:mb-0 ${author ? '[&_p:last-child]:inline' : ''}`}
          >
            {hasMoreContent ? (
              <div className="contents" dangerouslySetInnerHTML={{ __html: fullHtml }} />
            ) : (
              previewText
            )}
            {author && (
              <span className="ml-3 inline-flex items-center gap-2 whitespace-nowrap text-[13.5px] italic text-[#8b959f]">
                {author.profileHref ? (
                  <Link href={author.profileHref} className="hover:underline">
                    —&nbsp;<span className="font-semibold text-[#565656]">{author.name}</span>
                  </Link>
                ) : (
                  <span>
                    —&nbsp;<span className="font-semibold text-[#565656]">{author.name}</span>
                  </span>
                )}
                <UserAvatar
                  name={author.name}
                  avatarUrl={author.avatarUrl}
                  size={24}
                  className="border-2"
                />
              </span>
            )}
          </div>
        ) : (
          <p className="text-[16px] text-[#4a4a4a] leading-[1.85] tracking-[0.01rem] mb-4">
            {previewText}
          </p>
        )}

        {/* Actions row */}
        <div className="flex items-center gap-4 flex-wrap">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#1a3f6c] hover:text-[#d45145] transition-colors"
          >
            {expanded ? 'Zobrazit méně' : collapsedLabel}
            <svg
              className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <Link
            href={fullSlug}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#888] hover:text-[#1a3f6c] transition-colors"
          >
            Otevřít stránku
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </Link>
        </div>

        {/* Recenze — mountují se až po rozbalení (líné načtení dat uvnitř). */}
        {expanded && (
          <div ref={reviewsRef} className="scroll-mt-24">
            <InlineReviews
              pageId={Number(id)}
              pageTitle={title}
              turnstileSiteKey={turnstileSiteKey}
              rateRequest={rateRequest}
            />
          </div>
        )}
      </div>
    </article>
  )
}
