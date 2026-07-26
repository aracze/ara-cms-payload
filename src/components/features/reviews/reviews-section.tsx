import React from 'react'
import { ReviewPublic } from '@/types/payload'
import { getTurnstileSiteKey } from '@/lib/comment-spam'
import { AdSenseScript, ArticleAd } from '@/components/features/article-ad'
import { ReviewItem } from './review-item'
import { ReviewRatingBox } from './review-rating-box'

/**
 * Sekce recenzí turistického cíle (jednotný styl s inline recenzemi na
 * stránce místa):
 *  1. lišta „Byl jsi zde? Ohodnoť to!" s hvězdičkovým vstupem a sbaleným
 *     formulářem (přes celou šířku obsahu),
 *  2. výpis recenzí (nejnovější nahoře, jemné oddělovače),
 *  3. reklamní sloupec vpravo (300×250 při méně než 2 recenzích, jinak 300×600
 *     — stejná logika i sloty jako legacy).
 *
 * Zarovnání: stejné centrování jako komentáře u článku (max-w-[1188px] = obsah
 * 808 + mezera 40 + reklama 340); lg:pl-16 posadí levý okraj na text stránky.
 */
export function ReviewsSection({
  pageId,
  pageTitle,
  reviews,
}: {
  pageId: number
  pageTitle: string
  reviews: ReviewPublic[]
}) {
  const siteKey = getTurnstileSiteKey()

  return (
    <section id="recenze" className="mx-auto w-full max-w-7xl scroll-mt-24 px-4 pb-12 md:pb-20">
      <div className="lg:mx-auto lg:max-w-[1188px] lg:pl-16">
        <ReviewRatingBox pageId={pageId} turnstileSiteKey={siteKey} />

        <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
          <div className="min-w-0 flex-1">
            <div className="mt-8">
              {reviews.length === 0 && (
                <p className="py-4 text-[14px] text-gray-500">
                  Zatím tu není žádná recenze. Buď první, kdo se podělí o zážitek!
                </p>
              )}
              {reviews.map((review, i) => (
                <ReviewItem
                  key={review.id}
                  review={review}
                  itemReviewed={pageTitle}
                  // Jemné oddělovače (jako inline výpis); poslední recenze bez linky.
                  className={i === reviews.length - 1 ? 'border-b-0' : 'border-[#eceff2]'}
                />
              ))}
            </div>
          </div>

          <aside className="hidden w-[340px] shrink-0 lg:block">
            <AdSenseScript />
            <ArticleAd
              variant={reviews.length < 2 ? 'box' : 'primary'}
              className="mt-10 lg:sticky lg:top-5"
            />
          </aside>
        </div>
      </div>
    </section>
  )
}
