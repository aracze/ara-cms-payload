'use client'

import { LoadMoreButton } from '@/components/features/load-more-button'
import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { isCloudinary } from '@/lib/cloudinary-loader'
import { ArticleAd } from './article-ad'
import type { ArticleCardVM } from './article-row'

// Klientský ostrůvek klasického (vertikálního) seznamu. Drží jen `visibleCount`.
// Data = lehký VM předpočítaný na serveru (ArticlesListClassic) — bez plných těl.
const ARTICLES_STEP = 3

export const ArticlesListClassicClient = ({
  items,
  subtitle,
}: {
  items: ArticleCardVM[]
  subtitle: string
}) => {
  const [visibleCount, setVisibleCount] = useState(ARTICLES_STEP)

  if (items.length === 0) return null

  const hasMore = visibleCount < items.length

  return (
    <section id="clanky" className="w-full py-16 bg-white">
      <div className="max-w-7xl mx-auto px-4 md:px-12">
        <div className="flex flex-col mb-12 items-center text-center">
          <h2 className="text-3xl font-bold text-[#1a3f6c] mb-3 font-heading tracking-tight">
            Články a cestopisy
          </h2>
          <div className="w-[30px] h-[1px] bg-[#215491] rounded-full mb-5"></div>
          <p className="text-[17px] text-gray-400 max-w-xl leading-relaxed">{subtitle}</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-10 lg:gap-16">
          {/* Article list — one below another. Renderujeme VŠECHNY (SEO — odkazy v HTML),
              přebytek schováme přes `hidden` (obrázky se načtou až po „zobrazit další"). */}
          <div className="flex-1 flex flex-col gap-8">
            {items.map((item, index) => (
              <Link
                key={item.key}
                href={item.href}
                className={cn(
                  'group flex flex-col sm:flex-row gap-6 items-stretch bg-white rounded-3xl border border-gray-100/50 p-5 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.1)] transition-all duration-500 transform hover:-translate-y-2 hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.15)]',
                  index >= visibleCount && 'hidden',
                )}
              >
                <div className="flex-1 order-2 sm:order-1 flex flex-col justify-center">
                  <h3 className="text-2xl font-bold text-[#1a3f6c] mb-3 leading-[1.2] transition-colors group-hover:text-[#215491]">
                    {item.title}
                  </h3>
                  <p className="text-gray-500 line-clamp-3 text-[15px] leading-relaxed font-light">
                    {item.excerpt}
                  </p>
                  <div className="mt-[20px] flex items-center text-[#215491] font-bold text-[12px] tracking-[0.1em] uppercase group/read font-heading">
                    <span>Číst více</span>
                    <div className="ml-3 w-8 h-[1px] bg-[#215491]/30 transition-all duration-300 group-hover/read:w-12 group-hover/read:bg-[#215491]"></div>
                  </div>
                </div>
                <div className="order-1 sm:order-2 relative w-full sm:w-[280px] h-[180px] shrink-0 overflow-hidden rounded-2xl">
                  {item.imageUrl ? (
                    <Image
                      src={item.imageUrl}
                      alt={item.title}
                      fill
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                      sizes="(max-width: 640px) 100vw, 280px"
                      unoptimized={!isCloudinary(item.imageUrl)}
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-[#1a3f6c]/5 to-[#1a3f6c]/10 flex items-center justify-center">
                      <span className="text-[#1a3f6c]/20 font-bold uppercase tracking-[0.2em] text-[10px]">
                        Bez náhledu
                      </span>
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>

          {/* Ad column — like the legacy layout. 340 = 300px reklama + 2×20px
              padding šedého boxu (viz ArticleAd), stejně jako aside u článků. */}
          <aside className="hidden lg:block w-[340px] shrink-0">
            <ArticleAd variant="primary" className="sticky top-24" />
          </aside>
        </div>

        {hasMore && (
          <div className="mt-12 flex justify-center">
            <LoadMoreButton onClick={() => setVisibleCount((c) => c + ARTICLES_STEP)}>
              Zobrazit další články
            </LoadMoreButton>
          </div>
        )}
      </div>
    </section>
  )
}
