'use client'

import { useEffect, useRef } from 'react'

// Same Google AdSense publisher/slots as the legacy site (article side ads).
// Overridable via env so units can be swapped without code changes.
const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT || 'ca-pub-6877162966881430'

const AD_VARIANTS = {
  // "Highlights 300x600" – top ad
  primary: {
    slot: process.env.NEXT_PUBLIC_ADSENSE_ARTICLE_SLOT || '8587359355',
    width: 300,
    height: 600,
  },
  // "Wide Skyscraper 160x600" – takes over in the lower half
  secondary: {
    slot: process.env.NEXT_PUBLIC_ADSENSE_ARTICLE_SLOT_2 || '4777192500',
    width: 160,
    height: 600,
  },
  // "Highlights 300x250" – menší box vedle recenzí (méně než 2 recenze)
  box: {
    slot: process.env.NEXT_PUBLIC_ADSENSE_REVIEWS_SLOT || '2488499643',
    width: 300,
    height: 250,
  },
} as const

/**
 * AdSense loader script. Render exactly ONCE per page (the article layout renders
 * several `ArticleAd` boxes, but the loader must be injected only once).
 *
 * Injected manually rather than via `next/script`: `next/script` stamps a
 * `data-nscript` attribute onto the tag, which AdSense rejects with a console
 * warning ("AdSense head tag doesn't support data-nscript attribute"). A plain
 * `<script async crossorigin>` matches Google's official snippet exactly. We inject
 * during idle time after the page is interactive to preserve the original
 * `strategy="lazyOnload"` behaviour (never render-blocking), and guard by element
 * id so it loads a single time.
 */
export function AdSenseScript() {
  useEffect(() => {
    const SCRIPT_ID = 'adsbygoogle-js'
    if (document.getElementById(SCRIPT_ID)) return

    const inject = () => {
      if (document.getElementById(SCRIPT_ID)) return
      const script = document.createElement('script')
      script.id = SCRIPT_ID
      script.async = true
      script.crossOrigin = 'anonymous'
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`
      document.head.appendChild(script)
    }

    // Load lazily, during browser idle time (mirrors next/script's `lazyOnload`).
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(inject)
      return () => window.cancelIdleCallback?.(handle)
    }
    const timeout = window.setTimeout(inject, 1)
    return () => window.clearTimeout(timeout)
  }, [])

  return null
}

// "Leaderboard responsive" – spodní pruh přes šířku obsahu (legacy bottomAds)
const LEADERBOARD_SLOT = process.env.NEXT_PUBLIC_ADSENSE_LEADERBOARD_SLOT || '1155633303'

/**
 * Responzivní reklamní pruh na spodku stránek (legacy `bottomAds` / slot
 * „Leaderboard responsive"). Výšku si určuje AdSense podle šířky; min-height
 * drží místo, ať se stránka neposkakuje. Vyžaduje `<AdSenseScript />`
 * vykreslený jednou kdekoliv na stránce.
 */
export function LeaderboardAd({ className = '' }: { className?: string }) {
  const pushedRef = useRef(false)

  useEffect(() => {
    if (pushedRef.current) return
    pushedRef.current = true
    try {
      const w = window as unknown as { adsbygoogle?: unknown[] }
      ;(w.adsbygoogle = w.adsbygoogle || []).push({})
    } catch {
      // AdSense nedostupný (např. blokovaný) — zůstane prázdný box.
    }
  }, [])

  return (
    <div className={`min-h-[120px] ${className}`}>
      <ins
        className="adsbygoogle block"
        style={{ display: 'block' }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={LEADERBOARD_SLOT}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  )
}

/**
 * Sticky side advertisement shown next to the article body.
 * Visuals mirror the legacy `.ad-article-along` box (light gray, rounded, sticky);
 * the ad creative itself rotates via AdSense.
 * Requires `<AdSenseScript />` to be rendered once elsewhere on the page.
 */
export function ArticleAd({
  variant = 'primary',
  className = '',
}: {
  variant?: keyof typeof AD_VARIANTS
  className?: string
}) {
  const { slot, width, height } = AD_VARIANTS[variant]
  const pushedRef = useRef(false)

  useEffect(() => {
    // Guard against React Strict Mode double-invocation (would log a duplicate-ad warning).
    if (pushedRef.current) return
    pushedRef.current = true
    try {
      const w = window as unknown as { adsbygoogle?: unknown[] }
      ;(w.adsbygoogle = w.adsbygoogle || []).push({})
    } catch {
      // AdSense not available (e.g. blocked) — leave the empty placeholder box.
    }
  }, [])

  return (
    <div className={`rounded-[15px] bg-[#f6f6f6] p-5 ${className}`}>
      <ins
        className="adsbygoogle mx-auto block"
        style={{ display: 'block', width, height }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slot}
      />
    </div>
  )
}
