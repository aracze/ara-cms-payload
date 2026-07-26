import React from 'react'
import Link from 'next/link'
import { ReviewPublic } from '@/types/payload'
import { formatReviewDate } from '@/lib/relative-time'
import { cn } from '@/lib/utils'
import { UserAvatar } from '@/components/user-avatar'
import { StarRating } from './star-rating'

/**
 * Jedna recenze turistického cíle — vzhled podle legacy `.author-review`:
 * avatar vlevo, jméno autora (odkaz na profil u registrovaných), hvězdičky
 * + „Recenzováno: dd.MM.yyyy", pod tím text. Oddělovací linky řeší rodič
 * (border-t seznamu) + border-b tady. Mikrodata schema.org/Review jako legacy.
 */
export function ReviewItem({
  review,
  itemReviewed,
  className,
}: {
  review: ReviewPublic
  itemReviewed: string
  /** Doladění vzhledu podle kontextu (např. jemnější/žádný oddělovač v inline výpisu). */
  className?: string
}) {
  const date = formatReviewDate(review.reviewedAt)
  const profileHref = review.authorUsername ? `/profil/${review.authorUsername}` : null

  const avatar = <UserAvatar name={review.authorName} avatarUrl={review.avatarUrl} size={45} />

  return (
    <article
      id={`recenze-${review.id}`}
      className={cn('flex gap-4 border-b border-[#d7d7d7] py-4', className)}
      itemScope
      itemType="https://schema.org/Review"
    >
      <meta itemProp="itemReviewed" content={itemReviewed} />

      <div className="shrink-0 pt-2">
        {profileHref ? (
          <Link href={profileHref} aria-label={`Profil ${review.authorName}`}>
            {avatar}
          </Link>
        ) : (
          avatar
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="pb-1 pt-2 text-[17px] tracking-[1px] text-[#565656]" itemProp="author">
          {profileHref ? (
            <Link href={profileHref} className="hover:underline">
              {review.authorName}
            </Link>
          ) : (
            review.authorName
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] leading-none text-[#a6b0b9]">
          {/* inline-flex: bez něj se hvězdičky (SVG) zarovnají na účaří textu
              a vůči datu „uskakují" nahoru — flex je vycentruje na střed řádku. */}
          <span
            itemProp="reviewRating"
            itemScope
            itemType="https://schema.org/Rating"
            className="inline-flex items-center"
          >
            <meta itemProp="ratingValue" content={String(review.rating)} />
            <meta itemProp="bestRating" content="5" />
            <StarRating rating={review.rating} />
          </span>
          {date && (
            <span>
              Recenzováno:{' '}
              <time dateTime={date.isoDate} itemProp="datePublished">
                {date.display}
              </time>
            </span>
          )}
        </div>

        {/* Text recenze je čistý plaintext (migrace HTML neobsahuje) — zalomení řádků zachováme. */}
        <p
          className="mt-2 whitespace-pre-line break-words leading-relaxed text-[#2c3643]"
          itemProp="reviewBody"
        >
          {review.body}
        </p>
      </div>
    </article>
  )
}
