import Link from 'next/link'

/**
 * Řádek pilulek „Kam dál" — úvodní stránka + oblíbené destinace. Sdílí ho
 * 404 a prázdný výsledek hledání, aby slepé uličky webu nabízely stejné
 * východisko a vypadaly jako jedna rodina.
 */

/** `mobile: false` = pod 640 px se skryje, aby řada držela na jednom řádku. */
const POPULAR_DESTINATIONS = [
  { title: 'Chorvatsko', href: '/chorvatsko', mobile: true },
  { title: 'Itálie', href: '/italie', mobile: false },
  { title: 'Řecko', href: '/recko', mobile: false },
  { title: 'USA', href: '/usa', mobile: false },
]

export function KamDal() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <span className="text-[13px] font-medium text-[#8a939b]">Kam dál:</span>
      <Link
        href="/"
        className="rounded-full border border-[#215491] bg-[#e9f1f9] px-4 py-1 text-[13px] font-semibold text-[#215491] transition-colors hover:bg-[#dbe8f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#215491]/50"
      >
        Úvodní stránka
      </Link>
      {POPULAR_DESTINATIONS.map((destination) => (
        <Link
          key={destination.href}
          href={destination.href}
          className={`rounded-full border border-[#c9d4e0] bg-[#f5f7f9] px-4 py-1 text-[13px] font-semibold text-[#215491] transition-colors hover:border-[#215491]/40 hover:bg-[#e9f1f9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#215491]/50 ${
            destination.mobile ? '' : 'hidden sm:inline-block'
          }`}
        >
          {destination.title}
        </Link>
      ))}
    </div>
  )
}
