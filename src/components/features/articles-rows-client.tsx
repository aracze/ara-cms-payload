'use client'

import { LoadMoreButton } from '@/components/features/load-more-button'
import { useEffect, useRef, useState } from 'react'
import { ThumbRow } from './thumb-row'
import { ArticleRowCard, type ArticleCardVM } from './article-row'

// Klientský ostrůvek: drží jen `visibleCount` a přepíná viditelnost přebytku.
// Data dostává jako lehký VM (bez plných těl článků) — ten předpočítá server
// (ArticlesList).
//
// Rubriky zobrazují články jako plnohodnotné karty ve stylu stránek míst
// (fotka 280×180 vpravo, perex, „Číst více") — finální volba uživatele
// 28.8.2026 ze živých srovnání: rubrika je „výkladní skříň" článků, všechny
// mají rovnocennou váhu (žádný zvýrazněný první).
const ARTICLES_STEP = 8

export const ArticlesRowsClient = ({ items }: { items: ArticleCardVM[] }) => {
  const [visibleCount, setVisibleCount] = useState(ARTICLES_STEP)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const spacerRef = useRef<HTMLDivElement | null>(null)

  const hasMore = visibleCount < items.length

  // „Chytré" lepení pravého panelu (rozhodnutí uživatele, 28.8.2026): panel
  // jede se stránkou; při scrollu DOLŮ se zafixuje, jakmile je vidět jeho
  // konec (poslední článek), při scrollu NAHORU jede s ní zpátky a zafixuje
  // se, jakmile je vidět jeho začátek — 20 px od horní hrany (stejně jako
  // obsah u praktických informací). CSS sticky umí samo jen fixaci dole
  // (kotva `top: vh − výška − 20`); chování při scrollu nahoru dorovnává
  // `margin-top`, který panel drží v toku stránky tam, kde ho čtenář vidí.
  useEffect(() => {
    const panel = panelRef.current
    const spacer = spacerRef.current
    const parent = panel?.parentElement
    if (!panel || !spacer || !parent) return
    const GAP = 20
    let lastY = window.scrollY
    let mode: 'down' | 'up' | 'fits' | null = null

    // Fixaci drží vždy CSS (žádné dorovnávání polohy skriptem — to poskakovalo,
    // protože scroll event přichází o snímek později):
    //  · směr DOLŮ  → kotva `top: vh − výška − GAP` = panel jede se stránkou
    //    a zafixuje se, když je vidět jeho KONEC;
    //  · směr NAHORU → kotva `bottom: vh − výška − GAP` = panel jede se
    //    stránkou a zafixuje se, když je vidět jeho ZAČÁTEK (20 px od hrany,
    //    jako obsah u praktických informací).
    // Skript jen při ZMĚNĚ SMĚRU přepne kotvu a přes výšku rozpěrky NAD
    // panelem ho ukotví v toku přesně tam, kde právě je, aby při přepnutí
    // neskočil. (Rozpěrka, ne margin-top: velký margin sticky prvku brání
    // prohlížeči panel posouvat a fixace dole pak nefunguje.)
    const switchMode = (dir: 'down' | 'up') => {
      const vh = window.innerHeight
      const h = panel.offsetHeight

      // Krátký panel se vejde celý — stačí obyčejné lepení nahoře.
      if (h + 2 * GAP <= vh) {
        if (mode !== 'fits') {
          mode = 'fits'
          panel.style.top = `${GAP}px`
          panel.style.bottom = 'auto'
          spacer.style.height = '0px'
        }
        return
      }
      if (dir === mode) return

      const rectTop = panel.getBoundingClientRect().top
      const parentTop = parent.getBoundingClientRect().top
      const maxSpacer = Math.max(0, parent.clientHeight - h)
      spacer.style.height = `${Math.min(Math.max(rectTop - parentTop, 0), maxSpacer)}px`
      if (dir === 'down') {
        panel.style.top = `${vh - h - GAP}px`
        panel.style.bottom = 'auto'
      } else {
        panel.style.top = 'auto'
        panel.style.bottom = `${vh - h - GAP}px`
      }
      mode = dir
    }

    const onScroll = () => {
      const y = window.scrollY
      if (y !== lastY) switchMode(y > lastY ? 'down' : 'up')
      lastY = y
    }
    const onResize = () => {
      // Po změně velikosti okna přepočítat kotvu aktuálního směru.
      const current = mode === 'up' ? 'up' : 'down'
      mode = null
      switchMode(current)
    }

    switchMode('down')
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
    }
  }, [items.length])

  // Automatické donačítání při scrollu (jen rubriky — rozhodnutí uživatele,
  // 28.8.2026): hlídka pod seznamem odkryje další dávku, jakmile se přiblíží
  // do 600 px od okraje obrazovky. Články jsou v HTML všechny, takže se nic
  // nestahuje — jen se odkrývají, stejně jako přes tlačítko. Tlačítko zůstává
  // jako záloha (čtečky, klávesnice, selhání observeru).
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasMore) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((c) => c + ARTICLES_STEP)
        }
      },
      { rootMargin: '600px 0px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore])

  if (items.length === 0) return null

  // Nadpis/podtitulek zde nejsou — seznam se používá na stránkách rubrik,
  // kde stránka sama je „Reportáže a cestopisy" apod., takže by byly redundantní.
  return (
    <section id="clanky" className="w-full bg-white pt-2 pb-16">
      <div className="mx-auto flex w-full max-w-7xl gap-10 px-4 md:px-12 lg:gap-14">
        <div className="mx-auto w-full min-w-0 max-w-[880px] flex-1">
          <div className="flex flex-col gap-8">
            {/* Renderujeme VŠECHNY články (kvůli SEO — odkazy jsou v HTML), přebytek
              schováme přes `hidden` (display:none → jejich obrázky se ani nenačtou,
              dokud se k nim čtenář nedoscrolluje). */}
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

          {/* Hlídka pro donačítání — bez výšky, jen kotva pro IntersectionObserver. */}
          <div ref={sentinelRef} aria-hidden="true" />

          {hasMore && (
            <div className="mt-10 flex justify-center">
              <LoadMoreButton onClick={() => setVisibleCount((c) => c + ARTICLES_STEP)}>
                Zobrazit další články
              </LoadMoreButton>
            </div>
          )}
        </div>

        {/* Pravý panel: přehled všech článků rubriky s miniaturami (nápad
            uživatele, 28.8.2026 — „ať čtenář hned vidí, co v sekci je").
            Nadpis „Články v rubrice · N" ve stejném stylu jako „Nejnovější
            články" na homepage (normální řez, ne uppercase) — vyzkoušena
            i podoba bez nadpisu, uživatel ho chtěl zpět (29. 8.).
            Odkazy vedou rovnou na články. Jen desktop. Panel NEMÁ vnitřní
            rolování — jede celý se stránkou a o fixaci nahoře/dole se stará
            „chytré" lepení (useEffect výš), takže na konci stránky je vidět
            i konec seznamu. */}
        <aside className="hidden lg:block w-[300px] shrink-0">
          {/* Rozpěrka „chytrého" lepení — drží panel v toku na místě při
              přepnutí kotvy (viz useEffect výš). */}
          <div ref={spacerRef} aria-hidden="true" />
          <div ref={panelRef} className="sticky">
            <p className="font-heading mb-3 text-[16px] font-bold text-[#1a3f6c]">
              Články v rubrice · {items.length}
            </p>
            <nav aria-label="Seznam článků v rubrice" className="pr-2">
              <ul className="divide-y divide-gray-100">
                {items.map((item) => (
                  <li key={item.key}>
                    {/* Kompaktní velikost (44 px) — rejstřík s 18+ položkami. */}
                    <ThumbRow
                      href={item.href}
                      src={item.imageUrl}
                      size="sm"
                      title={item.title}
                      titleLines={2}
                      className="py-2"
                    />
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </aside>
      </div>
    </section>
  )
}
