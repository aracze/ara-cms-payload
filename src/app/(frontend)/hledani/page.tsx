import type { Metadata } from 'next'
import Image from 'next/image'
import { HeroSection } from '@/components/layout/page/hero-section'
import { ResultList } from '@/components/features/search/resultlist/resultlist'
import { SearchPageBox } from '@/components/features/search/search-page-box'
import { KamDal } from '@/components/features/kam-dal'
import { searchPages } from '@/lib/search'
import { pluralCs } from '@/lib/utils'
import { DEFAULT_COVER_BLUR, DEFAULT_COVER_POSITION, DEFAULT_COVER_URL } from '@/lib/default-cover'

/**
 * STRÁNKA VÝSLEDKŮ HLEDÁNÍ (/hledani?q=…)
 * ----------------------------------------
 * Našeptávač v hlavičce a na homepage ukazuje jen 10 nejlepších shod; tahle
 * stránka je „plný" výstup — dává tlačítku Hledat a Enteru skutečný cíl,
 * výsledky jdou poslat odkazem a najde se i to, co se do našeptávače nevešlo.
 *
 * Hero s výchozí fotkou drží jednotný vzhled s ostatními stránkami webu
 * (rozhodnutí uživatele 9. 8. 2026 — konzistence má přednost před úsporou
 * místa). Hledá server (`searchPages`), takže stránka funguje i bez JS.
 */

// Výsledky závisí na query stringu — stránka se nesmí předrenderovat nastálo.
export const dynamic = 'force-dynamic'

const RESULTS_LIMIT = 50

type SearchParams = Promise<{ q?: string | string[] }>

/** Dotaz z URL: pole (opakovaný parametr) bereme jako první hodnotu. */
async function readQuery(searchParams: SearchParams): Promise<string> {
  const { q } = await searchParams
  const raw = Array.isArray(q) ? q[0] : q
  return (raw ?? '').trim()
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams
}): Promise<Metadata> {
  const query = await readQuery(searchParams)
  return {
    title: query ? `Hledání: ${query}` : 'Hledání',
    // Výsledky hledání do indexu vyhledávačů nepatří (duplicitní/nekonečný
    // obsah). V robots.txt stránka schválně zakázaná NENÍ — noindex Google
    // uplatní jen u URL, kterou smí stáhnout (viz src/app/robots.ts).
    robots: { index: false, follow: true },
  }
}

export default async function HledaniPage({ searchParams }: { searchParams: SearchParams }) {
  const query = await readQuery(searchParams)
  const results = query ? await searchPages(query, RESULTS_LIMIT) : []

  return (
    <main id="obsah" tabIndex={-1} className="focus:outline-none">
      <HeroSection
        title="Hledání"
        imageUrl={DEFAULT_COVER_URL}
        imageAlt=""

        styleCss={DEFAULT_COVER_POSITION}
        blurDataURL={DEFAULT_COVER_BLUR}
        filterId="blurHledani"
      />

      <div className="mx-auto w-full max-w-6xl px-4 py-10 md:py-12">
        <div className="mx-auto flex max-w-[42rem] flex-col items-center gap-4">
          <SearchPageBox key={query} initialQuery={query} />

          {query && results.length > 0 && (
            <>
              <p className="text-[13.5px] text-[#8a939b]">
                {/* Limit výpisu poznáme z plného počtu řádků — když jich přišlo
                    přesně LIMIT, hlásíme „nejlepších", protože dalších shody
                    zůstaly za hranou. */}
                {results.length === RESULTS_LIMIT
                  ? `Nejlepších ${RESULTS_LIMIT} výsledků pro`
                  : `${results.length} ${pluralCs(results.length, ['výsledek', 'výsledky', 'výsledků'])} pro`}{' '}
                <strong className="font-semibold text-[#5b666e]">„{query}“</strong>
              </p>
              <div className="w-full">
                <ResultList results={results} limit={RESULTS_LIMIT} />
              </div>
            </>
          )}

          {query && results.length === 0 && (
            <div className="flex flex-col items-center gap-1 pt-4 text-center">
              {/* Menší ara místo velkého chybového pruhu: překlep v hledání
                  není havárie, pole pro nový pokus zůstává hlavním hrdinou
                  (schválená „varianta Papoušek 2"). */}
              <Image
                src="/assets/404-ara.webp"
                alt=""
                width={220}
                height={226}
                unoptimized
                className="h-auto w-[190px] select-none md:w-[220px]"
              />
              <p className="text-[17px] font-bold text-[#1c2b3a]">Pro „{query}“ jsme nic nenašli</p>
              <p className="max-w-[46ch] text-[14px] text-[#5b666e]">
                Zkontroluj překlepy, nebo zkus obecnější název — třeba zemi místo konkrétního místa.
              </p>
              <div className="pt-4">
                <KamDal />
              </div>
            </div>
          )}

          {!query && (
            <div className="flex flex-col items-center gap-2 pt-2 text-center">
              <p className="text-[#5b666e]">Napiš, kam se chceš podívat.</p>
              <KamDal />
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
