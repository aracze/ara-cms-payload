'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { MapPin, Star, MessageCircle, type LucideIcon } from 'lucide-react'
import type { ActivityItem } from '@/types/payload'
import { formatCommentDate } from '@/lib/relative-time'
import { UserAvatar } from '@/components/user-avatar'
import { SectionHeading } from './section-heading'

// Sekce „Co je nového" — jeden proud novinek (nová místa + recenze + komentáře)
// s nenápadným filtrem. Nahrazuje záložkovou sekci starého webu; výchozí pohled
// je vždy „Vše", filtry jen zužují (schválený návrh „varianta 3").

type FilterKey = 'all' | ActivityItem['kind']

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Vše' },
  { key: 'place', label: 'Místa' },
  { key: 'review', label: 'Recenze' },
  { key: 'comment', label: 'Komentáře' },
]

const PAGE_SIZE = 5

// Přítomný čas záměrně — funguje pro všechny rody („Panda přidává", „Karel přidává").
const KIND_META: Record<
  ActivityItem['kind'],
  { verb: string; noAuthor: string; Icon: LucideIcon; badgeBg: string }
> = {
  place: {
    verb: 'přidává nové místo',
    noAuthor: 'Nové místo',
    Icon: MapPin,
    badgeBg: 'bg-[#215491]',
  },
  review: { verb: 'hodnotí', noAuthor: 'Recenze', Icon: Star, badgeBg: 'bg-[#d97706]' },
  comment: {
    verb: 'komentuje článek',
    noAuthor: 'Komentář k článku',
    Icon: MessageCircle,
    badgeBg: 'bg-[#2f7d9a]',
  },
}

export function WhatsNewSection({ items }: { items: ActivityItem[] }) {
  const [filter, setFilter] = useState<FilterKey>('all')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  if (items.length === 0) return null

  const filtered = filter === 'all' ? items : items.filter((item) => item.kind === filter)
  const shown = filtered.slice(0, visibleCount)

  return (
    // Pruh přes CELOU šířku okna jako „Co dalšího vidět" u cílů: vizuál
    // (bílé pozadí + měkký stín nahoře a dole) je absolutní vrstva probouraná
    // z obsahového sloupce ven; obsah zůstává ve sloupci. Přetečení o šířku
    // posuvníku hlídá html { overflow-x: clip } v globals.css.
    <section aria-labelledby="whats-new-heading" className="relative py-10 text-left">
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-1/2 w-screen -translate-x-1/2 pointer-events-none bg-white [box-shadow:0_0.3rem_2.9rem_0_rgba(0,0,0,0.08)]"
      />
      {/* Centrovaný nadpis jako ostatní sekce, filtry vpravo na úrovni nadpisu
          (na mobilu by se s ním tloukly, tam zůstávají pod ním na středu). */}
      <div className="relative">
        <SectionHeading id="whats-new-heading">Co je nového</SectionHeading>
        <div
          role="group"
          aria-label="Filtr novinek"
          className="-mt-2 mb-6 flex flex-wrap justify-center gap-2 md:absolute md:right-0 md:top-2 md:m-0 md:justify-end"
        >
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => {
                setFilter(f.key)
                setVisibleCount(PAGE_SIZE)
              }}
              className={`px-3.5 py-1 rounded-full text-[12.5px] font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#215491]/50 ${
                filter === f.key
                  ? 'bg-[#215491] border-[#215491] text-white'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-800'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative flex flex-col">
        {shown.map((item, index) => (
          <ActivityRow key={item.key} item={item} first={index === 0} />
        ))}
        {shown.length === 0 && (
          <p className="py-6 text-center text-sm text-gray-400">Zatím tu nic není.</p>
        )}
      </div>

      {filtered.length > visibleCount && (
        <div className="relative text-center mt-3">
          <button
            type="button"
            onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
            className="text-[13px] font-bold text-[#215491] hover:text-[#1a4579] tracking-wide px-4 py-2 rounded-lg hover:bg-[#215491]/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#215491]/50"
          >
            Zobrazit další ↓
          </button>
        </div>
      )}
    </section>
  )
}

function ActivityRow({ item, first }: { item: ActivityItem; first: boolean }) {
  const { relative, absolute } = formatCommentDate(item.date)
  const { verb, noAuthor, Icon, badgeBg } = KIND_META[item.kind]

  return (
    // Celý řádek kliká na cíl přes „roztažený" odkaz titulku (after:inset-0) —
    // vnořené <a> jsou nevalidní, takže jméno autora je samostatný odkaz NAD
    // překryvem (z-10).
    <div
      className={`group relative flex items-start gap-3.5 py-3 px-2.5 rounded-xl hover:bg-gray-50 transition-colors ${
        first ? '' : 'border-t border-gray-100'
      }`}
    >
      <span className="relative shrink-0">
        {item.image ? (
          <Image
            src={item.image}
            alt=""
            width={48}
            height={48}
            className="w-12 h-12 rounded-xl object-cover"
          />
        ) : (
          <UserAvatar name={item.authorName || '?'} avatarUrl={item.avatarUrl} size={48} />
        )}
        <span
          aria-hidden="true"
          className={`absolute -right-1.5 -bottom-1.5 w-[22px] h-[22px] rounded-full border-2 border-white flex items-center justify-center ${badgeBg}`}
        >
          <Icon
            className="w-[11px] h-[11px] text-white"
            strokeWidth={3}
            fill={item.kind === 'review' ? '#fff' : 'none'}
          />
        </span>
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-[15.5px] leading-snug text-gray-600">
          {item.authorName ? (
            <>
              {item.authorUsername ? (
                // Bez podtržení i tady — uvnitř celoklikacího řádku signalizují
                // odkazy jednotně jen barvou (titulek ztmavne, autor zmodrá).
                <Link
                  href={`/profil/${item.authorUsername}`}
                  className="relative z-10 font-bold text-gray-900 transition-colors hover:text-[#215491]"
                >
                  {item.authorName}
                </Link>
              ) : (
                <b className="font-bold text-gray-900">{item.authorName}</b>
              )}{' '}
              {verb}{' '}
            </>
          ) : (
            <>{noAuthor}: </>
          )}
          {/* Bez podtržení — web podtrhává jen při najetí přímo na odkaz
              (autoři); u celoklikacího řádku stačí pozadí + ztmavení barvy. */}
          <Link
            href={item.href}
            className="font-bold text-[#215491] transition-colors group-hover:text-[#1a4579] after:absolute after:inset-0"
          >
            {item.title}
          </Link>
          {item.kind === 'review' && item.rating != null && (
            <span
              className="ml-1.5 text-[13px] tracking-[0.08em] text-[#d97706]"
              aria-label={`hodnocení ${item.rating} z 5`}
            >
              {'★'.repeat(item.rating)}
            </span>
          )}
        </span>
        {(item.context || item.text) && (
          <span className="block text-sm text-gray-400 truncate mt-0.5">
            {item.context && <span className="text-gray-500 font-semibold">{item.context}</span>}
            {item.context && item.text && ' — '}
            {item.text && (item.kind === 'place' ? item.text : `„${item.text}"`)}
          </span>
        )}
      </span>

      {relative && (
        <time
          dateTime={item.date ?? undefined}
          title={absolute}
          className="shrink-0 pt-0.5 text-[13px] text-gray-400 whitespace-nowrap"
        >
          {relative}
        </time>
      )}
    </div>
  )
}
