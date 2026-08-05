import Link from 'next/link'
import Image from 'next/image'
import type { HomepageInspiration } from '@/types/payload'
import { SectionHeading } from './section-heading'

// Sekce „Rady a tipy na cestu" — dlaždice 2×2 s denním výběrem rad a boční
// seznam nejnovějších článků (varianta D, 8/2026; název sekce 4. 8. 2026).
// Sloupce se identifikují samy — levý odkazem „Všechny rady na cestu" pod
// dlaždicemi, pravý štítkem „Nejnovější články".

export function InspirationSection({ data }: { data: HomepageInspiration | null }) {
  if (!data) return null
  const { rady, radyHref, articles } = data
  const hasRady = rady.length > 0
  const hasArticles = articles.length > 0
  if (!hasRady && !hasArticles) return null

  return (
    <section aria-labelledby="inspiration-heading" className="max-w-5xl mx-auto text-left">
      <SectionHeading id="inspiration-heading">Rady a tipy na cestu</SectionHeading>

      <div className="grid gap-6 md:grid-cols-3 items-stretch">
        {hasRady && (
          // Osamocený blok (bez článků) zabere celou šířku, jinak by vedle
          // něj zela prázdná třetina mřížky.
          <div className={`flex flex-col ${hasArticles ? 'md:col-span-2' : 'md:col-span-3'}`}>
            <div className="grid grid-cols-2 gap-3 md:gap-3.5">
              {rady.map((rada) => (
                <Link
                  key={rada.key}
                  href={rada.href}
                  className="group relative block h-32 md:h-[150px] rounded-2xl overflow-hidden shadow-[0_4px_16px_-8px_rgba(0,0,0,0.18)]"
                >
                  {rada.imageUrl ? (
                    <Image
                      src={rada.imageUrl}
                      alt=""
                      fill
                      // Dlaždice jsou hned pod herem (nad ohybem) a bývají LCP
                      // elementem stránky — bez priority je next/image načítá
                      // líně a prohlížeč hlásí pomalé LCP.
                      priority
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                      sizes="(max-width: 768px) 50vw, 340px"
                    />
                  ) : (
                    <span className="absolute inset-0 bg-gradient-to-br from-[#1a3f6c]/10 to-[#1a3f6c]/20" />
                  )}
                  {/* Vyšší gradient než u míst — titulky rad mají i 3–4 řádky
                      a nesmí vyjet nad ztmavení do světlé fotky. */}
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-[78%] bg-gradient-to-t from-[#0f1a2a]/75 to-transparent"
                  />
                  <span className="absolute left-4 right-3 bottom-3 text-white font-bold text-[14px] md:text-[15.5px] leading-snug [text-shadow:0_1px_3px_rgba(0,0,0,0.35)]">
                    {rada.title}
                  </span>
                </Link>
              ))}
            </div>
            <Link
              href={radyHref}
              className="self-start mt-3 text-[13px] font-bold text-[#215491] hover:text-[#1a4579] transition-colors"
            >
              Všechny rady na cestu →
            </Link>
          </div>
        )}

        {hasArticles && (
          <div
            className={`flex flex-col bg-white rounded-3xl border border-gray-100/50 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.1)] p-5 ${
              hasRady ? '' : 'md:col-span-3'
            }`}
          >
            <h3 className="font-heading font-bold text-[11.5px] tracking-[0.12em] uppercase text-[#215491] mb-1">
              Nejnovější články
            </h3>
            <ul className="flex flex-col">
              {articles.map((article) => (
                <li key={article.key} className="border-b border-gray-100 last:border-b-0">
                  <Link href={article.href} className="group flex items-center gap-3 py-2.5">
                    {article.imageUrl && (
                      <Image
                        src={article.imageUrl}
                        alt=""
                        width={46}
                        height={46}
                        className="w-[46px] h-[46px] rounded-xl object-cover shrink-0"
                      />
                    )}
                    <span className="text-sm font-semibold text-[#1a3f6c] leading-snug group-hover:text-[#215491] transition-colors">
                      {article.title}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}
