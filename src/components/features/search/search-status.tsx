import { Loader2 } from 'lucide-react'

// „Žádné výsledky" se smí ukázat až po DOKONČENÉM hledání — dřív se
// zobrazovalo už během čekání na odpověď a vyhledávání působilo zaseknuté.
// Selhání API má vlastní hlášku, aby výpadek nevypadal jako prázdný výsledek.
export function SearchStatus({
  query,
  isLoading,
  hasResults,
  hasError = false,
}: {
  query: string
  isLoading: boolean
  hasResults: boolean
  hasError?: boolean
}) {
  if (hasResults || query.length === 0) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="p-4 flex items-center justify-center gap-2 text-gray-400 text-sm"
    >
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          <span>Hledám…</span>
        </>
      ) : hasError ? (
        <span>Vyhledávání je teď nedostupné — zkuste to prosím za chvíli.</span>
      ) : (
        <span>Žádné výsledky pro &quot;{query}&quot;</span>
      )}
    </div>
  )
}
