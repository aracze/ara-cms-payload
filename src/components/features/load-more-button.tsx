'use client'

import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Tlačítko „Zobrazit další…" — jeden vzor pro celý web (do 29. 8. 2026 tři
 * kopie pilulky + dva různé textové odkazy).
 *  · `pill` — samostatné pod velkými sekcemi (rubriky, články u míst, profil).
 *  · `text` — vložené do výpisu (recenze u cíle, „Co je nového"): 13 px
 *    polotučný modrý, při najetí světlejší modrá jako všechny odkazy webu
 *    (dřív u recenzí červená a u novinek podklad — sjednoceno na modrou,
 *    rozhodnutí uživatele 29. 8. 2026). Šipka je stejný chevron jako u pilulky,
 *    ne typografická „↓".
 * Počet zbývajících položek přidává volající do textu jen tam, kde je malý
 * a užitečný (recenze), ne u dlouhých proudů (novinky).
 */
type Variant = 'pill' | 'text'

// Obě podoby na jednom místě — tlačítko i šipka čtou stejný záznam, ať se
// při úpravě jedné varianty nezapomene na druhou půlku.
const VARIANT: Record<Variant, { button: string; icon: string }> = {
  pill: {
    button:
      'inline-flex items-center gap-2 rounded-full border-2 border-[#215491]/30 px-7 py-3 text-sm font-bold uppercase tracking-wider text-[#215491] font-heading transition-all hover:border-[#215491] hover:bg-[#215491] hover:text-white',
    icon: 'h-4 w-4',
  },
  text: {
    // py-2: dotyková plocha ≥ 24 px (WCAG 2.5.8) i u holého textu.
    button:
      'inline-flex items-center gap-1.5 py-2 text-[13px] font-semibold text-[#1a3f6c] transition-colors hover:text-[#215491] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#215491]/50 rounded',
    icon: 'h-3.5 w-3.5',
  },
}

export function LoadMoreButton({
  variant = 'pill',
  onClick,
  children,
  className,
}: {
  variant?: Variant
  onClick: () => void
  children: ReactNode
  className?: string
}) {
  const style = VARIANT[variant]
  return (
    <button type="button" onClick={onClick} className={cn(style.button, className)}>
      {children}
      <ChevronDown className={style.icon} strokeWidth={2.5} />
    </button>
  )
}
