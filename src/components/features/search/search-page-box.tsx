'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, X } from 'lucide-react'
import { SearchGraphic } from './search-graphic'

/**
 * Pole na stránce /hledani. Na rozdíl od našeptávače v hlavičce a na homepage
 * NEHLEDÁ při psaní — výsledky pod ním renderuje server a nový dotaz se spouští
 * Enterem nebo tlačítkem (navigací na /hledani?q=…). Panel s našeptáváním by tu
 * překážel: zdvojil by výpis, který je hned pod polem.
 *
 * Vzhled kopíruje pilulku z homepage ve variantě pro světlý podklad
 * (homepage-search.tsx) — má působit jako totéž pole, jen ukotvené na stránce.
 */
export function SearchPageBox({ initialQuery }: { initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery)
  const router = useRouter()
  // Navigace na server-renderovanou stránku chvíli trvá — točící se lupa
  // dává najevo „pracuju" stejně jako v našeptávači.
  const [isPending, startTransition] = useTransition()

  const submit = () => {
    const trimmed = query.trim()
    if (!trimmed || trimmed === initialQuery) return
    startTransition(() => {
      router.push(`/hledani?q=${encodeURIComponent(trimmed)}`)
    })
  }

  return (
    <div className="w-full max-w-2xl relative">
      <div className="bg-white rounded-full flex items-center h-14 pl-6 gap-3 border-2 border-[#d9dee3] shadow-[0_4px_12px_-4px_rgba(26,63,108,0.18)] pr-2 focus-within:border-[#215491]/20 transition-all">
        {isPending ? (
          <Loader2 className="w-5 h-5 text-gray-400 shrink-0 animate-spin" aria-hidden="true" />
        ) : (
          <SearchGraphic className="w-5 h-5 text-gray-400 shrink-0" />
        )}
        <input
          aria-label="Hledat na webu"
          placeholder="Najdi si svůj cíl — třeba Chorvatsko…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
          className="flex-1 min-w-0 bg-transparent border-none outline-none text-gray-800 font-medium placeholder:text-gray-400"
        />
        {query.length > 0 && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="text-gray-400 hover:text-gray-600 transition-colors shrink-0"
            aria-label="Vymazat hledání"
          >
            <X className="w-5 h-5" />
          </button>
        )}
        <button
          type="button"
          onClick={submit}
          aria-label="Hledat"
          className="rounded-full bg-[#215491] hover:bg-[#1a4579] flex items-center justify-center shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#215491]/50 w-10 h-10"
        >
          <SearchGraphic className="w-5 h-5 text-white" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  )
}
