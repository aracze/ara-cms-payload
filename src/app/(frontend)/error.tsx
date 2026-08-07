'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { ErrorHero } from '@/components/layout/error-hero'

// Error boundary frontendu. Bez ní by výpadek DB při načítání stránky/článku
// buď spadl na generickou 500, nebo (dřív) se schoval za 404 „nenalezeno".
// Datová vrstva teď chybu DB záměrně propouští (viz fetchPageByFullSlug /
// fetchArticleBySlug v src/lib/payload.ts) a skončí tady — viditelně, se
// zalogováním, s možností „Zkusit znovu".
//
// Vzhled sdílí s 404 přes `ErrorHero`, ale NABÍDKA je jiná: tady stránka
// existuje a jen se nenačetla, takže hlavní akcí je zkusit to znovu. Hledání
// by tu bylo k ničemu — běží přes tentýž backend, který zrovna neodpovídá.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Server chybu loguje sám; na klientu ji zalogujeme pro úplnost (a kvůli
    // `digest`, přes který se dá spárovat se serverovým logem v produkci).
    console.error('[frontend] neočekávaná chyba stránky:', error)
  }, [error])

  return (
    <main id="obsah" tabIndex={-1} className="focus:outline-none">
      <ErrorHero title="Něco se pokazilo" kicker="Chyba" filterId="blurError" />

      <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-14">
        <div className="mx-auto flex max-w-[36rem] flex-col items-center gap-5 text-center">
          <p className="text-[#5b666e]">
            Stránku se teď nepodařilo načíst. Zkus to prosím za chvíli znovu.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={reset}
              className="rounded-full bg-[#215491] px-6 py-2.5 font-semibold text-white transition-colors hover:bg-[#1a4579] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#215491]/50"
            >
              Zkusit znovu
            </button>
            <Link
              href="/"
              className="rounded-full border border-[#215491] px-6 py-2.5 font-semibold text-[#215491] transition-colors hover:bg-[#215491]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#215491]/50"
            >
              Zpět na úvodní stránku
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
