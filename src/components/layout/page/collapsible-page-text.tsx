'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { UserAvatar } from '@/components/user-avatar'

function getPreviewHtml(html: string): {
  previewHtml: string
  shouldCollapse: boolean
} {
  const matches = [...html.matchAll(/<p\b[^>]*>[\s\S]*?<\/p>/gi)]
  if (matches.length <= 2) {
    return { previewHtml: html, shouldCollapse: false }
  }

  const secondParagraph = matches[1]
  const secondParagraphEnd = (secondParagraph.index ?? 0) + secondParagraph[0].length

  return {
    previewHtml: html.slice(0, secondParagraphEnd),
    shouldCollapse: true,
  }
}

type Contributor = {
  name?: string | null
  profileHref?: string | null
  avatarUrl?: string | null
}

export function CollapsiblePageTextWithContributor({
  textHtml,
  contributor,
  collapsible = true,
  proseClassName,
}: {
  /**
   * BEZPEČNOST: HTML se vkládá přes dangerouslySetInnerHTML. Volající MUSÍ předat
   * už sanitizovaný HTML (typicky z `richTextToHtml`, který volá DOMPurify).
   * Nikdy sem neposílej neošetřený vstup od uživatele.
   */
  textHtml: string
  contributor?: Contributor | null
  /** Sbalování textu + „zobrazit více" — jen na stránkách „Místo k navštívení". */
  collapsible?: boolean
  /** Extra třída prose boxu (např. `poi-prose` = omezená výška fotek u cílů). */
  proseClassName?: string
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const { previewHtml, shouldCollapse: canCollapse } = useMemo(
    () => getPreviewHtml(textHtml),
    [textHtml],
  )
  const shouldCollapse = collapsible && canCollapse
  const displayedHtml = !isExpanded && shouldCollapse ? previewHtml : textHtml

  return (
    <>
      <div
        className={cn('relative', !isExpanded && shouldCollapse && 'max-h-[250px] overflow-hidden')}
      >
        {/* prose třídy jsou přímo na boxu s textem, aby odstavce byly PŘÍMÝMI
            potomky .prose — jinak selže selektor `.prose > p:first-of-type`
            (úvodní lead odstavec). dangerouslySetInnerHTML nesmí být na stejném
            elementu jako sourozenecký JSX (bílý přechod níže), proto vlastní div. */}
        <div
          className={cn(
            'reading-prose prose max-w-[808px] prose-a:text-[#215491] prose-a:no-underline hover:prose-a:underline',
            proseClassName,
          )}
          dangerouslySetInnerHTML={{ __html: displayedHtml }}
        />
        {/* Text mizí do bílé — naznačuje, že pokračuje dál. */}
        {shouldCollapse && !isExpanded && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[50px] bg-gradient-to-b from-transparent to-white" />
        )}
      </div>

      {shouldCollapse && !isExpanded && (
        // Desktop: autor je vyjmutý z toku (absolutně vlevo), aby „zobrazit více"
        // bylo vycentrované na CELOU šířku (floatem by ho tlačítko — vlastní BFC —
        // neobtékalo a odsunulo se doprava). Mobil: skládáme pod sebe (autor nahoře,
        // tlačítko pod ním), jinak by úzký autor přes vycentrované tlačítko zasahoval.
        <div className="relative mt-[30px] flex w-full flex-col items-center gap-3 sm:min-h-[44px] sm:flex-row sm:justify-center sm:gap-0">
          {contributor?.name && (
            <div className="sm:absolute sm:left-0 sm:top-1/2 sm:-translate-y-1/2">
              <div className="flex items-start">
                <div className="mr-[15px] shrink-0">
                  {contributor.profileHref ? (
                    <Link href={contributor.profileHref} className="block">
                      <UserAvatar
                        name={contributor.name}
                        avatarUrl={contributor.avatarUrl}
                        size={40}
                      />
                    </Link>
                  ) : (
                    <UserAvatar
                      name={contributor.name}
                      avatarUrl={contributor.avatarUrl}
                      size={40}
                    />
                  )}
                </div>
                <div className="inline-block pt-[3px]">
                  <div className="block text-[12px] leading-[20.4px] text-[#565656]">
                    {contributor.profileHref ? (
                      <Link
                        href={contributor.profileHref}
                        className="font-semibold text-[#565656] no-underline hover:underline"
                      >
                        {contributor.name}
                      </Link>
                    ) : (
                      <span className="font-semibold">{contributor.name}</span>
                    )}
                  </div>
                  <div className="block text-[12px] leading-[20.4px] text-[#898e95]">
                    Cestovní průvodce
                  </div>
                </div>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            aria-expanded={isExpanded}
            className="block w-[130px] text-center text-[14px] font-bold leading-[19.5px] text-[#005580] hover:underline"
          >
            zobrazit více
            <svg
              aria-hidden="true"
              viewBox="0 0 10 6"
              className="ml-[6px] inline-block h-[10px] w-[10px] align-middle"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M1 1l4 4 4-4" />
            </svg>
          </button>
        </div>
      )}

      {(!shouldCollapse || isExpanded) && contributor?.name && (
        /* Matches legacy .contribution { margin-top: 30px } (default, non-placeToVisit) */
        <div className="mt-[30px]">
          <div className="flex items-center">
            <div className="mr-[15px] shrink-0">
              {contributor.profileHref ? (
                <Link href={contributor.profileHref}>
                  <UserAvatar name={contributor.name} avatarUrl={contributor.avatarUrl} size={40} />
                </Link>
              ) : (
                <UserAvatar name={contributor.name} avatarUrl={contributor.avatarUrl} size={40} />
              )}
            </div>
            <div className="inline-block pt-[3px]">
              <div className="block text-[12px] leading-[20.4px] text-[#565656]">
                {contributor.profileHref ? (
                  <Link
                    href={contributor.profileHref}
                    className="font-semibold text-[#565656] no-underline hover:underline"
                  >
                    {contributor.name}
                  </Link>
                ) : (
                  <span className="font-semibold">{contributor.name}</span>
                )}
              </div>
              <div className="block text-[12px] leading-[20.4px] text-[#898e95]">
                Cestovní průvodce
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
