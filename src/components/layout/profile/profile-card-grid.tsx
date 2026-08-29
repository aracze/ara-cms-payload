'use client'

import { LoadMoreButton } from '@/components/features/load-more-button'
import { useState } from 'react'
import { pluralCs } from '@/lib/utils'

/**
 * Mřížka karet na profilu + „Zobrazit další" — jediný klientský ostrůvek
 * profilu. Samotné karty renderuje SERVER a posílá je sem jako `children`,
 * takže v prohlížeči nekončí jejich markup ani texty recenzí, jen přepínání
 * viditelnosti. Stejný vzor jako ArticlesRowsClient: v HTML jsou VŠECHNY karty
 * (odkazy kvůli SEO), přebytek je schovaný přes `hidden` (display:none →
 * obrázky se nenačtou, dokud uživatel nerozbalí).
 */
const STEP = 8

export function ProfileCardGrid({
  children,
  moreNoun,
}: {
  children: React.ReactNode[]
  /**
   * Skloňované tvary pro tlačítko, vždy VČETNĚ „další" (i to se skloňuje):
   * [1 → „další místo", 2–4 → „další místa", 5+ → „dalších míst"].
   * Počet zbývajících položek nese jen tohle tlačítko — u nadpisu sekce
   * číslo nebylo potřeba (souhrn nahoře ho už uvádí) a působilo tam navíc.
   */
  moreNoun: [string, string, string]
}) {
  const [visibleCount, setVisibleCount] = useState(STEP)

  const items = Array.isArray(children) ? children : [children]
  if (items.length === 0) return null

  const hasMore = visibleCount < items.length
  const remaining = items.length - visibleCount
  // U jediné zbývající položky číslo vynecháme („Zobrazit další místo“).
  const moreLabel =
    remaining === 1
      ? `Zobrazit ${moreNoun[0]}`
      : `Zobrazit ${remaining} ${pluralCs(remaining, moreNoun)}`

  return (
    <>
      {/*
       * Nejvýš 4 dlaždice v řadě — stejně jako výpis míst na webu, když má
       * mřížka celou šířku (3 sloupce tam má jen varianta s mapou, která
       * zabírá 44 % šířky). Při 4 sloupcích vyjde karta ~278 px, tedy skoro
       * čtverec, na který jsou nastavené i Cloudinary ořezy (`PlaceCardImage`
       * kreslí desktop v poměru 1:1). Pět sloupců by kartu stlačilo na ~218 px:
       * z krajinářských fotek by se stal portrét a v textových kartách by na
       * řádek zbylo ~30 znaků, což čeština s dlouhými slovy odnese špatně.
       *
       * Ke čtyřem sloupcům se ale přechází až od 1280 px. Mezi 1024–1280 px by
       * čtyři karty měly jen ~214 px (stejně málo jako pětka na velkém
       * monitoru), takže se tam drží 3 sloupce à ~293 px.
       */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((child, index) => (
          <div key={index} className={index >= visibleCount ? 'hidden' : undefined}>
            {child}
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="mt-12 flex justify-center">
          <LoadMoreButton onClick={() => setVisibleCount((c) => c + STEP)}>
            {moreLabel}
          </LoadMoreButton>
        </div>
      )}
    </>
  )
}
