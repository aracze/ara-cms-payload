import React from 'react'
import Link from 'next/link'
import type { Page } from '@/types/payload'
import { HeartIcon, TravelIcon, BedIcon, CarIcon, GuideIcon } from './legacy-icons'

/**
 * Sekce „Příprava do …“ (parita s legacy `_affiliate.gsp`): karty s odkazy na
 * pojištění, zájezdy, ubytování, půjčení auta a Praktické informace. Zobrazuje
 * se jen na místech k navštívení, mezi „Co vidět“ a „Články a cestopisy“.
 *
 * Partnerské odkazy: stránka s vyplněným polem `affiliate` v CMS má deep-link
 * pro svou destinaci, jinak vede karta na obecný redirect /go/* (cíle
 * editovatelné v adminu, viz `src/lib/affiliate.ts`). Fallback na odkazy
 * RODIČE (legacy breadcrumbParent) záměrně není — dědění po rodiči vyřešil
 * jednorázový doběh, který deep-linky zapsal přímo do CMS (hotový a
 * odstraněný, viz README „Sekce Příprava do …").
 */

export interface PreparationPracticalInfo {
  fullSlug: string
  ownerTitle: string
  ownerGenitive: string | null
}

interface PreparationSectionProps {
  /** Skloněný název místa vč. předložky, např. „do Anglie“ (pole genitive). */
  genitive: string
  /** Deep-linky destinace z CMS; prázdné pole = obecný výchozí odkaz. */
  affiliate: Page['affiliate']
  /** Odkaz na Praktické informace nejbližšího místa (stejný zdroj jako karta v panelu). */
  practicalInfo: PreparationPracticalInfo | null
}

/**
 * Půjčení auta vede přes vlastní redirect /go/auta[/cesta] (route handler
 * v `src/app/(frontend)/go/auta/`) na DiscoverCars — starý partner Rentalcars
 * program ukončil (Booking Holdings, stejně jako přímý program Bookingu).
 * CMS ale pořád drží staré Rentalcars adresy s `countryCode` — mapa je
 * překládá na stránky zemí DiscoverCars (ověřeno proti jejich webu 14. 8.
 * 2026). Kdo v mapě není (US/RU/CV tam stránku nemají), vede na homepage —
 * provize se počítá i tam. Nové adresy z jejich Landing page generatoru
 * (discovercars.com/cz/...) lze vkládat rovnou do CMS, helper je převezme.
 */
const RENTALCARS_COUNTRY_TO_DISCOVERCARS: Record<string, string> = {
  al: 'albania',
  ar: 'argentina',
  at: 'austria',
  ba: 'bosnia-and-herzegovina',
  be: 'belgium',
  bg: 'bulgaria',
  br: 'brazil',
  ch: 'switzerland',
  cn: 'china',
  cy: 'cyprus',
  cz: 'czech-republic',
  de: 'germany',
  dk: 'denmark',
  ec: 'ecuador',
  ee: 'estonia',
  es: 'spain',
  fi: 'finland',
  fr: 'france',
  gb: 'united-kingdom',
  gr: 'greece',
  hr: 'croatia',
  hu: 'hungary',
  ie: 'ireland',
  is: 'iceland',
  it: 'italy-mainland',
  jp: 'japan',
  kz: 'kazakhstan',
  lk: 'sri-lanka',
  lt: 'lithuania',
  lu: 'luxembourg',
  lv: 'latvia',
  ma: 'morocco',
  mc: 'monaco',
  me: 'montenegro',
  mk: 'macedonia',
  mt: 'malta',
  nl: 'netherlands',
  no: 'norway',
  nz: 'new-zealand',
  ph: 'philippines',
  pl: 'poland',
  pt: 'portugal',
  py: 'paraguay',
  ro: 'romania',
  rs: 'serbia',
  se: 'sweden',
  si: 'slovenia',
  sk: 'slovakia',
  th: 'thailand',
  tn: 'tunisia',
  tr: 'turkey',
}

function carRentalHref(cmsUrl: string | null | undefined): string {
  if (!cmsUrl) return '/go/auta'
  let target: URL
  try {
    target = new URL(cmsUrl)
  } catch {
    return '/go/auta'
  }
  // Stará Rentalcars adresa → přeložit countryCode na stránku země.
  if (target.hostname === 'rentalcars.com' || target.hostname.endsWith('.rentalcars.com')) {
    const code = target.searchParams.get('countryCode')?.toLowerCase()
    const slug = code ? RENTALCARS_COUNTRY_TO_DISCOVERCARS[code] : undefined
    return slug ? `/go/auta/${slug}` : '/go/auta'
  }
  // Adresa z DiscoverCars generatoru → převzít cestu (bez /cz a bez a_aid,
  // obojí doplní handler).
  if (target.hostname === 'discovercars.com' || target.hostname.endsWith('.discovercars.com')) {
    const path = target.pathname.replace(/^\/cz(?=\/|$)/, '')
    return path && path !== '/' ? `/go/auta${path}` : '/go/auta'
  }
  return cmsUrl
}

/**
 * Ubytování vede přes vlastní redirect /go/ubytovani[/cesta-na-bookingu]
 * (route handler v `src/app/(frontend)/go/ubytovani/`), který teprve posílá
 * na Booking přes provizní síť CJ. Vlastní adresa je tu kvůli důvěryhodnosti —
 * návštěvník při najetí vidí ara.cz, ne tracking doménu CJ. Deep-link na zemi
 * se z CMS adresy převezme jako cesta (mrtvé aid/label parametry staré přímé
 * spolupráce se zahodí). Adresa mimo booking.com se nechá být — pod CJ inzerát
 * Bookingu nepatří.
 */
export function accommodationHref(cmsUrl: string | null | undefined): string {
  if (!cmsUrl) return '/go/ubytovani'
  let target: URL
  try {
    target = new URL(cmsUrl)
  } catch {
    return '/go/ubytovani'
  }
  if (target.hostname !== 'booking.com' && !target.hostname.endsWith('.booking.com')) {
    return cmsUrl
  }
  return `/go/ubytovani${target.pathname}`
}

/**
 * Zájezdy vedou přes vlastní redirect /go/zajezdy[/cesta-na-invii] — deep-link
 * destinace z CMS (dovolena/<země>[/<lokalita>]) se předává jako cesta,
 * provizní `aid` doplňuje handler ze základního odkazu v adminu. Adresa mimo
 * invia.cz se nechá být (mířila by na jiného partnera).
 */
function toursHref(cmsUrl: string | null | undefined): string {
  if (!cmsUrl) return '/go/zajezdy'
  let target: URL
  try {
    target = new URL(cmsUrl)
  } catch {
    return '/go/zajezdy'
  }
  if (target.hostname !== 'invia.cz' && !target.hostname.endsWith('.invia.cz')) {
    return cmsUrl
  }
  const path = target.pathname.replace(/\/+$/, '')
  return path && path !== '/' ? `/go/zajezdy${path}` : '/go/zajezdy'
}

export function PreparationSection({
  genitive,
  affiliate,
  practicalInfo,
}: PreparationSectionProps) {
  return (
    <section className="w-full bg-white py-16">
      <div className="mx-auto max-w-7xl px-4 md:px-12">
        {/* Nadpis ve stejném vzoru jako sousední sekce („Co vidět…", články). */}
        <div className="mb-12 flex flex-col items-center text-center">
          <h2 className="font-heading mb-3 text-3xl font-bold tracking-tight text-[#1a3f6c]">
            Příprava {genitive}
          </h2>
          <div className="mb-5 h-[1px] w-[30px] rounded-full bg-[#d45145]"></div>
          <p className="max-w-xl text-[17px] leading-relaxed text-gray-400">
            Zařiď si vše potřebné na cestu z jednoho místa.
          </p>
        </div>
        <PreparationCards affiliate={affiliate} practicalInfo={practicalInfo} />
      </div>
    </section>
  )
}

/**
 * Samotná mřížka karet — sdílí ji stránka místa (5 karet vč. Praktických
 * informací a deep-linků destinace) a homepage (4 obecné karty, viz
 * `homepage/preparation-section.tsx`, legacy parita s `affiliate--homepage`).
 */
export function PreparationCards({
  affiliate,
  practicalInfo,
}: {
  affiliate: Page['affiliate'] | null
  practicalInfo: PreparationPracticalInfo | null
}) {
  const ownerGenitive = practicalInfo
    ? practicalInfo.ownerGenitive || `do ${practicalInfo.ownerTitle}`
    : null

  const partnerItems = [
    {
      title: 'Cestovní pojištění',
      description: (
        <>
          Srovnej nabídky pojišťoven
          <br />• úspora až 50 %
        </>
      ),
      href: '/go/pojisteni',
      icon: <HeartIcon height={44} />,
    },
    {
      title: 'Zájezdy',
      description: (
        <>
          Porovnej zájezdy CK
          <br />• široká nabídka a nejlepší ceny
        </>
      ),
      href: toursHref(affiliate?.toursUrl),
      icon: <TravelIcon height={44} />,
    },
    {
      title: 'Rezervace ubytování',
      description: (
        <>
          Rezervuj a ušetři až 50 %
          <br />• záruka nejlepší ceny
        </>
      ),
      href: accommodationHref(affiliate?.accommodationUrl),
      icon: <BedIcon height={42} />,
    },
    {
      title: 'Půjčení auta',
      // Text odpovídá DiscoverCars („900 společností" byla Rentalcars čísla).
      description: (
        <>
          Porovnej stovky půjčoven
          <br />• zrušení rezervace zdarma
        </>
      ),
      href: carRentalHref(affiliate?.carRentalUrl),
      icon: <CarIcon height={38} />,
    },
  ]

  return (
    // Bez páté karty (homepage) drží mřížka 4 sloupce, ať nezbývá prázdný.
    <div
      className={`grid grid-cols-2 gap-5 ${practicalInfo ? 'md:grid-cols-3 lg:grid-cols-5' : 'md:grid-cols-2 lg:grid-cols-4'}`}
    >
      {partnerItems.map((item) => (
        <a
          key={item.title}
          href={item.href}
          target="_blank"
          rel="nofollow sponsored noopener"
          className="group block rounded-lg border border-[#e6ebf1] bg-white px-4 pt-[30px] pb-6 text-center transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(26,63,108,0.12)]"
        >
          <span className="flex h-12 items-center justify-center text-[#1a3f6c]">{item.icon}</span>
          <h3 className="mt-[18px] mb-2 text-[16px] font-bold text-[#1a3f6c] transition-colors group-hover:text-[#2a5a9c]">
            {item.title}
          </h3>
          <p className="text-[13.5px] leading-normal text-[#74808f]">{item.description}</p>
        </a>
      ))}
      {practicalInfo && (
        <Link
          href={practicalInfo.fullSlug}
          // Interní odkaz — podbarvením odlišený od partnerských karet.
          // Na mobilu (2 sloupce) přes celou šířku, ať nezůstává díra vedle
          // páté karty; od md už je v mřížce jako ostatní.
          className="group col-span-2 block rounded-lg border border-[#e0e8f1] bg-[#f3f6fa] px-4 pt-[30px] pb-6 text-center transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(26,63,108,0.12)] md:col-span-1"
        >
          <span className="flex h-12 items-center justify-center text-[#1a3f6c]">
            <GuideIcon height={44} />
          </span>
          <h3 className="mt-[18px] mb-2 text-[16px] font-bold text-[#1a3f6c] transition-colors group-hover:text-[#2a5a9c]">
            Praktické informace
          </h3>
          <p className="text-[13.5px] leading-normal text-[#74808f]">
            Praktické cestovní informace
            <br />
            při cestě {ownerGenitive}
          </p>
        </Link>
      )}
    </div>
  )
}
