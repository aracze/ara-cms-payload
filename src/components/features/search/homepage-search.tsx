import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { ResultList } from './resultlist/resultlist'
import { SearchStatus } from './search-status'
import { useSearch } from './use-search'
import { SearchGraphic } from './search-graphic'

export function HomepageSearch() {
  const { query, setQuery, results, clearSearch, isLoading } = useSearch()
  const [isExpanded, setIsExpanded] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleClear = () => {
    clearSearch()
    setIsExpanded(false)
  }

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsExpanded(false)
      }
    }
    if (isExpanded) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isExpanded])

  return (
    <div ref={containerRef} className="w-full max-w-2xl relative">
      <div className="bg-white rounded-lg shadow-2xl flex items-center p-1 md:p-2 group/home-search border-2 border-transparent focus-within:border-[#215491]/20 transition-all">
        <div className="flex-1 px-4 flex items-center gap-3">
          <SearchGraphic className="w-5 h-5 text-gray-400" />
          <input
            aria-label="Hledat na webu"
            placeholder="Pojďme objevovat..."
            value={query}
            autoFocus={false}
            onChange={(e) => {
              setQuery(e.target.value)
              setIsExpanded(true)
            }}
            onFocus={() => setIsExpanded(true)}
            className="w-full bg-transparent border-none outline-none text-gray-800 font-medium py-2 placeholder:text-gray-400"
          />
          {query.length > 0 && (
            <button
              onClick={handleClear}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Vymazat hledání"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        <button
          onClick={() => setIsExpanded(true)}
          className="bg-[#215491] text-white px-6 md:px-10 py-3 rounded-md font-bold text-sm uppercase tracking-widest hover:bg-[#1a4579] transition-colors shrink-0"
        >
          Hledat
        </button>
      </div>

      {/* Inline results for homepage */}
      {isExpanded && query.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden z-[150] animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="max-h-[400px] overflow-y-auto p-4">
            <ResultList results={results} handleLinkClicked={() => setIsExpanded(false)} />
            <SearchStatus query={query} isLoading={isLoading} hasResults={results.length > 0} />
          </div>
        </div>
      )}
    </div>
  )
}
