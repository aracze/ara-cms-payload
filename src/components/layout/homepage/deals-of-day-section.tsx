import React from 'react'
import type { TopAffiliateDeal } from '@/lib/payload'
import { Badge, dayCount, nightCount, priceCzk } from '../page/deals-section'
import { DealCardImage } from '../page/deal-card-image'

/**
 * Homepage sekce „Dnešní akční nabídky": 4 nejlevnější letenky z Prahy
 * (dlaždice — finální „ukázka 1" z výběru 14. 8. 2026) a 4 zájezdy
 * z kurátorovaného Invia feedu řazené podle slevy (globál Homepage →
 * `dealsOfDay`, výběr 28. 8. 2026; bez feedu spadnou na nejlevnější zájezdy
 * destinací — viz fetchTopAffiliateDeals). Data plní denní sync
 * /api/sync-affiliate-deals; bez dat se sekce nezobrazí. Letenky nesou fotku
 * destinace, zájezdy fotku hotelu; ceny letenek jsou ZPÁTEČNÍ včetně délky
 * pobytu (viz fetchKiwiDeal).
 */

/** „2026-11-12" → „12. 11." (rok se na kompaktní dlaždici vynechává). */
function shortDate(iso: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!match) return null
  return `${Number(match[3])}. ${Number(match[2])}.`
}

/** „pro čtvrtek 14. srpna" — dnešek v pražském čase. */
function todayLabel(): string {
  return new Intl.DateTimeFormat('cs-CZ', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Prague',
  }).format(new Date())
}

export function DealsOfDaySection({
  flights,
  tours,
}: {
  flights: TopAffiliateDeal[]
  tours: TopAffiliateDeal[]
}) {
  if (flights.length === 0 && tours.length === 0) return null

  return (
    // max-w-5xl = stejná šířka jako ostatní panely homepage (Inspirace…).
    <section className="mx-auto max-w-5xl">
      <div className="mb-10 flex flex-col items-center text-center">
        <h2 className="font-heading mb-3 text-3xl font-bold tracking-tight text-[#1a3f6c]">
          Dnešní akční nabídky
        </h2>
        <div className="mb-5 h-[1px] w-[30px] rounded-full bg-[#d45145]"></div>
        <p className="max-w-xl text-[17px] leading-relaxed text-gray-400">
          Akční letenky a zájezdy z Prahy pro {todayLabel()}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-[18px]">
        {flights.map((deal) => (
          <DealTile key={deal.deepLink} deal={deal} badge="flight" metaLine={flightMeta(deal)} />
        ))}
        {tours.map((deal) => (
          <DealTile key={deal.deepLink} deal={deal} badge="tour" metaLine={tourMeta(deal)} />
        ))}
      </div>
    </section>
  )
}

function flightMeta(deal: TopAffiliateDeal): string {
  // Dlaždice je úzká, tak jen to nejdůležitější: že je cena zpáteční a jak
  // dlouhý pobyt. Datum odletu se vejde až na detailu místa.
  // (shortDate umí vrátit null — bez kontroly by se vykreslilo „odlet null".)
  const departure = deal.departureDate ? shortDate(deal.departureDate) : null
  return [
    'zpáteční',
    deal.nights ? nightCount(deal.nights) : departure ? `odlet ${departure}` : null,
    'Kiwi.com',
  ]
    .filter(Boolean)
    .join(' · ')
}

/** „Egypt – Marsa Alam"; bez lokality jen země (letenky lokalitu nemají). */
function fullTitle(deal: TopAffiliateDeal): string {
  return deal.locality ? `${deal.title} – ${deal.locality}` : deal.title
}

/**
 * Titulek dlaždice: dlouhé kombinace by CSS truncate ořízl zrovna o lokalitu
 * („Spojené arabské emiráty – …"), tak se u nich nechává jen země. Hranice
 * odpovídá šířce dlaždice (4 sloupce, 14.5 px bold) — proto žije tady
 * u stylů, ne v datové vrstvě.
 */
const TITLE_MAX_CHARS = 26
function tileTitle(deal: TopAffiliateDeal): string {
  const full = fullTitle(deal)
  return full.length <= TITLE_MAX_CHARS ? full : deal.title
}

function tourMeta(deal: TopAffiliateDeal): string {
  return [deal.hotel, deal.days && deal.days > 0 ? dayCount(deal.days) : null, 'Invia']
    .filter(Boolean)
    .join(' · ')
}

function DealTile({
  deal,
  badge,
  metaLine,
}: {
  deal: TopAffiliateDeal
  badge: 'flight' | 'tour'
  metaLine: string
}) {
  return (
    <a
      href={deal.deepLink}
      target="_blank"
      rel="nofollow sponsored noopener"
      className="group block overflow-hidden rounded-xl border border-[#e6ebf1] bg-white text-left transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(26,63,108,0.12)]"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-[#e6ebf1]">
        {deal.imageUrl && (
          <DealCardImage
            src={deal.imageUrl}
            alt={fullTitle(deal)}
            aspect="16:9"
            sizes="(min-width: 768px) 25vw, 50vw"
          />
        )}
        <span className="absolute top-2 left-2 z-10">
          <Badge kind={badge} onPhoto />
        </span>
        {/* Sleva z Invia feedu — hlavní lákadlo kurátorovaných zájezdů, proto
            výrazně na fotce (vzor úvodky invia.cz); bez slevy se štítek nekreslí. */}
        {typeof deal.discount === 'number' && deal.discount > 0 && (
          <span className="absolute top-2 right-2 z-10 rounded-full bg-[#d45145] px-2.5 py-0.5 text-[11.5px] font-bold text-white">
            −{deal.discount}&nbsp;%
          </span>
        )}
      </div>
      <div className="px-3 pt-2.5 pb-3">
        <p className="truncate text-[14.5px] leading-snug font-bold text-[#252a31]">
          {tileTitle(deal)}
        </p>
        <p className="text-[16px] leading-snug font-semibold text-[#1a3f6c] transition-colors group-hover:text-[#2a5a9c]">
          {priceCzk(deal.price)}
        </p>
        <p className="truncate text-[11.5px] leading-normal text-[#74808f]">{metaLine}</p>
      </div>
    </a>
  )
}
