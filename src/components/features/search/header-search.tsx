import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { Loader2, X } from 'lucide-react'
import { ResultList } from './resultlist/resultlist'
import { SearchStatus } from './search-status'
import { useSearch } from './use-search'
import { SearchGraphic } from './search-graphic'
import { HEADER_CONTAINER_CLASS } from '@/components/layout/header/container'

export function HeaderSearch() {
  const { query, setQuery, results, clearSearch, isLoading, hasError } = useSearch()
  const [isExpanded, setIsExpanded] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const handleClear = useCallback(() => {
    clearSearch()
    setIsExpanded(false)
  }, [clearSearch])

  // Enter = stránka všech výsledků (našeptávač ukazuje jen 10 nejlepších).
  const submitToSearchPage = () => {
    const trimmed = query.trim()
    if (!trimmed) return
    handleClear()
    router.push(`/hledani?q=${encodeURIComponent(trimmed)}`)
  }

  // Focus management
  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isExpanded])

  // Scroll lock
  useEffect(() => {
    if (isExpanded) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isExpanded])

  // Escape key to close
  useEffect(() => {
    const handleEscapeKeyup = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClear()
      }
    }
    document.addEventListener('keyup', handleEscapeKeyup)
    return () => {
      document.removeEventListener('keyup', handleEscapeKeyup)
    }
  }, [handleClear])

  return (
    <div className="flex items-center">
      <button
        type="button"
        onClick={() => setIsExpanded(true)}
        className="p-3 text-white/90 hover:text-white hover:bg-white/10 rounded-full transition-all duration-300"
        aria-label="Otevřít vyhledávání"
      >
        <SearchGraphic className="w-5 h-5" strokeWidth={3} />
      </button>

      {isExpanded &&
        createPortal(
          <div className="fixed inset-0 z-[300] animate-in fade-in duration-200">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClear} />
            <div className="relative bg-white shadow-2xl animate-in slide-in-from-top-4 duration-300">
              {/* h-[65px] = přesná výška hlavičky — panel ji při otevření nahradí
                  bez poskočení (hlavička má h-[65px] v header.tsx). Stejně tak
                  odsazení: HEADER_CONTAINER_CLASS drží lištu i výsledky
                  zarovnané s hlavičkou i v tabletovém pásmu (1024–1279 px). */}
              <div className={`${HEADER_CONTAINER_CLASS} h-[65px] flex items-center gap-4`}>
                {/* Lupa se během hledání točí — signál „pracuju" přímo v poli. */}
                {isLoading ? (
                  <Loader2
                    className="w-6 h-6 text-gray-400 shrink-0 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <SearchGraphic className="w-6 h-6 text-gray-400 shrink-0" strokeWidth={2.5} />
                )}
                <input
                  ref={inputRef}
                  aria-label="Hledat"
                  placeholder="Hledat..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitToSearchPage()
                  }}
                  className="flex-1 bg-transparent border-none outline-none text-xl font-normal text-gray-800 placeholder:text-gray-400 py-1"
                />
                <div className="hidden md:flex items-center gap-4 border-l border-gray-100 pl-6">
                  <button
                    type="button"
                    onClick={handleClear}
                    aria-label="Zavřít vyhledávání"
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-6 h-6" strokeWidth={2.5} />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleClear}
                  aria-label="Zavřít vyhledávání"
                  className="md:hidden p-2 text-gray-400"
                >
                  <X className="w-6 h-6" strokeWidth={2.5} />
                </button>
              </div>
              {(query.length > 0 || results.length > 0) && (
                <div className="border-t border-gray-100">
                  {/* Staré výsledky při načítání nového dotazu zůstávají, jen
                      ztlumené (stale-while-revalidate) — výpis nepoblikává. */}
                  <div
                    className={`${HEADER_CONTAINER_CLASS} pb-8 transition-opacity duration-200 ${
                      isLoading && results.length > 0 ? 'opacity-50' : ''
                    }`}
                  >
                    <ResultList results={results} handleLinkClicked={handleClear} />
                    <SearchStatus
                      query={query}
                      isLoading={isLoading}
                      hasResults={results.length > 0}
                      hasError={hasError}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
