import Link from 'next/link'
import { PlaceCardImage } from '@/components/layout/page/place-card-image'
import { PhotoTile, PinIcon } from '@/components/features/photo-tile'
import { StarRating } from '@/components/features/reviews/star-rating'
import { formatReviewDate } from '@/lib/relative-time'
import type {
  ProfileArticleItem,
  ProfileCommentItem,
  ProfilePlaceItem,
  ProfileReviewItem,
} from '@/types/payload'

/**
 * Karty profilu — JEDEN vizuální jazyk pro místa, cíle, recenze i komentáře.
 *
 * Fotokarty jsou sdílená fotodlaždice webu (`PhotoTile`, velikost L 280) —
 * jediné místo, kde má odznak v rohu smysl, protože tu rozlišuje místa,
 * články a recenze. Karty bez fotky (a karty recenzí/komentářů) jsou bílé
 * s modrým názvem — odznak je pak plný modrý kruh s bílou ikonou, aby byl na
 * bílé vidět; rám kopíruje rohy a stín fotodlaždice.
 *
 * Vše jsou SERVER komponenty; interaktivní je jen mřížka (ProfileCardGrid).
 */

/** Sdílený rám karty: stejná výška, rádius, stín a chování při přejezdu. */
const CARD =
  'group relative flex h-[280px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_4px_16px_-8px_rgba(0,0,0,0.18)] transition-shadow duration-500 hover:shadow-[0_14px_32px_-12px_rgba(0,0,0,0.3)]'

/** Odznak na bílé kartě — plný modrý kruh s bílou ikonou. */
function SolidBadge({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#215491] text-white">
      {children}
    </div>
  )
}

const StarBadgeIcon = ({ className }: { className: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
  </svg>
)

// Stejná kulatá bublina jako u výpisu komentářů a v sekci „Co je nového" —
// dřívější hranatá ikona se od zbytku webu lišila.
const CommentBadgeIcon = ({ className }: { className: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
  </svg>
)

/** Ikona článku — stejný list papíru jako na kartách článků v rubrikách. */
const DocIcon = ({ className }: { className: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
  </svg>
)

/** Datum na spodní hraně karty — společný podpis („Recenzováno: …"). */
function CardDate({ label, iso, display }: { label: string; iso: string; display: string }) {
  return (
    <p className="pt-3 text-[13px] text-[#8a939b]">
      <span className="font-semibold text-[#5b666e]">{label}: </span>
      <time dateTime={iso}>{display}</time>
    </p>
  )
}

/**
 * Text recenze/komentáře na kartě s pevnou výškou.
 *
 * Počet řádků se NEDÁ zafixovat přes `line-clamp`: kolik se jich vejde, závisí
 * na tom, jestli se název cíle zalomil na jeden nebo dva řádky (a to se mění
 * s šířkou okna). Pevný počet proto na některých kartách přetekl a text se
 * ořezal v půli řádku — bez jakéhokoli signálu, že něco chybí.
 *
 * Blok proto vyplní zbylé místo (`flex-1`) a přebytek plynule vybledne do
 * bílé — u krátkého textu se maska promítne do prázdna, takže je neviditelná.
 * Řešení se samo přizpůsobí a nikdy nekončí půlřádkem.
 */
function CardText({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 min-h-0 flex-1 overflow-hidden text-[14.5px] leading-relaxed text-[#4a4a4a] [-webkit-mask-image:linear-gradient(to_bottom,black_calc(100%-2.4em),transparent)] [mask-image:linear-gradient(to_bottom,black_calc(100%-2.4em),transparent)]">
      {children}
    </p>
  )
}

/**
 * Fotokarta — společný základ pro místa, turistické cíle i články: fotka na
 * celou kartu, odznak typu, ztmavení zdola a přes něj název + popisek
 * (u míst cesta v hierarchii, u článků místo, o kterém článek je).
 * Bez fotky se karta překlopí do bílé podoby s plným modrým odznakem.
 */
function PhotoCard({
  href,
  title,
  subtitle,
  imageUrl,
  icon: Icon,
}: {
  href: string
  title: string
  subtitle: string | null
  imageUrl: string | null
  icon: (props: { className: string }) => React.ReactElement
}) {
  if (imageUrl) {
    return (
      <PhotoTile
        href={href}
        title={title}
        sub={subtitle}
        size="lg"
        titleLines={3}
        badge={<Icon className="h-4 w-4 text-[#1a3f6c]" />}
      >
        <PlaceCardImage src={imageUrl} alt={title} hasMap={false} className="object-cover" />
      </PhotoTile>
    )
  }
  return (
    <Link href={href} className={CARD}>
      <div className="flex h-full flex-col p-5">
        <SolidBadge>
          <Icon className="h-[18px] w-[18px]" />
        </SolidBadge>
        <h3 className="line-clamp-4 text-lg font-bold leading-tight text-[#1a3f6c] transition-colors group-hover:text-[#2a5a9c]">
          {title}
        </h3>
        {subtitle && <p className="mt-1 text-[13px] text-[#8a939b]">{subtitle}</p>}
      </div>
    </Link>
  )
}

/** Místo / turistický cíl — karta ze stránek míst + cesta v hierarchii. */
export function ProfilePlaceCard({ item }: { item: ProfilePlaceItem }) {
  return (
    <PhotoCard
      href={item.fullSlug}
      title={item.title}
      subtitle={item.path}
      imageUrl={item.imageUrl}
      icon={PinIcon}
    />
  )
}

/** Článek — stejná fotokarta jako místa, jen s ikonou článku. */
export function ProfileArticleCard({ item }: { item: ProfileArticleItem }) {
  return (
    <PhotoCard
      href={item.href}
      title={item.title}
      subtitle={item.path}
      imageUrl={item.imageUrl}
      icon={DocIcon}
    />
  )
}

/** Recenze — název cíle, hvězdičky, text a datum; celá karta vede na cíl. */
export function ProfileReviewCard({ item }: { item: ProfileReviewItem }) {
  const date = formatReviewDate(item.reviewedAt)
  return (
    <Link href={item.targetHref} className={CARD}>
      <div className="flex h-full flex-col p-5">
        <SolidBadge>
          <StarBadgeIcon className="h-[18px] w-[18px]" />
        </SolidBadge>
        <h3 className="line-clamp-2 shrink-0 text-lg font-bold leading-tight text-[#1a3f6c] transition-colors group-hover:text-[#2a5a9c]">
          {item.targetTitle}
        </h3>
        <div className="mt-1.5 shrink-0">
          <StarRating rating={item.rating} size={15} />
        </div>
        <CardText>{item.body}</CardText>
        {date && <CardDate label="Recenzováno" iso={date.isoDate} display={date.display} />}
      </div>
    </Link>
  )
}

/** Komentář — stejná karta bez hvězdiček; vede na článek/stránku. */
export function ProfileCommentCard({ item }: { item: ProfileCommentItem }) {
  const date = formatReviewDate(item.commentedAt)
  return (
    <Link href={item.targetHref} className={CARD}>
      <div className="flex h-full flex-col p-5">
        <SolidBadge>
          <CommentBadgeIcon className="h-[18px] w-[18px]" />
        </SolidBadge>
        <h3 className="line-clamp-2 shrink-0 text-lg font-bold leading-tight text-[#1a3f6c] transition-colors group-hover:text-[#2a5a9c]">
          {item.targetTitle}
        </h3>
        <CardText>{item.body}</CardText>
        {date && <CardDate label="Komentováno" iso={date.isoDate} display={date.display} />}
      </div>
    </Link>
  )
}
