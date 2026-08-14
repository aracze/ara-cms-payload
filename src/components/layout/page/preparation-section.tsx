import React from 'react'
import Link from 'next/link'
import type { Page } from '@/types/payload'

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
function accommodationHref(cmsUrl: string | null | undefined): string {
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

/*
 * Ikony = originální SVG ze starého webu (assets/images/affil/*.svg),
 * jen s fill přepnutým na currentColor, ať jdou barvit z karet.
 * Bílé části (křížek v srdci, peřiny postele) zůstávají bílé — sedí na
 * bílém i světle šedém podkladu karet.
 */

interface IconProps {
  height: number
}

function HeartIcon({ height }: IconProps) {
  return (
    <svg viewBox="-2.73 -5.366 61.161 55" height={height} aria-hidden="true">
      <path
        fill="currentColor"
        d="M50.608-2.691c-12.583-7.562-21.837,3.185-22.78,4.345C26.675,0.259,17.504-10.096,5.093-2.638 C-0.763,0.88-17.31,17.99,27.868,49.633v-0.079C73.001,17.926,56.46,0.826,50.608-2.691z"
      />
      <polygon
        fill="#ffffff"
        points="48.168,12.07 43.142,12.07 43.142,7.039 39.904,7.039 39.904,12.07 34.874,12.07 34.874,15.303 39.904,15.303 39.904,20.334 43.142,20.334 43.142,15.303 48.168,15.303"
      />
    </svg>
  )
}

function TravelIcon({ height }: IconProps) {
  return (
    <svg viewBox="86.725 61.75 82.666 57" height={height} aria-hidden="true">
      <path
        fill="currentColor"
        d="M169.354,71.45c-0.004,0.001-0.008,0.003-0.012,0.005c-1.984-2.439-7.538-0.537-10.787,1.124 c-4.464-2.585-14.907-8.845-14.907-8.845s-2.069,1.689-2.386,2.127c2.688,3.456,6.099,7.173,8.745,10.898 c-0.33,0.192-4.463,2.731-4.845,3.04c-0.265-0.127-5.826-2.426-5.826-2.426s-1.142,0.883-1.81,1.559 c0.083,0.271,4.21,4.192,4.67,4.708c0.009,0.02,0.025,0.033,0.036,0.051c0.004,0.008,0.006,0.016,0.009,0.024 c0.08,0.686,0.282,6.375,0.431,6.617c0.948-0.053,2.367-0.323,2.367-0.323s1.963-5.688,2.043-5.971 c0.484-0.081,5.124-1.493,5.487-1.614c1.036,4.451,1.561,9.468,2.367,13.771c0.538,0.054,3.174-0.376,3.174-0.376 s2.232-11.97,3.255-17.026C164.766,77.46,169.878,74.557,169.354,71.45z"
      />
      <path
        fill="currentColor"
        d="M86.725,95.657c1.016-2.536,3.486-6.893,5.379-7.477c-2.658,2.695-3.819,8.392,1.399,8.446 c7.247,0.074,15.233-2.726,22.271-5.164c7.497-2.598,14.416-5.664,19.366-8.069c2.354,1.412,3.863,3.668,3.229,8.069 c-10.849,3.705-33.467,14.68-48.416,9.36c-1.222-0.436-2.46-1.756-3.228-3.551C86.725,96.733,86.725,96.195,86.725,95.657z"
      />
      <path
        fill="#ffffff"
        d="M163.557,71.827c2.367-1.076,3.375,2.929,1.533,3.362C165.239,73.533,164.754,72.808,163.557,71.827z"
      />
      <g fill="currentColor" stroke="currentColor" strokeMiterlimit={10}>
        <path d="M142.12,75.322c-0.261-0.309-0.505-0.601-0.738-0.881c0.179,0.068,0.356,0.146,0.536,0.236c0,0,0,0,0-0.001 c-1.741-1.43-2.919-3.429-4.101-5.33c-0.243-0.391-0.497-0.823-0.766-1.261c-0.025-0.505-0.04-1.214-0.047-1.852 c-4.256-2.529-9.224-3.983-14.533-3.983c-15.731,0-28.484,12.753-28.484,28.484c0,0.817,0.037,1.627,0.104,2.428l4.842-0.478 c-0.065-0.709-0.102-1.428-0.104-2.154c0.058,0.004,0.116,0.004,0.171,0.014c0.112-4.205,0.962-7.672,2.572-10.379 c0.423,1.513,0.332,3.542,0.323,5.487c2.233,1.21,3.992,2.894,5.81,4.519c1.359-0.47,2.563-1.095,4.196-1.291 c0.005-0.856-0.179-1.9,0.646-1.937c5.668-0.034,7.726-3.679,10.651-6.455c-0.583-0.708-1.259-1.323-1.614-2.259 c0.721-0.893,1.256-1.972,1.614-3.228c-1.928-0.87-2.587-3.007-2.905-5.487c0.625-2.274,2.733-2.883,5.09-2.758 c1.461,0.163,2.882,0.458,4.251,0.873c-0.28,0.88-1.507,0.814-1.273,2.208c1.574,2.73,1.588,7.019,5.487,7.424 c1.302-1.615,3.642-3.423,6.252-3.134c0.178,0.188,0.353,0.378,0.524,0.572C141.099,74.835,141.603,75.032,142.12,75.322z" />
        <path d="M149.423,90.008c-0.413,1.74-1.246,2.82-2.138,3.493c-0.009-0.039-0.018-0.078-0.026-0.118 c-1.958,1.397-4.889,1.729-6.954,0.338c-1.609,1.618-5.103,1.354-6.133,3.551c0.266,1.563,1.857,1.802,2.582,2.905 c-0.889,0.617-1.643,1.37-2.26,2.259c0.97,1.917,0.792,4.979,2.232,6.425c-0.313,0.227-0.632,0.447-0.955,0.66 c-1.446,0.896-3.09,1.772-4.889,2.452c-1.387,0.505-2.834,0.881-4.328,1.122c-1.487,0.206-3.042,0.229-4.648-0.008 c1.055-0.973,2.596-1.748,1.614-3.873c3.799-0.396,4.197-4.194,5.81-6.778c-2.925-4.992-9.567-0.434-14.202,0.323 c-0.656,0.975,1.466,0.987,1.614,2.26c0.003,0.027-1.234,1.68-1.291,2.259c-0.206,2.102,1.306,3.72,0.968,5.164 c-2.682-0.709-4.484-1.654-6.778-3.228c-0.875-0.599-1.872-1.254-2.815-1.863c-0.792-0.706-1.538-1.465-2.23-2.271 l-6.092,0.084c5.067,7.872,13.908,13.086,23.967,13.086c13.29,0,24.454-9.103,27.599-21.413 C149.819,95.14,149.914,91.615,149.423,90.008z" />
      </g>
    </svg>
  )
}

function BedIcon({ height }: IconProps) {
  return (
    <svg viewBox="-21.686 -12.683 88.915 52" height={height} aria-hidden="true">
      <polygon
        fill="currentColor"
        points="-21.686,18.939 -7.531,2.833 52.746,2.833 66.901,18.939"
      />
      <rect x="-21.686" y="34.559" fill="currentColor" width="8.054" height="4.759" />
      <polygon
        fill="currentColor"
        points="22.937,20.698 22.606,20.698 -21.686,20.698 -21.686,32.851 22.606,32.851 22.937,32.851 67.229,32.851 67.229,20.698"
      />
      <rect x="59.176" y="34.559" fill="currentColor" width="8.053" height="4.759" />
      <path
        fill="currentColor"
        d="M52.461-11.617c-0.004-0.447-1.011-1.047-1.465-1.048c-6.535-0.037-25.696-0.006-28.386,0 c-2.69-0.004-21.854-0.037-28.391,0c-0.453,0.003-1.458,0.602-1.464,1.048c-0.041,3.066,0,13.065,0,13.065h29.529h0.652h29.524 C52.461,1.448,52.503-8.549,52.461-11.617z"
      />
      <path
        fill="#ffffff"
        d="M20.98,2.1c0-0.814-1.302-3.986-2.522-3.986c-2.269,0-7.825,0-9.355,0c-0.252,0-0.406,0-0.406,0 c-1.65,0-7.962,0-10.251,0c-1.22,0-2.522,3.172-2.522,3.986c0.002,1.75,0,4.555,0,4.555H8.694h0.406h11.876 C20.98,6.655,20.979,3.85,20.98,2.1z"
      />
      <path
        fill="#ffffff"
        d="M49.612,2.1c0.004-0.814-1.301-3.986-2.521-3.986c-2.269,0-7.824,0-9.354,0c-0.252,0-0.408,0-0.408,0 c-1.649,0-7.962,0-10.25,0c-1.22,0-2.524,3.172-2.521,3.986c0,1.75,0,4.555,0,4.555H37.33h0.408h11.874 C49.612,6.655,49.612,3.85,49.612,2.1z"
      />
    </svg>
  )
}

function CarIcon({ height }: IconProps) {
  return (
    <svg viewBox="-40.61 -19.139 99.729 47" height={height} aria-hidden="true">
      <path
        fill="currentColor"
        d="M-19.868,6.832c-5.768,0-10.443,4.673-10.443,10.446c0,5.772,4.675,10.435,10.443,10.435 c5.765,0,10.443-4.662,10.443-10.44C-9.425,11.495-14.108,6.832-19.868,6.832z M-19.868,22.946c-3.055,0-5.528-2.473-5.528-5.51 c0-3.063,2.473-5.535,5.528-5.535s5.528,2.473,5.528,5.535C-14.345,20.473-16.813,22.946-19.868,22.946z"
      />
      <path
        fill="currentColor"
        d="M39.52-4.055C24.648-14.948,14.877-17.695,9.883-18.421C5.286-19.09-1.095-19.716-9.425-18.216 c-43.617,7.846-29.638,35.631-26.83,36.168c1.029,0.199,2.294,0.179,3.686,0.294c-0.021-0.326-0.097-0.637-0.097-0.968 c0-7.078,5.728-12.798,12.798-12.798S-7.07,10.205-7.07,17.279c0,1.142-0.2,2.226-0.474,3.278c0.592,0.058,0.926,0.089,0.926,0.089 h32.782h0.011c-0.284-1.036-0.463-2.109-0.463-3.23c0-7.078,5.725-12.798,12.798-12.798c7.067,0,12.798,5.726,12.798,12.798 c0,1.121-0.189,2.184-0.463,3.23h1.137c0,0,6.63-0.979,7.072-6.515C60.4-3.05,40.425-3.392,39.52-4.055z M-0.334-0.577h-25.709 v-3.594c4.407-6.762,13.353-10.741,18.974-11.225c1.934-0.153,6.735,0,6.735,0V-0.577z M29.638-0.577H3.928v-14.818 c0,0,13.668-0.084,6.736,0c-1.063,0.01,16.705,4.383,18.974,11.225V-0.577z"
      />
      <path
        fill="currentColor"
        d="M38.51,6.975c-5.757,0-10.44,4.673-10.44,10.445c0,5.763,4.678,10.44,10.44,10.44 c5.762,0,10.445-4.673,10.445-10.44C48.95,11.648,44.267,6.975,38.51,6.975z M38.51,23.082c-3.053,0-5.525-2.473-5.525-5.52 c0-3.053,2.473-5.525,5.525-5.525c3.052,0,5.525,2.473,5.525,5.525C44.035,20.61,41.562,23.082,38.51,23.082z"
      />
    </svg>
  )
}

/**
 * Zjednodušená brožura s „i“ — náhrada za legacy essentials-gray.svg (129 kB,
 * stovky cest). Kdyby bylo potřeba věrné parity, lze originál zoptimalizovat.
 */
function GuideIcon({ height }: IconProps) {
  return (
    <svg viewBox="0 0 66 58" height={height} aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinejoin="round">
        <path d="M3 9.5l20-5.5v45l-20 5.5z" />
        <path d="M23 4l20 5.5v45L23 49z" />
        <path d="M43 9.5L63 4v45l-20 5.5z" />
        <circle cx="13" cy="21" r="4.6" />
        <path d="M13 29v6" strokeLinecap="round" />
        <path d="M50 20l8-2M50 27l8-2M50 34l8-2" strokeLinecap="round" />
      </g>
    </svg>
  )
}
