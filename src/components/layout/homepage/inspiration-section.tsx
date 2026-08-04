import Link from 'next/link'
import Image from 'next/image'
import type { HomepageInspiration } from '@/types/payload'
import { SectionHeading } from './section-heading'

// Sekce „Články a rady na cestu" — dlaždice 2×2 s denním výběrem rad a boční
// seznam nejnovějších článků (schválená varianta D + G, 8/2026). Název sekce
// vědomě pokrývá OBA sloupce (navazuje na starý web); levý sloupec se
// identifikuje odkazem „Všechny rady na cestu" pod dlaždicemi, pravý štítkem
// „Nejnovější články". Dlaždice mluví stejným jazykem jako „Inspirace na
// cestu" (fotka + název na lokálním gradientu).

export function InspirationSection({ data }: { data: HomepageInspiration | null }) {
  if (!data) return null
  const { rady, radyHref, articles } = data
  if (rady.length === 0 && articles.length === 0) return null

  return (
    <section aria-labelledby="inspiration-heading" className="max-w-5xl mx-auto text-left">
      <SectionHeading id="inspiration-heading">Články a rady na cestu</SectionHeading>

      <div className="grid gap-6 md:grid-cols-3 items-stretch">
        {rady.length > 0 && (
          <div className="md:col-span-2 flex flex-col">
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

        {articles.length > 0 && (
          <div className="flex flex-col bg-white rounded-3xl border border-gray-100/50 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.1)] p-5">
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
