import Link from 'next/link'
import Search from '@/components/features/search/search'
import { ErrorHero } from '@/components/layout/error-hero'

/**
 * CHYBOVÁ STRÁNKA 404
 * -------------------
 * Myšlenka: ara odlétá pryč, protože taková destinace (stránka) na webu není.
 * Vzhled pruhu řeší sdílený `ErrorHero` — stejný má i `error.tsx`, aby obě
 * chybové stránky vypadaly jako jedna rodina.
 *
 * Hlavní akcí je HLEDÁNÍ: nejčastější důvod 404 je stará adresa z vyhledávače,
 * kdy člověk ví, co hledá, a chybí mu jen cesta. Tím se 404 liší od `error.tsx`,
 * kde je hlavní akcí „Zkusit znovu" — tam stránka existuje, jen se nenačetla,
 * a hledání by běželo přes tentýž backend, který zrovna neodpovídá.
 *
 */

/** Pilulky „Kam dál". `mobile: false` = pod 640 px se skryje, aby řada držela na jednom řádku. */
const POPULAR_DESTINATIONS = [
  { title: 'Chorvatsko', href: '/chorvatsko', mobile: true },
  { title: 'Itálie', href: '/italie', mobile: false },
  { title: 'Řecko', href: '/recko', mobile: false },
  { title: 'USA', href: '/usa', mobile: false },
]

export default function NotFound() {
  return (
    <main id="obsah" tabIndex={-1} className="focus:outline-none">
      <ErrorHero title="Ara sem nedoletěl" kicker="Chyba 404" filterId="blur404" />

      <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-14">
        <div className="mx-auto flex max-w-[36rem] flex-col items-center gap-5 text-center">
          <p className="text-[#5b666e]">
            Taková stránka na webu není. Zkus napsat, kam se chceš podívat.
          </p>

          <Search variant="homepage" />

          {/* „Kam dál" místo samostatného odkazu domů: úvodní stránka je prostě
              další cíl v řadě, takže spodek stránky má jeden řádek místo dvou. */}
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
        </div>
      </div>
    </main>
  )
}
