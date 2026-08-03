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
      {/* Pilulka s kulatým tlačítkem-lupou (schválený návrh „varianta 3C"). */}
      <div className="bg-white rounded-full shadow-xl flex items-center h-14 pl-6 pr-1.5 gap-3 border-2 border-transparent focus-within:border-[#215491]/20 transition-all">
        <SearchGraphic className="w-5 h-5 text-gray-400 shrink-0" />
        <input
          aria-label="Hledat na webu"
          placeholder="Najdi si svůj cíl — třeba Chorvatsko…"
          value={query}
          autoFocus={false}
          onChange={(e) => {
            setQuery(e.target.value)
            setIsExpanded(true)
          }}
          onFocus={() => setIsExpanded(true)}
          className="flex-1 min-w-0 bg-transparent border-none outline-none text-gray-800 font-medium placeholder:text-gray-400"
        />
        {query.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="text-gray-400 hover:text-gray-600 transition-colors shrink-0"
            aria-label="Vymazat hledání"
          >
            <X className="w-5 h-5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          aria-label="Hledat"
          className="w-11 h-11 rounded-full bg-[#215491] hover:bg-[#1a4579] flex items-center justify-center shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#215491]/50"
        >
          <SearchGraphic className="w-5 h-5 text-white" strokeWidth={2.5} />
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
