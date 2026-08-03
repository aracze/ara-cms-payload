import Link from 'next/link'
import Image from 'next/image'
import type { HomepageInspiration } from '@/types/payload'
import { isCloudinary } from '@/lib/cloudinary-loader'

// Sekce „Články a rady na cestu" — velká karta nejnovějšího článku a boční
// seznam rad na cestu (schválená varianta B; dlaždice míst jsou samostatná
// sekce na konci stránky, viz InspirationPlacesSection). Vizuální jazyk
// přebírá z ArticleCard (rounded-3xl, měkký stín, Číst více s linkou)
// a z WhatsNewSection (nadpis, šířka max-w-5xl).

export function InspirationSection({ data }: { data: HomepageInspiration | null }) {
  if (!data) return null
  const { feature, tips, tipsTotal, tipsHref } = data
  if (!feature && tips.length === 0) return null

  return (
    <section aria-labelledby="inspiration-heading" className="max-w-5xl mx-auto text-left">
      <h2 id="inspiration-heading" className="text-2xl font-bold text-gray-800 tracking-tight mb-4">
        Články a rady na cestu
      </h2>

      <div className="grid gap-6 md:grid-cols-3 items-stretch">
        {feature && (
          <Link
            href={feature.href}
            className="group flex flex-col bg-white rounded-3xl overflow-hidden border border-gray-100/50 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.1)] hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.15)] transition-all duration-500 md:col-span-2"
          >
            <div className="relative h-52 md:h-60 w-full overflow-hidden">
              {feature.imageUrl && (
                <Image
                  src={feature.imageUrl}
                  alt={feature.title}
                  fill
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                  sizes="(max-width: 768px) 100vw, 66vw"
                  unoptimized={!isCloudinary(feature.imageUrl)}
                />
              )}
              {/* Stejný motiv odznáčku jako na kartách článků (ArticleCard). */}
              <div className="absolute top-4 left-4 w-7 h-7 bg-white/80 rounded-full flex items-center justify-center shadow-sm">
                <svg
                  className="w-4 h-4 text-[#1a3f6c]"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
                </svg>
              </div>
            </div>
            <div className="p-6 flex flex-col flex-1">
              {feature.placeName && (
                <div className="text-xs text-gray-400 mb-1.5">
                  {feature.placeName} · nejnovější článek
                </div>
              )}
              <h3 className="text-[22px] font-bold text-[#1a3f6c] mb-2 group-hover:text-[#215491] transition-colors leading-[1.25]">
                {feature.title}
              </h3>
              {feature.excerpt && (
                <div className="text-gray-500 line-clamp-2 text-sm leading-relaxed mb-5 font-light">
                  {feature.excerpt}
                </div>
              )}
              <div className="mt-auto flex items-center text-[#215491] font-bold text-[12px] tracking-[0.1em] uppercase group/read font-heading">
                <span>Číst více</span>
                <div className="ml-3 w-8 h-[1px] bg-[#215491]/30 transition-all duration-300 group-hover/read:w-12 group-hover/read:bg-[#215491]"></div>
              </div>
            </div>
          </Link>
        )}

        {tips.length > 0 && (
          <div className="flex flex-col bg-white rounded-3xl border border-gray-100/50 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.1)] p-5">
            <h3 className="font-heading font-bold text-[11.5px] tracking-[0.12em] uppercase text-[#215491] mb-1">
              Rady na cestu
            </h3>
            <ul className="flex flex-col">
              {tips.map((tip) => (
                <li key={tip.key}>
                  <Link
                    href={tip.href}
                    className="group flex items-center gap-3 py-2.5 border-b border-gray-100"
                  >
                    {tip.imageUrl && (
                      <Image
                        src={tip.imageUrl}
                        alt=""
                        width={46}
                        height={46}
                        className="w-[46px] h-[46px] rounded-xl object-cover shrink-0"
                      />
                    )}
                    <span className="text-sm font-semibold text-[#1a3f6c] leading-snug group-hover:text-[#215491] transition-colors">
                      {tip.title}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              href={tipsHref}
              className="mt-auto pt-3 text-[13px] font-bold text-[#215491] hover:text-[#1a4579] transition-colors"
            >
              {tipsTotal >= 5 ? `Všech ${tipsTotal} rad →` : 'Všechny rady →'}
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}
