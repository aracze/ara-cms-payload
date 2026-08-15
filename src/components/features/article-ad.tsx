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

const SCRIPT_ID = 'adsbygoogle-js'

/**
 * Vloží AdSense tag do stránky. Idempotentní — volá se z každého reklamního
 * boxu, ale skript se přidá jen jednou.
 *
 * Vkládáme ho ručně, ne přes `next/script`: ten na tag razítkuje atribut
 * `data-nscript`, který AdSense odmítá varováním v konzoli. Prosté
 * `<script async crossorigin>` přesně odpovídá oficiálnímu úryvku od Googlu.
 */
function ensureAdSenseScript() {
  if (document.getElementById(SCRIPT_ID)) return
  const script = document.createElement('script')
  script.id = SCRIPT_ID
  script.async = true
  script.crossOrigin = 'anonymous'
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`
  document.head.appendChild(script)
}

/**
 * Načte AdSense a vyžádá inzerát, teprve až se box blíží k obrazovce.
 *
 * PROČ: skript Googlu je zdaleka nejtěžší věc na stránce — sám o sobě zabere
 * hlavní vlákno na stovky milisekund a kazí tím INP (odezvu na ťuknutí), což
 * hlásí i Search Console. Dřív se vkládal hned po načtení stránky, tedy přesně
 * v okamžiku, kdy člověk začíná klikat.
 *
 * Jedno pravidlo stačí na všechna zařízení: na desktopu jsou postranní reklamy
 * hned vedle textu, takže se načtou prakticky okamžitě jako dřív; na mobilu je
 * jediná reklama až pod obsahem, takže se načte, až k ní čtenář dojede — nebo
 * vůbec, pokud tak daleko nedoroluje.
 *
 * Skryté boxy (`hidden lg:block` u postranních reklam) se nenačtou vůbec:
 * prvek s `display: none` nemá plochu, takže se s obrazovkou nikdy neprotne.
 * Odpadá tím i marné dožadování inzerátu do nulově široké schránky.
 *
 * Pozor na souvislost: lištu souhlasu (Funding Choices) stahuje právě AdSense
 * tag, takže se objeví až spolu s reklamou. To je záměr — bez reklamy se do
 * prohlížeče nic neukládá, takže není nač se ptát. Viz `analytics.tsx`.
 */
function useLazyAd(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const box = ref.current
    if (!box) return

    let done = false
    const load = () => {
      if (done) return
      done = true
      ensureAdSenseScript()
      try {
        const w = window as unknown as { adsbygoogle?: unknown[] }
        ;(w.adsbygoogle = w.adsbygoogle || []).push({})
      } catch {
        // AdSense nedostupný (např. blokovaný) — zůstane prázdný box.
      }
    }

    // Bez podpory IntersectionObserver (staré prohlížeče) se chováme jako dřív.
    if (typeof IntersectionObserver !== 'function') {
      load()
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        observer.disconnect()
        load()
      },
      // Zhruba jedna obrazovka dopředu, ať je inzerát vykreslený dřív, než na
      // něj čtenář dojede (Google lazy-loading sám doporučuje).
      { rootMargin: '100% 0px' },
    )
    observer.observe(box)
    return () => observer.disconnect()
  }, [ref])
}

// "Leaderboard responsive" – spodní pruh přes šířku obsahu (legacy bottomAds)
const LEADERBOARD_SLOT = process.env.NEXT_PUBLIC_ADSENSE_LEADERBOARD_SLOT || '1155633303'

/**
 * Responzivní reklamní pruh na spodku stránek (legacy `bottomAds` / slot
 * „Leaderboard responsive"). Výšku si určuje AdSense podle šířky; min-height
 * drží místo, ať se stránka neposkakuje. Inzerát si vyžádá sám, až se blíží
 * k obrazovce (viz `useLazyAd`).
 */
export function LeaderboardAd({ className = '' }: { className?: string }) {
  const boxRef = useRef<HTMLDivElement>(null)
  useLazyAd(boxRef)

  return (
    <div ref={boxRef} className={`min-h-[120px] ${className}`}>
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
 *
 * Na mobilu bývá tenhle box v `<aside class="hidden lg:block">` — skrytý prvek
 * nemá plochu, takže se s obrazovkou nikdy neprotne a inzerát se pro něj vůbec
 * nevyžádá (viz `useLazyAd`).
 */
export function ArticleAd({
  variant = 'primary',
  className = '',
}: {
  variant?: keyof typeof AD_VARIANTS
  className?: string
}) {
  const { slot, width, height } = AD_VARIANTS[variant]
  const boxRef = useRef<HTMLDivElement>(null)
  useLazyAd(boxRef)

  return (
    <div ref={boxRef} className={`rounded-[15px] bg-[#f6f6f6] p-5 ${className}`}>
      <ins
        className="adsbygoogle mx-auto block"
        style={{ display: 'block', width, height }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slot}
      />
    </div>
  )
}
