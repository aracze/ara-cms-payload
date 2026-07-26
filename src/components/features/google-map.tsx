'use client'

import React, { useEffect, useRef, useCallback, useState } from 'react'

export interface MapMarker {
  id: string | number
  title: string
  fullSlug: string
  lat: number
  lng: number
  imageUrl?: string | null
}

interface GoogleMapProps {
  markers: MapMarker[]
  centerLat: number
  centerLng: number
  zoom: number
  /** Výška mapy (CSS hodnota). Bez zadání vysoká mapa vedle výpisu cílů. */
  height?: string
}

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''
// Map ID je nutné pro AdvancedMarkerElement (nový typ značky). Zapéká se do
// klientského bundlu při buildu (NEXT_PUBLIC_*). Když chybí, spadneme na klasický
// google.maps.Marker (viz initMap) — piny se vždy zobrazí.
const GOOGLE_MAPS_MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || ''
const MARKER_SIZE = 44

// Kruhová „avatarová" ikona markeru z Cloudinary (r_max = kruh, bo_3px = bílý rámeček).
// Pro ne-Cloudinary URL vrací originál (kruh/rámeček pak doplní CSS u obsahu markeru).
function buildMarkerIconUrl(url: string): string {
  return url.includes('cloudinary.com')
    ? url.replace('/upload/', '/upload/w_44,h_44,c_fill,g_auto,r_max,bo_3px_solid_white,f_png/')
    : url
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function toCloudinaryVariant(url: string, transform: string): string {
  return url.includes('cloudinary.com') ? url.replace('/upload/', `/upload/${transform}/`) : url
}

// Obsah info okna se skládá jako HTML řetězec a předává do setContent, takže
// KAŽDÁ hodnota v atributu (href, src) musí být ověřená + escapovaná — jinak by
// šlo přes fullSlug/imageUrl vloženého markeru vypadnout z atributu (XSS).

// href míří na interní stránku: musí začínat '/' a neobsahovat whitespace,
// uvozovky ani lomené závorky (blokuje javascript:, data: i únik z atributu).
function toSafeInternalHref(slug: string | null | undefined): string {
  if (!slug || typeof slug !== 'string') return '#'
  const normalized = slug.startsWith('/') ? slug : `/${slug}`
  return /^\/[^\s"'<>]*$/.test(normalized) ? normalized : '#'
}

// Do <img src> pustíme jen absolutní http(s) URL (Cloudinary / vlastní CDN).
function toSafeImageUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null
  return /^https?:\/\//i.test(url.trim()) ? url : null
}

function buildInfoWindowContent(marker: MapMarker): string {
  const safeTitle = escapeHtml(marker.title)
  const safeLink = escapeHtml(toSafeInternalHref(marker.fullSlug))

  const validImageUrl = toSafeImageUrl(marker.imageUrl)
  const image = validImageUrl
    ? `<img
         src="${escapeHtml(toCloudinaryVariant(validImageUrl, 'w_220,h_126,c_fill,g_auto,f_auto,q_auto'))}"
         alt="${safeTitle}"
         style="display:block;width:100%;height:126px;object-fit:cover;"
       />`
    : `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:126px;background:linear-gradient(135deg,#d9e6f5,#f2f7fd);color:#6f89aa;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">Bez náhledu</div>`

  return `<div style="width:220px;">
    <a href="${safeLink}" style="text-decoration:none;color:inherit;display:block;">
      <div style="overflow:hidden;border-radius:12px;background:#fff;">
        <div style="position:relative;">${image}
          <span style="position:absolute;left:8px;top:8px;background:rgba(26,63,108,.88);color:#fff;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:700;letter-spacing:.03em;">Místo</span>
        </div>
        <div style="padding:10px 12px 10px;font-family:'Open Sans',Arial,sans-serif;">
          <div style="color:#1a3f6c;font-size:15px;line-height:1.25;font-weight:800;margin:0 0 6px;">${safeTitle}</div>
          <div style="display:inline-flex;align-items:center;gap:5px;color:#1a3f6c;font-size:11px;font-weight:700;">
            Zobrazit detail <span aria-hidden="true">→</span>
          </div>
        </div>
      </div>
    </a>
  </div>`
}

// Minimální typování `window.google.maps` pro bootstrap/loader (bez @types/google.maps).
// Index signatura pokrývá dynamický `callback` klíč, který si Google na `maps` zapisuje.
interface GoogleMapsApi {
  importLibrary?: (name: string) => Promise<Record<string, unknown>>
  [key: string]: unknown
}
interface WindowWithGoogle extends Window {
  google?: { maps?: GoogleMapsApi }
}
const getWindowWithGoogle = (): WindowWithGoogle => window as WindowWithGoogle

// Jednorázový (singleton) loader Maps JS API. Skript se vloží do stránky nejvýš
// jednou a případné další mounty (včetně React StrictMode double-mountu ve vývoji)
// čekají na tentýž Promise — tím odpadá souběh, kdy „vyhrála" odmountovaná closure
// a mapa se nikdy nevykreslila.
let mapsReadyPromise: Promise<void> | null = null

// Nainstaluje oficiální Google „bootstrap loader": definuje `google.maps.importLibrary`
// SYNCHRONNĚ jako stub, který si sám (jednou) dotáhne skript API přes `callback`.
// Prosté `<script src=…loading=async>` + čekání na `load` totiž nezaručuje, že už je
// `importLibrary` k dispozici (proto se mapa občas vůbec nenačetla).
function installMapsBootstrap(key: string): void {
  const win = getWindowWithGoogle()
  const google = win.google ?? {}
  win.google = google
  const maps: GoogleMapsApi = google.maps ?? {}
  google.maps = maps
  if (maps.importLibrary) return

  const requested = new Set<string>()
  const CALLBACK = '__ib__'
  let scriptLoad: Promise<void> | null = null

  const ensureScript = () =>
    (scriptLoad ??= new Promise<void>((resolve, reject) => {
      // Sestavení URL odložíme o mikrotask, aby se do jednoho requestu stihly
      // zaregistrovat všechny synchronně požadované knihovny (maps + marker).
      Promise.resolve().then(() => {
        const params = new URLSearchParams({
          key,
          v: 'weekly',
          libraries: [...requested].join(','),
          callback: `google.maps.${CALLBACK}`,
          loading: 'async',
        })
        maps[CALLBACK] = resolve
        const script = document.createElement('script')
        script.src = `https://maps.googleapis.com/maps/api/js?${params}`
        script.nonce = document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce ?? ''
        script.onerror = () => {
          // Vynulujeme cache i vložený tag, ať `ensureScript()` při dalším pokusu
          // (po resetu mapsReadyPromise) skript znovu vloží a recovery projde.
          scriptLoad = null
          script.remove()
          reject(new Error('Google Maps script se nepodařilo načíst'))
        }
        document.head.append(script)
      })
    }))

  // Po načtení API stub přepíše sám Google skutečnou implementací → `then` níže
  // pak volá tu pravou `importLibrary`.
  maps.importLibrary = (name: string) => {
    requested.add(name)
    // Po načtení API Google přepíše `maps.importLibrary` skutečnou implementací.
    return ensureScript().then(() => maps.importLibrary!(name))
  }
}

function loadGoogleMaps(): Promise<void> {
  if (mapsReadyPromise) return mapsReadyPromise

  mapsReadyPromise = (async () => {
    if (!getWindowWithGoogle().google?.maps?.importLibrary) {
      if (!GOOGLE_MAPS_API_KEY) {
        throw new Error('Google Maps API key is not set')
      }
      installMapsBootstrap(GOOGLE_MAPS_API_KEY)
    }
    // S `loading=async` je nutné knihovny doimportovat, teprve pak jsou
    // google.maps.Map / Marker / enumy (MapTypeControlStyle…) k dispozici.
    const maps = getWindowWithGoogle().google?.maps
    if (!maps?.importLibrary) {
      throw new Error('Google Maps: importLibrary není k dispozici')
    }
    await Promise.all([maps.importLibrary('maps'), maps.importLibrary('marker')])
  })()

  // Po chybě umožníme příští pokus (transientní výpadek sítě apod.).
  mapsReadyPromise.catch(() => {
    mapsReadyPromise = null
  })

  return mapsReadyPromise
}

export const GoogleMap: React.FC<GoogleMapProps> = ({
  markers,
  centerLat,
  centerLng,
  zoom,
  height,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  // gmp-click je nativní DOM listener na AdvancedMarkerElement —
  // clearInstanceListeners ho neodstraní, uklízíme ho sami při odmountu.
  const advancedClickHandlersRef = useRef<Array<{ marker: any; fn: () => void }>>([])
  const infoWindowRef = useRef<any>(null)
  const [inView, setInView] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const initMap = useCallback(() => {
    if (!mapRef.current || mapInstanceRef.current) return
    const googleApi = (window as { google?: any }).google
    if (!googleApi?.maps) return

    const map = new googleApi.maps.Map(mapRef.current, {
      zoom,
      center: { lat: centerLat, lng: centerLng },
      // Map ID aktivuje cloud-based styling a hlavně AdvancedMarkerElement.
      mapId: GOOGLE_MAPS_MAP_ID || undefined,
      mapTypeControl: true,
      mapTypeControlOptions: {
        style: googleApi.maps.MapTypeControlStyle.HORIZONTAL_BAR,
        position: googleApi.maps.ControlPosition.TOP_LEFT,
      },
      fullscreenControl: true,
      streetViewControl: false,
    })
    mapInstanceRef.current = map

    const infoWindow = new googleApi.maps.InfoWindow({ maxWidth: 224 })
    infoWindowRef.current = infoWindow

    // Inject CSS to override Google Maps InfoWindow defaults (inline styles can't beat GM's specificity)
    if (!document.getElementById('gm-iw-overrides')) {
      const style = document.createElement('style')
      style.id = 'gm-iw-overrides'
      style.textContent = `
        .gm-style-iw-c { padding: 0 !important; box-shadow: 0 10px 28px rgba(20,43,74,.22) !important; border-radius: 12px !important; border: none !important; }
        .gm-style-iw-d { overflow: hidden !important; padding: 0 !important; max-height: none !important; }
        .gm-style-iw   { padding: 0 !important; overflow: visible !important; }
        .gm-style-iw-tc::after { background: #fff !important; }
        .gm-style-iw-chr {
          position: absolute !important;
          top: 8px !important;
          right: 8px !important;
          height: auto !important;
          width: auto !important;
          z-index: 10 !important;
          background: transparent !important;
          padding: 0 !important;
          margin: 0 !important;
          line-height: 0 !important;
        }
        .gm-ui-hover-effect {
          top: 0 !important; right: 0 !important;
          width: 34px !important; height: 34px !important;
          padding: 0 !important;
          margin: 0 !important;
          background: rgba(0,0,0,0.5) !important;
          border-radius: 50% !important;
          opacity: 1 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          box-sizing: border-box !important;
          overflow: hidden !important;
        }
        .gm-ui-hover-effect:hover {
          background: rgba(0,0,0,0.7) !important;
        }
        .gm-ui-hover-effect span {
          filter: invert(1) !important;
          margin: 0 !important;
          width: 16px !important;
          height: 16px !important;
          display: block !important;
          position: static !important;
          transform: none !important;
        }
        .gm-ui-hover-effect img {
          filter: invert(1) !important;
          margin: 0 !important;
          width: 16px !important;
          height: 16px !important;
          display: block !important;
        }
      `
      document.head.appendChild(style)
    }

    googleApi.maps.event.addListener(infoWindow, 'domready', () => {
      // Apply box-shadow on the container directly (can't be done via injected CSS easily)
      const iwContainer = document.querySelector('.gm-style-iw-c') as HTMLElement | null
      if (iwContainer) {
        iwContainer.style.boxShadow = '0 10px 28px rgba(20,43,74,.25)'
      }
    })

    map.addListener('click', () => {
      infoWindow.close()
    })

    // AdvancedMarkerElement (nový, doporučený typ značky) funguje jen na mapě
    // s Map ID. Když Map ID chybí (build bez GitHub Variable), spadneme na
    // klasický google.maps.Marker — deprecation warning je menší zlo než zmizelé
    // piny. `marker` knihovnu importuje loadGoogleMaps() vždy.
    const AdvancedMarkerElement = googleApi.maps.marker?.AdvancedMarkerElement
    const useAdvancedMarkers = Boolean(GOOGLE_MAPS_MAP_ID && AdvancedMarkerElement)

    // #8: Markery se staví JEN tady, v initMap, který kvůli guardu
    // `mapInstanceRef.current` proběhne na jeden mount právě jednou. To je dnes
    // v pořádku: `markers`/`centerLat`/`centerLng`/`zoom` počítá server z dat
    // stránky (viz places-to-visit.tsx) a nic je za běhu nemění — stránka je
    // force-dynamic, takže při každé navigaci se komponenta mountuje znovu
    // (= „přemountování to řeší"). POZOR do budoucna: kdyby někdo přidal na mapu
    // KLIENTSKÝ filtr/přepínač, který mění `markers` (nebo střed/zoom) BEZ
    // přemountu, tyhle piny by se neaktualizovaly a hover efekt níže (závislý na
    // `markers`) by mířil na staré instance. Pak je nutné stavbu markerů
    // vytáhnout do samostatného efektu nad `[loaded, markers]`, který nejdřív
    // uklidí `markersRef` (clearInstanceListeners + odpojení z mapy) a teprve pak
    // je postaví znovu.
    for (const m of markers) {
      let marker: any

      if (useAdvancedMarkers) {
        const advancedOptions: any = {
          position: { lat: m.lat, lng: m.lng },
          map,
          title: m.title,
          gmpClickable: true, // bez toho AdvancedMarkerElement neemituje 'click'
        }
        // Kruhová obrázková ikona jako HTML obsah (AdvancedMarker používá `content`,
        // ne `icon`). Výchozí ukotvení obsahu = dolní střed, stejně jako u klasické
        // ikony → vizuální parita zůstává zachovaná.
        if (m.imageUrl) {
          const img = document.createElement('img')
          img.src = buildMarkerIconUrl(m.imageUrl)
          img.width = MARKER_SIZE
          img.height = MARKER_SIZE
          img.alt = m.title
          img.style.cssText = 'display:block;width:44px;height:44px;object-fit:cover;'
          if (!m.imageUrl.includes('cloudinary.com')) {
            img.style.borderRadius = '50%'
            img.style.border = '3px solid #fff'
          }
          advancedOptions.content = img
        }
        marker = new AdvancedMarkerElement(advancedOptions)
      } else {
        const markerOptions: any = {
          position: { lat: m.lat, lng: m.lng },
          map,
          title: m.title,
        }
        // Use circular image icon if available
        if (m.imageUrl) {
          markerOptions.icon = {
            url: buildMarkerIconUrl(m.imageUrl),
            scaledSize: new googleApi.maps.Size(MARKER_SIZE, MARKER_SIZE),
          }
        }
        marker = new googleApi.maps.Marker(markerOptions)
      }

      // AdvancedMarkerElement má vlastní událost `gmp-click` — obyčejný
      // 'click' na něm funguje, ale Maps API kvůli němu hlásí deprecation
      // warning do konzole. Klasický Marker zůstává u 'click'.
      const openInfoWindow = () => {
        const content = buildInfoWindowContent(m)
        infoWindow.setContent(content)
        // Objektová forma open() funguje pro Marker i AdvancedMarkerElement.
        infoWindow.open({ anchor: marker, map })
      }
      if (useAdvancedMarkers) {
        marker.addEventListener('gmp-click', openInfoWindow)
        advancedClickHandlersRef.current.push({ marker, fn: openInfoWindow })
      } else {
        marker.addListener('click', openInfoWindow)
      }

      markersRef.current.push(marker)
    }
  }, [markers, centerLat, centerLng, zoom])

  // Google Maps SDK (stovky kB) natáhneme až když se kontejner mapy přiblíží
  // viewportu. Na stránkách, kde je mapa pod přehybem, se tak SDK ani skript
  // nestahuje hned při načtení stránky (šetří přenos i hlavní vlákno). Kde
  // IntersectionObserver není (starší prohlížeč), načteme rovnou.
  useEffect(() => {
    if (inView) return
    const el = containerRef.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true)
          observer.disconnect()
        }
      },
      // Předtáhneme kousek před viewport, ať je mapa hotová dřív, než k ní uživatel dojede.
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [inView])

  useEffect(() => {
    if (!inView) return
    let cancelled = false
    loadGoogleMaps()
      .then(() => {
        if (!cancelled) {
          setLoadError(null)
          setLoaded(true)
        }
      })
      .catch((err) => {
        const message = typeof err?.message === 'string' ? err.message : 'Mapu se nepodařilo načíst'
        if (!cancelled) {
          setLoadError(message)
          setLoaded(false)
        }
        console.warn('[GoogleMap] load error:', message)
      })
    return () => {
      cancelled = true
    }
  }, [inView])

  useEffect(() => {
    if (loaded) {
      initMap()
    }
  }, [loaded, initMap])

  // Add hover events for poi-article elements
  useEffect(() => {
    if (!loaded || markersRef.current.length === 0) return

    const articles = document.querySelectorAll('[data-poiid]')
    const markerMap = new Map<string, any>()
    const markerDataMap = new Map<string, MapMarker>()

    markers.forEach((m, i) => {
      markerMap.set(String(m.id), markersRef.current[i])
      markerDataMap.set(String(m.id), m)
    })

    const handlers: Array<{
      el: Element
      type: string
      fn: EventListener
    }> = []

    articles.forEach((article) => {
      const poiId = (article as HTMLElement).dataset.poiid
      if (!poiId) return
      const marker = markerMap.get(poiId)
      const data = markerDataMap.get(poiId)
      if (!marker || !data) return

      const handleMouseOver = () => {
        const content = buildInfoWindowContent(data)
        infoWindowRef.current?.setContent(content)
        infoWindowRef.current?.open({ anchor: marker, map: mapInstanceRef.current! })
      }
      const handleMouseOut = () => {
        infoWindowRef.current?.close()
      }

      article.addEventListener('mouseover', handleMouseOver)
      article.addEventListener('mouseout', handleMouseOut)
      handlers.push(
        { el: article, type: 'mouseover', fn: handleMouseOver },
        { el: article, type: 'mouseout', fn: handleMouseOut },
      )
    })

    return () => {
      handlers.forEach(({ el, type, fn }) => el.removeEventListener(type, fn))
    }
  }, [loaded, markers])

  // Úklid při odmountu (např. při navigaci na jinou stránku): Google si drží
  // interní listenery na mapě, markerech i info-okně. Bez explicitního zrušení
  // zůstanou viset → únik paměti při každém průchodu stránkou s mapou.
  useEffect(() => {
    return () => {
      const ev = (getWindowWithGoogle().google?.maps as any)?.event
      if (ev) {
        markersRef.current.forEach((marker) => ev.clearInstanceListeners(marker))
        if (mapInstanceRef.current) ev.clearInstanceListeners(mapInstanceRef.current)
        if (infoWindowRef.current) ev.clearInstanceListeners(infoWindowRef.current)
      }
      // Nativní gmp-click listenery advanced markerů (mimo dosah
      // clearInstanceListeners) odregistrujeme ručně.
      advancedClickHandlersRef.current.forEach(({ marker, fn }) => {
        if (marker && typeof marker.removeEventListener === 'function') {
          marker.removeEventListener('gmp-click', fn)
        }
      })
      advancedClickHandlersRef.current = []
      // Odpojíme markery od mapy (AdvancedMarkerElement přes `map`, klasický `setMap`).
      markersRef.current.forEach((marker) => {
        if (marker && typeof marker.setMap === 'function') marker.setMap(null)
        else if (marker) marker.map = null
      })
      markersRef.current = []
      infoWindowRef.current?.close?.()
      mapInstanceRef.current = null
    }
  }, [])

  // Vnější kontejner je vždy v DOM (i před načtením) se stejnými rozměry —
  // IntersectionObserver má co pozorovat a nevzniká CLS při dokreslení mapy.
  return (
    <div
      ref={containerRef}
      className="w-full rounded-lg"
      style={height ? { height } : { height: 'calc(100vh - 40px)', minHeight: '400px' }}
    >
      {loadError ? (
        <div className="h-full w-full rounded-lg border border-[#e4e4e4] bg-[#f8fafc] p-6 text-center text-sm text-[#4f5f74]">
          <p className="font-semibold text-[#1a3f6c] mb-2">Mapa není dostupná</p>
          <p>{loadError}</p>
        </div>
      ) : !loaded ? (
        <div className="h-full w-full rounded-lg border border-[#e4e4e4] bg-[#f8fafc] p-6 text-center text-sm text-[#4f5f74]">
          <p className="font-semibold text-[#1a3f6c]">Načítám mapu…</p>
        </div>
      ) : (
        <div ref={mapRef} className="h-full w-full rounded-lg" />
      )}
    </div>
  )
}
