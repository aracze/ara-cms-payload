import type { Metadata } from 'next'
import Search from '@/components/features/search/search'
import { ErrorHero } from '@/components/layout/error-hero'
import { KamDal } from '@/components/features/kam-dal'

// Vlastní titulek chybové stránky (jinak by nesla jen výchozí název webu).
// `robots: noindex` Next u not-found přidává sám — vlastní by byl duplicitní.
export const metadata: Metadata = {
  title: 'Stránka nenalezena',
}

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

export default function NotFound() {
  return (
    <main id="obsah" tabIndex={-1} className="focus:outline-none">
      <ErrorHero title="Ara sem nedoletěl" kicker="Chyba 404" filterId="blur404" />

      <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-14">
        <div className="mx-auto flex max-w-[36rem] flex-col items-center gap-5 text-center">
          <p className="text-[#5b666e]">
            Taková stránka na webu není. Zkus napsat, kam se chceš podívat.
          </p>

          <Search variant="homepage" onLightSurface />

          {/* „Kam dál" místo samostatného odkazu domů: úvodní stránka je prostě
              další cíl v řadě, takže spodek stránky má jeden řádek místo dvou. */}
          <KamDal />
        </div>
      </div>
    </main>
  )
}
