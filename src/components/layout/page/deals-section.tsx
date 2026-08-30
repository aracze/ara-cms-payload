import React from 'react'
import type { AffiliateDeals, AffiliateDealKiwi, AffiliateDealInvia } from '@/types/payload'
import { belowUsualPercent } from '@/lib/kiwi-deals'
import { DealCardImage } from './deal-card-image'

/**
 * Sekce „Akční nabídky {genitive}" (nástupce legacy `_highlights.gsp`):
 * nejlevnější ZPÁTEČNÍ letenka z ČR do destinace (Kiwi; trasa nese odletové
 * město, typicky „Praha ⇄ …") a nejlevnější zájezd s odletem z Prahy (Invia)
 * jako kompaktní řádkové karty s miniaturou (finální
 * „varianta B" z výběru 14. 8. 2026). Zobrazuje se jen na místech k navštívení
 * NAD sekcí „Co vidět" a jen když má stránka data (`affiliate.deals`, plní
 * denní sync /api/sync-affiliate-deals; místo bez vlastních dat dědí od
 * nejbližšího předka — viz page.tsx).
 *
 * Fotky: letenka nese fotku místa (Cloudinary), zájezd fotku hotelu z Invia
 * feedu (fallback na fotku místa) — karty tak nesdílí stejný obrázek. Odkazy
 * vedou přímo na kiwi.com/invia.cz (důvěryhodné domény, provizní parametry
 * nesou deep-linky samotné) a zdroj je přiznaný v drobném popisku.
 */

interface DealsSectionProps {
  /** Skloněný název místa vč. předložky, např. „do Anglie" (pole genitive). */
  genitive: string
  placeTitle: string
  /** Hlavní fotka místa — karta letenky a fallback karty zájezdu. */
  placeImageUrl: string | null
  deals: AffiliateDeals
}

/**
 * Type-guard nad JSON polem `affiliate.deals` — data píše stroj (sync
 * endpoint), ale JSON pole nemá v generovaných typech tvar a proti ručnímu
 * zásahu v DB je jistota lepší než cast.
 */
export function parseAffiliateDeals(raw: unknown): AffiliateDeals | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as AffiliateDeals
  const kiwiValid =
    value.kiwi != null &&
    typeof value.kiwi === 'object' &&
    typeof value.kiwi.price === 'number' &&
    value.kiwi.price > 0 &&
    typeof value.kiwi.deepLink === 'string' &&
    value.kiwi.deepLink.startsWith('https://') &&
    // Bez počtu nocí jde o záznam z doby jednosměrného hledání — karta dnes
    // slibuje zpáteční cestu, tak se radši nezobrazí a počká na sync.
    Number.isInteger(value.kiwi.nights) &&
    (value.kiwi.nights as number) > 0
  const inviaValid =
    value.invia != null &&
    typeof value.invia === 'object' &&
    typeof value.invia.price === 'number' &&
    value.invia.price > 0 &&
    typeof value.invia.deepLink === 'string' &&
    value.invia.deepLink.startsWith('https://')
  if (!kiwiValid && !inviaValid) return null
  // Metadata karet se koercují na bezpečné typy — guard je tu právě proti
  // ručnímu zásahu do JSON v DB a nestringový hotel/food by shodil render.
  const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
  return {
    kiwi: kiwiValid
      ? {
          price: value.kiwi!.price,
          deepLink: value.kiwi!.deepLink,
          departureDate: str(value.kiwi!.departureDate) ?? '',
          nights: value.kiwi!.nights!,
          departure: str(value.kiwi!.departure),
          usualPrice:
            typeof value.kiwi!.usualPrice === 'number' && value.kiwi!.usualPrice > 0
              ? value.kiwi!.usualPrice
              : null,
        }
      : null,
    invia: inviaValid
      ? {
          price: value.invia!.price,
          deepLink: value.invia!.deepLink,
          photoUrl: str(value.invia!.photoUrl),
          hotel: str(value.invia!.hotel) ?? '',
          termFrom: str(value.invia!.termFrom) ?? '',
          days:
            typeof value.invia!.days === 'number' && value.invia!.days > 0 ? value.invia!.days : 0,
          food: str(value.invia!.food),
        }
      : null,
  }
}

/** České skloňování délky zájezdu: 1 den, 2–4 dny, 5+ dní. */
export function dayCount(days: number): string {
  return `${days} ${days === 1 ? 'den' : days <= 4 ? 'dny' : 'dní'}`
}

/** Cena v korunách s českými mezerami (sdílí i homepage sekce nabídek dne). */
export const priceCzk = (price: number) => `${new Intl.NumberFormat('cs-CZ').format(price)} Kč`

/** „2026-10-13" → „13. 10. 2026"; neparsovatelné datum se nezobrazí. */
function formatDate(iso: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!match) return null
  return `${Number(match[3])}. ${Number(match[2])}. ${match[1]}`
}

/** České skloňování délky pobytu: 1 noc, 2–4 noci, 5+ nocí. */
export function nightCount(nights: number): string {
  return `${nights} ${nights === 1 ? 'noc' : nights <= 4 ? 'noci' : 'nocí'}`
}

// Sync hledá s délkou pobytu → cena je ZPÁTEČNÍ (viz fetchKiwiDeal).
function kiwiMeta(kiwi: AffiliateDealKiwi): string {
  const date = kiwi.departureDate ? formatDate(kiwi.departureDate) : null
  return [
    'zpáteční',
    date ? `odlet ${date}` : null,
    kiwi.nights ? nightCount(kiwi.nights) : null,
    'Kiwi.com',
  ]
    .filter(Boolean)
    .join(' · ')
}

function inviaMeta(invia: AffiliateDealInvia): string {
  const parts = [
    invia.hotel || null,
    invia.days > 0 ? dayCount(invia.days) : null,
    invia.food,
    'Invia',
  ].filter(Boolean)
  return parts.join(' · ')
}

export function DealsSection({ genitive, placeTitle, placeImageUrl, deals }: DealsSectionProps) {
  const kiwi = deals.kiwi ?? null
  const invia = deals.invia ?? null
  if (!kiwi && !invia) return null

  const inviaImage = invia ? invia.photoUrl || placeImageUrl : null

  return (
    <section className="w-full bg-white pt-16 pb-6">
      <div className="mx-auto max-w-7xl px-4 md:px-12">
        {/* Nadpis ve stejném vzoru jako sousední sekce („Co vidět…", Příprava). */}
        <div className="mb-12 flex flex-col items-center text-center">
          <h2 className="font-heading mb-3 text-3xl font-bold tracking-tight text-[#1a3f6c]">
            Akční nabídky {genitive}
          </h2>
          <div className="mb-5 h-[1px] w-[30px] rounded-full bg-[#d45145]"></div>
          <p className="max-w-xl text-[17px] leading-relaxed text-gray-400">
            Ceny se obnovují každý den, tak ať ti nabídka neuteče.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
          {kiwi && (
            <DealRowCard
              href={kiwi.deepLink}
              imageUrl={placeImageUrl}
              badge="flight"
              placeTitle={placeTitle}
              departure={kiwi.departure}
              belowUsual={belowUsualPercent(kiwi.price, kiwi.usualPrice)}
              priceLine={priceCzk(kiwi.price)}
              metaLine={kiwiMeta(kiwi)}
            />
          )}
          {invia && (
            <DealRowCard
              href={invia.deepLink}
              imageUrl={inviaImage}
              badge="tour"
              placeTitle={placeTitle}
              priceLine={priceCzk(invia.price)}
              metaLine={inviaMeta(invia)}
            />
          )}
        </div>
      </div>
    </section>
  )
}

/** Štítek Letenka/Zájezd (sdílí i homepage sekce nabídek dne). */
export function Badge({ kind, onPhoto = false }: { kind: 'flight' | 'tour'; onPhoto?: boolean }) {
  const palette = onPhoto
    ? kind === 'flight'
      ? 'bg-white/95 text-[#1a3f6c]'
      : 'bg-white/95 text-[#b8433a]'
    : kind === 'flight'
      ? 'bg-[#eaf1f8] text-[#1a3f6c]'
      : 'bg-[#fdf0ec] text-[#b8433a]'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10.5px] font-bold tracking-[0.09em] uppercase ${palette}`}
    >
      {kind === 'flight' ? (
        <PlaneIcon className="h-[11px] w-[11px]" />
      ) : (
        <UmbrellaIcon className="h-[11px] w-[11px]" />
      )}
      {kind === 'flight' ? 'Letenka' : 'Zájezd'}
    </span>
  )
}

/**
 * Štítek „−25 % než obvykle" u letenky: dnešní cena proti mediánu posledních
 * 90 dní (viz belowUsualPercent). Slovník schválně NE „sleva" — nikdo nic
 * nezlevnil, jen je dnes levněji než obvykle; proto i jiná barva než červený
 * štítek skutečné slevy zájezdu. Sdílí karty destinací i homepage dlaždice.
 */
export function UsualPriceBadge({ percent }: { percent: number }) {
  return (
    <span
      className="inline-flex items-center rounded-full bg-[#1a3f6c] px-2.5 py-0.5 text-[10.5px] font-bold tracking-[0.02em] text-white"
      title={`O ${percent} % levnější než obvyklá cena za posledních 90 dní`}
    >
      −{percent}&nbsp;% než&nbsp;obvykle
    </span>
  )
}

/**
 * Trasa odletové město ⇄ destinace — letenka i zájezd jsou tam a zpět.
 * Letenka nese město z Kiwi (z celé ČR), zájezd a starší záznamy Prahu.
 */
function Route({
  placeTitle,
  departure,
  className,
}: {
  placeTitle: string
  departure?: string | null
  className?: string
}) {
  return (
    <span
      className={`flex items-center gap-1.5 leading-snug font-bold text-[#252a31] ${className ?? ''}`}
    >
      {departure || 'Praha'}
      <SwapIcon className="h-4 w-4" />
      <span className="truncate">{placeTitle}</span>
    </span>
  )
}

/** Kompaktní řádková karta s miniaturou vlevo (finální varianta B). */
function DealRowCard({
  href,
  imageUrl,
  badge,
  placeTitle,
  departure,
  belowUsual,
  priceLine,
  metaLine,
}: {
  href: string
  imageUrl: string | null
  badge: 'flight' | 'tour'
  placeTitle: string
  /** Odletové město v ČR; chybí = Praha. */
  departure?: string | null
  /** Procenta pod obvyklou cenou (jen letenka); null = bez štítku. */
  belowUsual?: number | null
  priceLine: string
  metaLine: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="nofollow sponsored noopener"
      className="group flex gap-3.5 rounded-xl border border-[#e6ebf1] bg-white p-3 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(26,63,108,0.12)]"
    >
      <div className="relative min-h-[104px] w-[152px] shrink-0 overflow-hidden rounded-[9px] bg-[#e6ebf1]">
        {imageUrl && <DealCardImage src={imageUrl} alt={placeTitle} aspect="3:2" sizes="152px" />}
      </div>
      <div className="flex min-w-0 flex-col justify-center gap-0.5">
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge kind={badge} />
          {belowUsual != null && <UsualPriceBadge percent={belowUsual} />}
        </span>
        <Route placeTitle={placeTitle} departure={departure} className="text-[15px]" />
        <p className="text-[17px] leading-snug font-semibold text-[#1a3f6c] transition-colors group-hover:text-[#2a5a9c]">
          {priceLine}
        </p>
        <p className="truncate text-[12px] leading-normal text-[#74808f]">{metaLine}</p>
      </div>
    </a>
  )
}

/*
 * Ikony: letadlo a slunečník z Material Symbols (Apache 2.0), šipky ⇄
 * originál ze starého webu.
 */

function PlaneIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`shrink-0 fill-current ${className ?? ''}`}
      aria-hidden="true"
    >
      <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
    </svg>
  )
}

function UmbrellaIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`shrink-0 fill-current ${className ?? ''}`}
      aria-hidden="true"
    >
      <path d="M13.127 14.56l1.43-1.43 6.44 6.443L19.57 21zm4.293-5.73l2.86-2.86c-3.95-3.95-10.35-3.96-14.3-.02 3.93-1.3 8.31-.25 11.44 2.88zM5.95 5.98c-3.94 3.95-3.93 10.35.02 14.3l2.86-2.86C5.7 14.29 4.65 9.91 5.95 5.98zm.02-.02l-.01.01c-.38 3.01 1.17 6.88 4.3 10.02l5.73-5.73c-3.13-3.13-7.01-4.68-10.02-4.3z" />
    </svg>
  )
}

/** Šipky ⇄ (zájezd tam a zpět) — originální SVG ze starého webu. */
function SwapIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`shrink-0 fill-current ${className ?? ''}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <path d="m6.074 12.11-.086.073-2.804 2.921c-.22.22-.243.537-.066.732l.066.06 2.804 2.922a.56.56 0 0 0 .429.182c.331 0 .563-.197.606-.503l.007-.106V16.4l8.063.001a.905.905 0 0 0 .9-.787L16 15.5a.903.903 0 0 0-.793-.893l-.114-.007-8.063-.001v-1.99a.655.655 0 0 0-.184-.426.594.594 0 0 0-.772-.072Zm11.08-6.927a.655.655 0 0 0-.184.426v1.99L8.907 7.6l-.114.007A.903.903 0 0 0 8 8.5l.007.113a.905.905 0 0 0 .9.787l8.063-.001v1.992l.007.106c.043.306.275.503.606.503a.56.56 0 0 0 .43-.182l2.803-2.922.066-.06c.177-.195.155-.513-.066-.732l-2.803-2.921-.087-.073a.594.594 0 0 0-.772.073Z" />
    </svg>
  )
}
