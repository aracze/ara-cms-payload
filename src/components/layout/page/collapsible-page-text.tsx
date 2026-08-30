'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { PageContributor, type Contributor } from './page-contributor'

/**
 * Sbalovat má smysl až od tří odstavců — kratší text se vejde do sbaleného boxu
 * celý a tlačítko „zobrazit více" by nemělo co odkrýt.
 *
 * SEO: do HTML jde VŽDY celý text a sbalení dělá jen CSS (`max-h` +
 * `overflow-hidden`). Dřív se HTML usekávalo za druhým odstavcem a zbytek se
 * do stránky dostal až po kliknutí — vyhledávače tak u zemí a měst indexovaly
 * jen úvod (~100 slov). Obsah skrytý stylem Google indexuje plnou vahou, obsah
 * mimo DOM ne.
 */
function countParagraphs(html: string): number {
  return (html.match(/<p\b/gi) ?? []).length
}

/** Výška sbaleného boxu (Tailwind `max-h-[250px]` níže musí sedět). */
const COLLAPSED_MAX_HEIGHT = 250

export function CollapsiblePageTextWithContributor({
  textHtml,
  contributor,
  collapsible = true,
  proseClassName,
}: {
  /**
   * BEZPEČNOST: HTML se vkládá přes dangerouslySetInnerHTML. Volající MUSÍ předat
   * už sanitizovaný HTML (typicky z `richTextToHtml`, který volá DOMPurify).
   * Nikdy sem neposílej neošetřený vstup od uživatele.
   */
  textHtml: string
  contributor?: Contributor | null
  /** Sbalování textu + „zobrazit více" — jen na stránkách „Místo k navštívení". */
  collapsible?: boolean
  /** Extra třída prose boxu (např. `poi-prose` = omezená výška fotek u cílů). */
  proseClassName?: string
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const canCollapse = useMemo(() => countParagraphs(textHtml) > 2, [textHtml])
  // Na serveru rozhoduje počet odstavců (víc než dva = pravděpodobně přetéká).
  // Po připojení změříme skutečnou výšku: tři krátké odstavce se do boxu
  // vejdou celé a přechod do bílé + „zobrazit více" by neměly co odkrýt.
  const boxRef = useRef<HTMLDivElement>(null)
  const [fitsCollapsed, setFitsCollapsed] = useState(false)
  useEffect(() => {
    const el = boxRef.current
    if (!el || !collapsible || !canCollapse) return
    setFitsCollapsed(el.scrollHeight <= COLLAPSED_MAX_HEIGHT)
  }, [textHtml, collapsible, canCollapse])
  const shouldCollapse = collapsible && canCollapse && !fitsCollapsed

  return (
    <>
      <div
        ref={boxRef}
        className={cn('relative', !isExpanded && shouldCollapse && 'max-h-[250px] overflow-hidden')}
        // `overflow: hidden` odkazy z oříznuté části nevyřadí z tabulátoru —
        // klávesnice by fokusovala neviditelný odkaz. Fokus dovnitř box rozbalí.
        onFocus={() => {
          if (shouldCollapse && !isExpanded) setIsExpanded(true)
        }}
      >
        {/* prose třídy jsou přímo na boxu s textem, aby odstavce byly PŘÍMÝMI
            potomky .prose — jinak selže selektor `.prose > p:first-of-type`
            (úvodní lead odstavec). dangerouslySetInnerHTML nesmí být na stejném
            elementu jako sourozenecký JSX (bílý přechod níže), proto vlastní div. */}
        <div
          className={cn(
            'reading-prose prose max-w-[808px] prose-a:text-[#215491] prose-a:no-underline hover:prose-a:underline',
            proseClassName,
          )}
          dangerouslySetInnerHTML={{ __html: textHtml }}
        />
        {/* Text mizí do bílé — naznačuje, že pokračuje dál. */}
        {shouldCollapse && !isExpanded && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[50px] bg-gradient-to-b from-transparent to-white" />
        )}
      </div>

      {shouldCollapse && !isExpanded && (
        // Desktop: autor je vyjmutý z toku (absolutně vlevo), aby „zobrazit více"
        // bylo vycentrované na CELOU šířku (floatem by ho tlačítko — vlastní BFC —
        // neobtékalo a odsunulo se doprava). Mobil: skládáme pod sebe, ale tlačítko
        // MUSÍ být hned pod textem (proto je v kódu první) — autor mezi useknutým
        // textem a „zobrazit více" rozbíjel souvislost mezi nimi.
        <div className="relative mt-[30px] flex w-full flex-col items-center gap-3 sm:min-h-[44px] sm:flex-row sm:justify-center sm:gap-0">
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            aria-expanded={isExpanded}
            // Svislý padding dělá z 20px řádku ~40px plochu pro prst (WCAG 2.2 chce
            // aspoň 24); záporný margin drží původní rozestupy.
            className="block w-[130px] py-2.5 -my-2.5 text-center text-[14px] font-bold leading-[19.5px] text-[#005580] hover:underline"
          >
            zobrazit více
            <svg
              aria-hidden="true"
              viewBox="0 0 10 6"
              className="ml-[6px] inline-block h-[10px] w-[10px] align-middle"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M1 1l4 4 4-4" />
            </svg>
          </button>

          {contributor?.name && (
            <div className="sm:absolute sm:left-0 sm:top-1/2 sm:-translate-y-1/2">
              <PageContributor contributor={contributor} align="start" />
            </div>
          )}
        </div>
      )}

      {(!shouldCollapse || isExpanded) && contributor?.name && (
        /* Matches legacy .contribution { margin-top: 30px } (default, non-placeToVisit) */
        <div className="mt-[30px]">
          <PageContributor contributor={contributor} />
        </div>
      )}
    </>
  )
}
