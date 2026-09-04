'use client'

import { LoadMoreButton } from '@/components/features/load-more-button'
import { useState } from 'react'
import { ArticleAd } from './article-ad'
import { ArticleRowCard, type ArticleCardVM } from './article-row'

// Klientský ostrůvek klasického (vertikálního) seznamu. Drží jen `visibleCount`.
// Data = lehký VM předpočítaný na serveru (ArticlesListClassic) — bez plných těl.
// Karta je sdílená s rubrikami (ArticleRowCard) — dřív tu byla její ruční kopie,
// takže se obě podoby mohly nepozorovaně rozjet (rodina „bílá karta s fotkou").
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
              <ArticleRowCard
                key={item.key}
                title={item.title}
                href={item.href}
                excerpt={item.excerpt}
                imageUrl={item.imageUrl}
                className={index >= visibleCount ? 'hidden' : undefined}
              />
            ))}
          </div>

          {/* Ad column — like the legacy layout. 340 = 300px reklama + 2×20px
              padding šedého boxu (viz ArticleAd), stejně jako aside u článků. */}
          <aside className="hidden lg:block w-[340px] shrink-0">
            <ArticleAd variant="primary" className="sticky top-pod-listou" />
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
