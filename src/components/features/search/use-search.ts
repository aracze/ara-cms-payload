import { useState, useEffect } from 'react'
import type { FuseResult } from 'fuse.js'
import type { SearchItem } from '@/types/search'

export function useSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FuseResult<SearchItem>[]>([])
  // Dotaz, ke kterému patří aktuální `results` — dokud se liší od `query`,
  // hledání běží. Odvozený stav místo setLoading v efektu (cascading render).
  const [loadedQuery, setLoadedQuery] = useState('')

  useEffect(() => {
    // Zrušíme rozběhnutý požadavek při změně dotazu / odmountování — jinak by
    // opožděná (zastaralá) odpověď mohla přepsat výsledky novějšího dotazu.
    const controller = new AbortController()
    const fetchResults = async () => {
      if (query.length > 0) {
        try {
          const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
            signal: controller.signal,
          })
          const data = await res.json()
          // Neúspěšná odpověď (chyba, success:false, nečekaný tvar) nesmí nechat
          // viset staré výsledky — v takovém případě je vyprázdníme.
          if (res.ok && data.success && Array.isArray(data.message)) {
            setResults(data.message)
          } else {
            setResults([])
          }
        } catch (error) {
          // Po abortu stav vlastní novější dotaz — nic nepřepisovat.
          if ((error as Error)?.name === 'AbortError') return
          setResults([])
          console.error('Search fetch error:', error)
        }
        setLoadedQuery(query)
      } else {
        setResults([])
      }
    }

    const timer = setTimeout(fetchResults, 300)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  const clearSearch = () => {
    setQuery('')
    setResults([])
    setLoadedQuery('')
  }

  // Loading běží od prvního písmene (vč. debounce), ne až od odeslání
  // požadavku — jinak by UI prvních 300 ms vypadalo zaseknuté.
  const isLoading = query.length > 0 && query !== loadedQuery

  return { query, setQuery, results, setResults, clearSearch, isLoading }
}
