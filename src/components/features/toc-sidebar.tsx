'use client'

import React, { useEffect, useRef, useState } from 'react'

export interface TocEntry {
  id: string
  text: string
  level: number
}

/**
 * Přilepený panel „Obsah stránky" se scrollspy: sleduje, která sekce textu se
 * právě čte, zvýrazní ji a posune vlastní posuvník tak, aby byla vidět.
 * Dlouhý obsah (složené Praktické informace) se jinak nevešel na obrazovku
 * a čtenář neviděl, kde ve stránce je.
 *
 * `children` = blok pod obsahem (reklama) — zůstává server-side, sem přichází
 * už vyrenderovaný.
 */
export function TocSidebar({
  items,
  practicalInfo = false,
  children,
}: {
  items: TocEntry[]
  /** Tříúrovňová varianta pro složené Praktické informace (sekce modře). */
  practicalInfo?: boolean
  children?: React.ReactNode
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Aktivní sekce = poslední nadpis nad hranicí ~130 px pod horním okrajem
  // (výška sekundárního menu + nádech). Průchod je v pořadí dokumentu, takže
  // první nadpis pod hranicí průchod ukončí.
  useEffect(() => {
    if (items.length === 0) return

    const headingEls = items
      .map((item) => ({ id: item.id, el: document.getElementById(item.id) }))
      .filter((entry): entry is { id: string; el: HTMLElement } => entry.el !== null)
    if (headingEls.length === 0) return

    let ticking = false
    const measure = () => {
      ticking = false
      let current: string | null = null
      for (const { id, el } of headingEls) {
        if (el.getBoundingClientRect().top <= 130) current = id
        else break
      }
      setActiveId(current)
    }
    const onScroll = () => {
      if (!ticking) {
        ticking = true
        requestAnimationFrame(measure)
      }
    }

    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [items])

  // Když se aktivní položka změní, posuň panel tak, aby byla vidět — ale ne ve
  // chvíli, kdy je kurzor nad panelem (uživatel si v něm scrolluje sám a panel
  // mu nesmí ujíždět pod rukama).
  useEffect(() => {
    const container = containerRef.current
    if (!container || !activeId || container.matches(':hover')) return

    const link = container.querySelector<HTMLElement>(`a[href="#${CSS.escape(activeId)}"]`)
    if (!link) return

    // offsetTop odkazu je relativní k panelu (sticky = nejbližší positioned
    // předek). Posouváme jen vlastní posuvník panelu — scrollIntoView by mohl
    // hýbat i celou stránkou.
    const top = link.offsetTop
    const bottom = top + link.offsetHeight
    const viewTop = container.scrollTop
    const viewBottom = viewTop + container.clientHeight

    if (top < viewTop + 8) {
      container.scrollTo({ top: Math.max(0, top - 8), behavior: 'smooth' })
    } else if (bottom > viewBottom - 8) {
      container.scrollTo({ top: bottom - container.clientHeight + 8, behavior: 'smooth' })
    }
  }, [activeId])

  const itemClass = (level: number, active: boolean) => {
    const base =
      'block py-4 border-b border-[#e4e4e4] transition-colors duration-300 hover:text-black no-underline'
    if (practicalInfo && level === 2) {
      return `${base} font-bold ${active ? 'text-[#287bbb]' : 'text-[#004d94]'}`
    }
    const strong = level === (practicalInfo ? 3 : 2)
    const weight = strong ? 'font-semibold' : 'font-normal'
    const color = active ? 'text-[#287bbb]' : strong ? 'text-gray-800/85' : 'text-gray-800/65'
    return `${base} ${weight} ${color}`
  }

  return (
    <div
      ref={containerRef}
      className="hidden lg:block sticky top-5 max-h-[calc(100vh-40px)] overflow-y-auto overscroll-contain pr-2"
    >
      {items.length > 0 && (
        <nav aria-label="Obsah stránky">
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  aria-current={activeId === item.id ? 'true' : undefined}
                  className={itemClass(item.level, activeId === item.id)}
                >
                  {item.text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      {children}
    </div>
  )
}
