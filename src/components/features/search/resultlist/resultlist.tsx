import { ThumbRow, thumbTitleClass } from '@/components/features/thumb-row'
import type { FuseResult } from 'fuse.js'
import type { SearchItem } from '@/types/search'
import { MapPin } from 'lucide-react'

// Štítek ukazujeme jen u informačních stránek (praktické informace, doprava…).
// Místa, cíle a města jsou z pohledu návštěvníka totéž — rozlišení kategorií
// je jen interní věc webu a štítek by ve výpisu působil chaoticky.
const PLACE_CATEGORIES = new Set(['Místo k navštívení', 'Turistický cíl'])

export function ResultList({
  results,
  handleLinkClicked,
  limit = 10,
}: {
  results: FuseResult<SearchItem>[]
  /** Volitelné: v našeptávači zavírá panel. Stránka /hledani ho nepotřebuje —
   *  bez něj je komponenta čistě serverová (žádný handler přes hranici RSC). */
  handleLinkClicked?: () => void
  /** Našeptávač ukazuje 10; stránka /hledani si řekne o víc. */
  limit?: number
}) {
  if (results.length === 0) return null

  return (
    <div className="flex flex-col divide-y divide-gray-100 animate-in fade-in slide-in-from-top-2 duration-300 pt-2">
      {results.slice(0, limit).map((result: FuseResult<SearchItem>, index: number) => {
        const item = result.item
        const showCategory = item.category && !PLACE_CATEGORIES.has(item.category)
        return (
          <ThumbRow
            // fullSlug mají jen stránky; ostatní položky (služby) padnou na
            // homepage místo neplatného odkazu.
            href={item.fullSlug || item.slug || '/'}
            key={item.documentId || `result-${index}`}
            onClick={handleLinkClicked ? () => handleLinkClicked() : undefined}
            src={item.image}
            hoverBg
            fallback={
              <MapPin
                className="w-5 h-5 text-[#1a3f6c]"
                fill="#1a3f6c"
                fillOpacity={0.1}
                strokeWidth={2.5}
              />
            }
          >
            <div className="flex items-center gap-2">
              <span className={`${thumbTitleClass()} truncate`}>{item.title}</span>
              {showCategory && (
                <span className="hidden md:inline-block shrink-0 text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-[#215491]/10 text-[#215491]">
                  {item.category}
                </span>
              )}
            </div>
            {(item.path || item.text) && (
              <p className="text-[13.5px] text-gray-400 truncate mt-0.5">
                {item.path && <span className="text-gray-500 font-medium">{item.path}</span>}
                {item.path && item.text && <span className="hidden md:inline"> — </span>}
                {item.text && <span className="hidden md:inline">{item.text}</span>}
              </p>
            )}
          </ThumbRow>
        )
      })}
    </div>
  )
}
