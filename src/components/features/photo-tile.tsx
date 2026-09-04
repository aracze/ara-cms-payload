import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Fotodlaždice — JEDEN vzor pro všechny „fotka + bílý titulek přes ztmavení"
 * na webu: „Co vidět" na stránkách míst, profil uživatele, „Co dalšího vidět"
 * pod cílem a tři sekce homepage (Rady a tipy, Inspirace na cestu, Témata ke
 * čtení). Do 29. 8. 2026 to bylo šest samostatných kopií, které se rozjely
 * (rohy 8 vs. 16 px, černé vs. tmavě modré ztmavení do 58–100 % výšky).
 *
 * Rozhodnutí uživatele (29. 8. 2026, artifact „Výpisy článků", sekce 6–7):
 *  · rohy 16 px, měkký rozptýlený stín;
 *  · ztmavení „Z3": neutrální černé, u spodní hrany tmavší než dřív (82 %),
 *    ale jen do ~62 % výšky s trojstupňovým dojezdem — horní část fotky
 *    zůstává čistá a nezabarvená (tmavě modrý tint přebarvoval teplé fotky);
 *  · tři velikosti: S 150 (homepage), M 180 (témata, související cíle),
 *    L 280 (Co vidět, profil);
 *  · odznak v rohu: na profilu rozlišuje typ obsahu, v „Co vidět" špendlík
 *    říká „místo na mapě" (uživatel ho chtěl zpět, 29. 8.); homepage bez odznaku.
 *
 * Obrázek dodává volající jako `children` (next/image s `fill`, nebo
 * PlaceCardImage s ořezem podle zařízení) — dlaždice řeší rám, přejezd,
 * ztmavení a text.
 */

export type PhotoTileSize = 'sm' | 'md' | 'lg'

/** Rám dlaždice (rohy, stín, přejezd) — sdílí i bílé karty profilu bez fotky. */
export const PHOTO_TILE_FRAME =
  'rounded-2xl bg-white shadow-[0_4px_16px_-8px_rgba(0,0,0,0.18)] transition-shadow duration-500 hover:shadow-[0_14px_32px_-12px_rgba(0,0,0,0.3)]'

/** Náhradní podklad bez fotky — jeden pro dlaždice i karty článků. */
export function NoPreview() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#1a3f6c]/5 to-[#1a3f6c]/10">
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#1a3f6c]/20">
        Bez náhledu
      </span>
    </div>
  )
}

const SIZE_CLASS: Record<PhotoTileSize, string> = {
  // Mobil: dvě dlaždice vedle sebe → nižší, ale ne pruh (dřív h-20 = 80 px).
  sm: 'h-32 md:h-[150px]',
  md: 'h-36 md:h-[180px]',
  lg: 'h-[240px] sm:h-[280px]',
}

// Tučnost podle velikosti: malé dlaždice S mají titulky i na 3–4 řádky (rady
// na homepage) — tučné písmo se tam slévalo, proto polotučné (600). Střední
// a velké (Témata ke čtení, Co dalšího vidět, Co vidět, profil) zůstávají tučné
// (700) jako dosud na webu. Zpětná vazba uživatele 29. 8. 2026.
const TITLE_CLASS: Record<PhotoTileSize, string> = {
  sm: 'text-[14px] md:text-[15.5px] leading-snug font-semibold',
  md: 'text-[15.5px] md:text-[17px] leading-tight font-bold',
  lg: 'text-lg leading-tight font-bold',
}

/**
 * Špendlík — odznak místa (Co vidět, profil). Sdílený, ať je všude stejný.
 * CSS maska (`.pin-glyph` v globals.css) místo inline SVG: Řecko má 96 dlaždic
 * a každá kopie SVG stála 273 B (26 kB HTML), maska ~60 B. Stejný vzor jako
 * hvězdičky `.star-glyph`. Barva přes `text-*` (kreslí se `currentColor`).
 */
export const PinIcon = ({ className }: { className: string }) => (
  <span aria-hidden="true" className={cn('pin-glyph', className)} />
)

export function PhotoTile({
  href,
  title,
  sub,
  size,
  children,
  badge,
  topRight,
  meta,
  titleLines,
  titleSize,
  className,
  poiId,
}: {
  href: string
  title: string
  /** Popisek pod titulkem (cesta v hierarchii, země…). */
  sub?: string | null
  size: PhotoTileSize
  /** Obrázek vyplňující dlaždici (fill), nebo nic → náhradní podklad. */
  children?: ReactNode
  /** Ikona odznaku v levém horním rohu — jen kde rozlišuje typ obsahu. */
  badge?: ReactNode
  /** Slot v pravém horním rohu (např. ladicí odznak analytiky). */
  topRight?: ReactNode
  /** Řádek pod titulkem (hodnocení…). */
  meta?: ReactNode
  /**
   * Ořez titulku na 3 řádky (profil — dlouhé názvy článků). Jiné výpisy
   * dlaždic titulek neořezávají; další hodnotu přidej, až ji někdo použije.
   */
  titleLines?: 3
  /**
   * Styl titulku nezávisle na výšce dlaždice — výchozí = podle `size`.
   * Sekce s malými i velkými dlaždicemi (Témata ke čtení) tak mají všechny
   * titulky stejné; jinak by v jedné mřížce sousedily tučné a polotučné.
   */
  titleSize?: PhotoTileSize
  className?: string
  /** `data-poiid` pro měření kliků na místa. */
  poiId?: number | string
}) {
  return (
    <Link
      href={href}
      data-poiid={poiId}
      className={cn(
        'group relative block overflow-hidden',
        PHOTO_TILE_FRAME,
        SIZE_CLASS[size],
        className,
      )}
    >
      {children ? (
        <div className="absolute inset-0 transition-transform duration-700 group-hover:scale-105 motion-reduce:transition-none">
          {children}
        </div>
      ) : (
        <NoPreview />
      )}

      {badge && (
        <div className="absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-white/80 shadow-sm">
          {badge}
        </div>
      )}
      {topRight && <div className="absolute right-3 top-3">{topRight}</div>}

      {/* Ztmavení Z3 — viz hlavičku souboru. Arbitrary value, ať jsou tři
          stupně přechodu přesně tam, kde mají být. Malé dlaždice (S) mají
          titulky i na 3–4 řádky (rady na homepage), proto u nich přechod sahá
          výš (78 % jako dřív), aby horní řádek nevyjel do světlé fotky. */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-x-0 bottom-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.82),rgba(0,0,0,0.55)_30%,rgba(0,0,0,0.18)_70%,transparent)]',
          size === 'sm' ? 'h-[78%]' : 'h-[62%]',
        )}
      />

      <div className="absolute bottom-0 left-0 right-0 px-3 pb-3 sm:px-4 sm:pb-3.5">
        <h3
          className={cn(
            'text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.35)]',
            TITLE_CLASS[titleSize ?? size],
            titleLines === 3 && 'line-clamp-3',
          )}
        >
          {title}
        </h3>
        {sub && (
          <p className="mt-0.5 line-clamp-1 text-[12.5px] font-medium text-white/80 [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]">
            {sub}
          </p>
        )}
        {meta}
      </div>
    </Link>
  )
}
