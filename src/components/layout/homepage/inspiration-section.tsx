import { Fragment } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import type { HomepageInspiration } from '@/types/payload'
import { SectionHeading } from './section-heading'
import { PhotoTile } from '@/components/features/photo-tile'
import { ThumbRow, thumbTitleClass } from '@/components/features/thumb-row'

// Sekce „Rady a tipy na cestu" — dlaždice 2×2 s denním výběrem rad a boční
// seznam nejnovějších článků (varianta D, 8/2026; název sekce 4. 8. 2026).
// Sloupce se identifikují samy — levý odkazem „Všechny rady na cestu" pod
// dlaždicemi, pravý štítkem „Nejnovější články".

export function InspirationSection({ data }: { data: HomepageInspiration | null }) {
  if (!data) return null
  const { rady, radyHref, articles } = data
  const hasRady = rady.length > 0
  // První rada s fotkou (u rad bez fotky by nebylo co přednačíst).
  const preloadKey = rady.find((rada) => rada.imageUrl)?.key
  const hasArticles = articles.length > 0
  if (!hasRady && !hasArticles) return null

  return (
    <section aria-labelledby="inspiration-heading" className="max-w-5xl mx-auto text-left">
      <SectionHeading id="inspiration-heading">Rady a tipy na cestu</SectionHeading>

      {/* Dlaždice a seznam článků sdílí jeden řádek mřížky, takže se seznam
          i se štítkem natáhne PŘESNĚ na výšku dvou řad dlaždic (souměrné
          sloupce — rozhodnutí uživatele 29. 8. 2026); odkaz „Všechny rady"
          je v dalším řádku pod dlaždicemi, tak jako dřív. Seznam je bez
          krabice — rámeček byl jediný orámovaný prvek v sekci a působil
          jako přilepený. Pořadí v DOM = pořadí na mobilu (dlaždice, odkaz,
          články); na desktopu se články automaticky umístí do 3. sloupce
          1. řádku a odkaz je explicitně v 2. řádku pod dlaždicemi.
          Výšku řádku určují dlaždice (4 rady = 2 řady × 150 px) — seznam
          4 článků je nižší a natáhne se; limity INSPIRATION_*_LIMIT
          v lib/payload.ts musí zůstat sladěné (víc článků / méně rad by
          poměr obrátilo a pod dlaždicemi by vznikl prázdný pás). */}
      <div className="grid gap-6 items-stretch md:grid-cols-3 md:gap-x-6 md:gap-y-3">
        {hasRady && (
          // Osamocený blok (bez článků) zabere celou šířku, jinak by vedle
          // něj zela prázdná třetina mřížky.
          <div
            className={`grid grid-cols-2 gap-3 md:gap-3.5 ${
              hasArticles ? 'md:col-span-2' : 'md:col-span-3'
            }`}
          >
            {rady.map((rada) => (
              <PhotoTile key={rada.key} href={rada.href} title={rada.title} size="sm">
                {rada.imageUrl && (
                  <Image
                    src={rada.imageUrl}
                    alt=""
                    fill
                    // Dlaždice jsou hned pod herem (nad ohybem). Přednačíst (`preload`,
                    // v Next 16 náhrada za `priority`) jen PRVNÍ dlaždici s fotkou — je
                    // LCP kandidátem; čtyři preloady soupeřily o síť (review PR #86).
                    // Ostatní se nesmí načítat líně (jsou nad ohybem) → eager.
                    preload={rada.key === preloadKey}
                    fetchPriority={rada.key === preloadKey ? 'high' : undefined}
                    loading={rada.key === preloadKey ? undefined : 'eager'}
                    className="object-cover"
                    sizes="(max-width: 768px) 50vw, 340px"
                  />
                )}
              </PhotoTile>
            ))}
          </div>
        )}

        {hasRady && (
          <Link
            href={radyHref}
            // -mt-3: na mobilu má mřížka gap-6, odkaz ale patří těsně k dlaždicím (12 px).
            className="-mt-3 justify-self-start text-[13px] font-bold text-[#215491] hover:text-[#1a4579] transition-colors md:mt-0 md:col-start-1 md:row-start-2"
          >
            Všechny rady na cestu →
          </Link>
        )}

        {hasArticles && (
          <div className={`flex flex-col ${hasRady ? '' : 'md:col-span-3'}`}>
            <h3 className="font-heading text-[16px] font-bold text-[#1a3f6c] mb-3">
              Nejnovější články
            </h3>
            {/* Rozprostřou se samotné ŘÁDKY (justify-between), ne stejně vysoké
                přihrádky: první miniatura sedí hned pod štítkem, poslední přesně
                na spodní hraně dlaždic (rozhodnutí uživatele 29. 8.). Oddělovací
                linky jsou proto samostatné položky uprostřed mezer — border na
                řádku by se lepil k jednomu ze sousedů a mezery by vyšly křivě. */}
            <ul className="flex flex-1 flex-col justify-between">
              {articles.map((article, index) => (
                <Fragment key={article.key}>
                  {index > 0 && (
                    <li role="presentation" aria-hidden="true" className="h-px bg-gray-100" />
                  )}
                  <li>
                    <ThumbRow href={article.href} src={article.imageUrl} className="py-2 md:py-0">
                      <span className={thumbTitleClass()}>{article.title}</span>
                    </ThumbRow>
                  </li>
                </Fragment>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}
