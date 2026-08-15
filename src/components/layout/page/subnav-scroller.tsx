'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Posuvný kontejner sekundární navigace. Když se záložky nevejdou na displej
 * (mobil), posune po načtení aktivní položku do záběru — návštěvník tak vidí,
 * kde v menu je, a nakouslé položky po stranách napovídají, že jde posouvat.
 */
export function SubnavScroller({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  // Přechody mezi podstránkami běží po klientu a komponenta u nich zůstává
  // připojená — bez závislosti na cestě by se aktivní položka doprostřed
  // posunula jen při prvním načtení.
  const pathname = usePathname()

  useEffect(() => {
    const scroller = ref.current
    if (!scroller) return

    const centerActive = () => {
      if (scroller.scrollWidth <= scroller.clientWidth) return
      const active = scroller.querySelector('[aria-current]')
      if (!active) return
      const item = active.getBoundingClientRect()
      const box = scroller.getBoundingClientRect()
      // Vlastní výpočet místo scrollIntoView — ten by mohl hnout i svislým
      // scrollem stránky (např. po návratu zpět s obnovenou pozicí).
      scroller.scrollLeft += item.left - box.left - (box.width - item.width) / 2
    }

    centerActive()
    // Otočení telefonu mění šířku, a tím i to, které položky se vejdou.
    window.addEventListener('resize', centerActive)
    return () => window.removeEventListener('resize', centerActive)
  }, [pathname])

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
