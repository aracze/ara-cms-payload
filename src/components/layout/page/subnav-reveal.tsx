'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

/** Kolik px scrollu DOLŮ lištu schová — reaguje hned, ať nepřekáží čtení. */
const HIDE_AFTER = 12
/** Kolik px scrollu NAHORU lištu vrátí — víc než u schování, ať nebliká při
 *  drobném zavrtění prstem. */
const SHOW_AFTER = 24
/**
 * Lišta sekundárního menu, která se „lepí" k hornímu okraji: při čtení (scroll
 * dolů) zajede nahoru z obrazu, jakmile čtenář zascrolluje nahoru, vyjede
 * zpátky (vzor Medium, Google, zpravodajské appky). Nad hero sedí na svém
 * místě v toku stránky jako dřív.
 *
 * Sticky prvek si drží místo v toku, takže obsah při schování ani ukázání
 * neposkočí (žádný posun rozložení). Ostatním přilepeným panelům (obsah
 * stránky, mapa, reklama) říká přes CSS proměnnou `--subnav-offset` na <html>,
 * o kolik mají uhnout dolů; stejná proměnná řídí i `scroll-padding-top`, aby
 * cíl kotvy nezajel pod lištu.
 */
export function SubnavReveal({ children }: { children: ReactNode }) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  // Lišta odjela k horní hraně okna (jinak sedí na svém místě pod hero).
  const [stuck, setStuck] = useState(false)
  // Čtenář naposledy scrolloval nahoru → přilepená lišta má být vidět.
  const [revealed, setRevealed] = useState(false)
  // Zrcadlo `revealed` pro scroll handler (ať nesahá na zastaralý stav).
  const revealedRef = useRef(false)
  // Po kliku na kotvu (položka lišty, obsah stránky…) lištu „zamrazíme", dokud
  // čtenář sám znovu nezascrolluje: prohlížeč spočítal cíl s aktuálním
  // `scroll-padding-top`, a kdyby lišta cestou zmizela nebo vyjela, sekce by
  // přistála pod prázdným pruhem, resp. nadpis pod lištou.
  const frozenRef = useRef(false)

  const reveal = (value: boolean) => {
    revealedRef.current = value
    setRevealed(value)
  }

  // Hlídač těsně nad lištou: jakmile odjede nad okno, lišta je přilepená.
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(([entry]) => {
      setStuck(!entry.isIntersecting && entry.boundingClientRect.top < 0)
    })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  // Směr scrollu se střádá a při obratu nuluje — přepíná až po prahu.
  // Prohlížeč posílá scroll nejvýš jednou za snímek, throttle netřeba.
  useEffect(() => {
    let lastY = window.scrollY
    let streak = 0
    const onScroll = () => {
      // Pružení za horní okraj (iOS) hlásí záporný scrollY — bereme ho jako nulu.
      const y = Math.max(window.scrollY, 0)
      const delta = y - lastY
      lastY = y
      if (frozenRef.current) return
      // Stejný směr (nebo nula) střádá, obrat začíná znovu.
      streak = streak * delta >= 0 ? streak + delta : delta
      if (streak <= -SHOW_AFTER && !revealedRef.current) reveal(true)
      else if (streak >= HIDE_AFTER && revealedRef.current) reveal(false)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Zamrazení při kliku na jakýkoli odkaz s kotvou; uvolní ho až vlastní
  // vstup čtenáře (kolečko, dotyk, klávesa, tah posuvníkem). Plynulý posun
  // prohlížeče žádný takový vstup nevydá, takže délka posunu nehraje roli —
  // `scrollend` by naopak přišel i od doznívajícího předchozího scrollu.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null
      if (target?.closest('a[href*="#"]')) frozenRef.current = true
    }
    const release = () => {
      frozenRef.current = false
    }
    const inputs = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const
    document.addEventListener('click', onClick)
    for (const type of inputs) window.addEventListener(type, release, { passive: true })
    return () => {
      document.removeEventListener('click', onClick)
      for (const type of inputs) window.removeEventListener(type, release)
    }
  }, [])

  const visible = !stuck || revealed
  const overlaying = stuck && revealed

  // Panely lepené 20 px pod hranou (obsah, mapa, reklama) a kotvy uhnou o výšku
  // lišty jen ve chvíli, kdy je přilepená A vidět — jinak by zbytečně
  // nechávaly prázdný pruh. Výšku hlídá ResizeObserver (mění se s breakpointem
  // písma, otočením displeje).
  useEffect(() => {
    const root = document.documentElement
    if (!overlaying) {
      root.style.setProperty('--subnav-offset', '0px')
      return
    }
    const bar = barRef.current
    if (!bar) return
    const apply = () => root.style.setProperty('--subnav-offset', `${bar.offsetHeight}px`)
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(bar)
    return () => observer.disconnect()
  }, [overlaying])

  useEffect(() => {
    return () => {
      document.documentElement.style.removeProperty('--subnav-offset')
    }
  }, [])

  return (
    <>
      <div ref={sentinelRef} aria-hidden="true" className="h-px -mb-px" />
      <div
        ref={barRef}
        // Klávesnice: když fokus doputuje na položku schované lišty, ukážeme ji.
        onFocus={() => reveal(true)}
        // Tailwind 4 posouvá vlastností `translate` (ne `transform`) — animujeme ji;
        // stín se přepíná naráz, jeho animace by jen zbytečně překreslovala.
        className={`sticky top-0 z-30 transition-[translate] duration-300 ease-out motion-reduce:transition-none ${
          visible ? 'translate-y-0' : '-translate-y-full'
        } ${overlaying ? 'shadow-[0_2px_10px_rgba(0,0,0,0.08)]' : ''}`}
      >
        {children}
      </div>
    </>
  )
}
