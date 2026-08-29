import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Řádek s miniaturou — JEDEN vzor pro kompaktní výpisy „miniatura + text":
 * výsledky hledání (stránka i našeptávače), „Nejnovější články" na homepage,
 * panel „Články v rubrice" a kostra řádků „Co je nového". Do 29. 8. 2026 čtyři
 * kopie s miniaturami 40/46/48 px, rohy 8/12 a titulky černé/modré/šedomodré.
 *
 * Rozhodnutí uživatele (29. 8. 2026, artifact „Výpisy článků", sekce 8):
 *  · rohy miniatur 12 px, titulek polotučný modrý #1a3f6c (při najetí #215491),
 *    řádky odděluje tenká linka (rodič: `divide-y divide-gray-100`);
 *  · DVĚ velikosti: `md` 48 px pro seznamy k prohlížení, `sm` 44 px pro hustý
 *    rejstřík (panel rubriky s 18+ položkami) — jedna velikost by rejstřík
 *    natáhla o ~200 px;
 *  · doplňky (štítek kategorie, druhý řádek s cestou, odznak typu, čas) zůstávají
 *    věcí konkrétního místa — řádek dává jen kostru.
 */

export type ThumbSize = 'md' | 'sm'

const THUMB_PX: Record<ThumbSize, number> = { md: 48, sm: 44 }
const THUMB_BOX: Record<ThumbSize, string> = { md: 'h-12 w-12', sm: 'h-11 w-11' }

/** Miniatura (nebo náhradní podklad) se sjednocenými rohy a velikostí. */
export function Thumb({
  src,
  size = 'md',
  alt = '',
  fallback,
  className,
}: {
  src: string | null | undefined
  size?: ThumbSize
  alt?: string
  /** Co ukázat bez fotky (ikona…); bez zadání jemný modrý podklad. */
  fallback?: ReactNode
  className?: string
}) {
  const box = cn(THUMB_BOX[size], 'shrink-0 rounded-xl', className)
  if (src) {
    return (
      <Image
        src={src}
        alt={alt}
        width={THUMB_PX[size]}
        height={THUMB_PX[size]}
        className={cn(box, 'object-cover')}
      />
    )
  }
  return (
    <span aria-hidden="true" className={cn(box, 'flex items-center justify-center bg-[#1a3f6c]/5')}>
      {fallback}
    </span>
  )
}

/**
 * Třída titulku řádku — modrý (#1a3f6c), při najetí na řádek světlejší modrá.
 * Tučnost podle velikosti řádku, stejné pravidlo jako u fotodlaždic:
 *  · `md` (48 px — hledání, Co je nového) tučný 700 / 15 px: titulek soutěží
 *    s druhým šedým řádkem a polotučný se tam ztrácel;
 *  · `sm` (44 px — panel rubriky, Nejnovější články) polotučný 600 / 14 px:
 *    hustý rejstřík 18+ řádků byl s tučným písmem těžký.
 * (Zpětná vazba uživatele 29. 8. 2026.)
 */
export function thumbTitleClass(size: ThumbSize = 'md') {
  return cn(
    'leading-snug text-[#1a3f6c] transition-colors group-hover:text-[#215491]',
    size === 'sm' ? 'font-semibold text-[14px]' : 'font-bold text-[15px]',
  )
}

/** Celý řádek jako odkaz: miniatura vlevo, obsah (`children`) vpravo. */
export function ThumbRow({
  href,
  onClick,
  size = 'md',
  src,
  alt,
  fallback,
  children,
  className,
  hoverBg = false,
}: {
  href: string
  onClick?: () => void
  size?: ThumbSize
  src: string | null | undefined
  alt?: string
  fallback?: ReactNode
  children: ReactNode
  className?: string
  /** Šedý podklad při najetí — jen tam, kde se v řádcích vybírá (našeptávač). */
  hoverBg?: boolean
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'group flex items-center gap-3 py-2.5',
        hoverBg && 'rounded-lg px-2 transition-colors hover:bg-gray-50',
        className,
      )}
    >
      <Thumb src={src} size={size} alt={alt} fallback={fallback} />
      <div className="min-w-0 flex-1">{children}</div>
    </Link>
  )
}
