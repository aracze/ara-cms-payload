'use client'

import React, { useEffect, useRef, useState } from 'react'
import { preconnect } from 'react-dom'
import DOMPurify from 'isomorphic-dompurify'
import { fromMediaProxy, toMediaProxy } from '@/lib/cloudinary-loader'
import 'maplibre-gl/dist/maplibre-gl.css'

/**
 * Mapa webu: OpenStreetMap data přes MapLibre GL + dlaždice OpenFreeMap
 * (zdarma, bez klíče a bez limitů) ve vlastním barevném stylu — generuje ho
 * scripts/build-map-style.mjs do public/map-styles/aracze.json.
 *
 * Nahradila GoogleMap (8/2026, kvóty a ceník Google Maps) — rozhraní vč.
 * markerů s fotkami, kartičky místa a fitBounds zůstalo stejné. Zoom se
 * převádí: Google počítá dlaždice 256 px, MapLibre 512 px → stejný výřez =
 * Google zoom − 1 (CMS ukládá zoom v Google škále).
 */

export interface MapMarker {
  id: string | number
  title: string
  fullSlug: string
  lat: number
  lng: number
  imageUrl?: string | null
}

interface MapLibreMapProps {
  markers: MapMarker[]
  centerLat: number
  centerLng: number
  /** Zoom v Google škále (jak ho ukládá CMS) — převod na MapLibre řeší komponenta. */
  zoom: number
  /** Výška mapy (CSS hodnota). Bez zadání vysoká mapa vedle výpisu cílů. */
  height?: string
  /**
   * Dorámovat výřez na všechny piny (fitBounds) — `centerLat`/`centerLng`/`zoom`
   * pak slouží jen jako výchozí stav. Používá profil autora i výpisy míst;
   * mapa s jediným pinem (karta cíle) zůstává na středu/zoomu z CMS.
   */
  fitToMarkers?: boolean
  /**
   * Odsazení výřezu při fitBounds v pixelech — když přes roh mapy leží karta
   * (podstránka Ubytování), piny se dorámují do zbylé plochy. Použije se jen
   * když je mapa dost široká (odsazení + ~240 px na piny), na užší mapě zůstává
   * výchozí odsazení. Předávej STABILNÍ referenci (konstantu modulu), jinak se
   * mapa při každém renderu bourá a staví znovu.
   */
  fitPadding?: FitPadding
}

export interface FitPadding {
  top: number
  right: number
  bottom: number
  left: number
}

const DEFAULT_FIT_PADDING: FitPadding = { top: 56, right: 40, bottom: 24, left: 40 }

const STYLE_URL = '/map-styles/aracze.json'
const MARKER_SIZE = 44
/** Strop přiblížení při fitBounds — v MapLibre škále (Google 12 ≈ MapLibre 11). */
const MAX_FIT_ZOOM = 11

// Kontrola HOSTITELE, ne podřetězce (CodeQL: „cloudinary.com" může být kdekoliv
// v cizí URL — https://cloudinary.com.utocnik.cz by prošla a dostala transformace).
function isCloudinaryHost(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return host === 'cloudinary.com' || host.endsWith('.cloudinary.com')
  } catch {
    return false
  }
}

// Kruhová „avatarová" ikona markeru z Cloudinary (r_max = kruh, bo_3px = bílý
// rámeček). Pro ne-Cloudinary URL vrací originál (kruh/rámeček doplní CSS).
// Data z CMS nesou adresy už na media proxy → fromMediaProxy je normalizuje
// na Cloudinary podobu pro host check, toMediaProxy až PO složení transformace.
function buildMarkerIconUrl(rawUrl: string): string {
  const url = fromMediaProxy(rawUrl)
  return isCloudinaryHost(url)
    ? toMediaProxy(
        url.replace('/upload/', '/upload/w_44,h_44,c_fill,g_auto,r_max,bo_3px_solid_white,f_png/'),
      )
    : rawUrl
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function toCloudinaryVariant(rawUrl: string, transform: string): string {
  const url = fromMediaProxy(rawUrl)
  return isCloudinaryHost(url)
    ? toMediaProxy(url.replace('/upload/', `/upload/${transform}/`))
    : rawUrl
}

// Obsah kartičky místa se skládá jako HTML řetězec a předává do setHTML, takže
// KAŽDÁ hodnota v atributu (href, src) musí být ověřená + escapovaná — jinak by
// šlo přes fullSlug/imageUrl vloženého markeru vypadnout z atributu (XSS).
// Výsledek navíc prochází DOMPurify (projektové pravidlo pro HTML sink) —
// strukturální pojistka pro budoucí úpravy šablony, ne náhrada escapování.

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

export const MapLibreMap: React.FC<MapLibreMapProps> = ({
  markers,
  centerLat,
  centerLng,
  zoom,
  height,
  fitToMarkers = false,
  fitPadding,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<HTMLDivElement>(null)
  // maplibre Map instance — typ až po dynamickém importu, proto jen remove().
  const mapInstanceRef = useRef<{ remove: () => void } | null>(null)
  const [inView, setInView] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Spojení na server dlaždic se naváže hned při renderu stránky s mapou —
  // než k mapě uživatel doscrolluje, TLS handshake už je hotový.
  preconnect('https://tiles.openfreemap.org', { crossOrigin: 'anonymous' })

  // Mapa se bourá a staví jen při skutečné změně pinů: rodičovské server
  // komponenty posílají při každém re-renderu NOVÉ pole se stejným obsahem
  // a s identitou pole v závislostech efektu by se mapa zbytečně přestavěla
  // (probliknutí). Proto se identita stabilizuje přes obsahový klíč.
  const markersKey = JSON.stringify(
    markers.map((m) => [m.id, m.lat, m.lng, m.title, m.fullSlug, m.imageUrl ?? null]),
  )
  // eslint-disable-next-line react-hooks/exhaustive-deps -- markersKey zastupuje obsah markers
  const stableMarkers = React.useMemo(() => markers, [markersKey])

  // Mapová knihovna (~250 kB) se stahuje až když se mapa blíží viewportu —
  // na stránkách s mapou pod přehybem se hned při načtení nestahuje nic.
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
    if (!inView || !mapRef.current || mapInstanceRef.current) return
    let cancelled = false
    // Hover z výpisu míst/cílů (`[data-poiid]`) otevírá kartičku přímo na mapě
    // (parita s předchozí Google verzí). Plní se uvnitř async bloku níž,
    // uklízí se v cleanupu efektu.
    const hoverHandlers: Array<{ el: Element; type: string; fn: EventListener }> = []

    const currentMarkers = stableMarkers

    // Selhání startu mapy: kromě chybové UI i zrušit instanci — jinak by po
    // přepnutí render větve na chybu zůstal viset WebGL kontext a worker.
    const failMap = (message: string) => {
      if (cancelled) return
      setLoadError(message)
      setLoaded(false)
      const instance = mapInstanceRef.current
      mapInstanceRef.current = null
      // remove() až mimo právě běžící event handler mapy.
      if (instance) queueMicrotask(() => instance.remove())
    }

    ;(async () => {
      try {
        const maplibregl = await import('maplibre-gl')
        if (cancelled || !mapRef.current) return

        // Worker ze statického souboru (kopíruje ho scripts/build-map-style.mjs).
        // Bundlovaný worker se v Turbopack dev hroutí hned po startu — mapa pak
        // navždy ukazuje „Načítám mapu…", protože dlaždice nemá kdo parsovat.
        maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs')

        const map = new maplibregl.Map({
          container: mapRef.current,
          style: STYLE_URL,
          center: [centerLng, centerLat],
          zoom: Math.max(zoom - 1, 1),
          // Atribuce © OpenStreetMap je licenční povinnost (ODbL) — neodstraňovat.
          attributionControl: { compact: true },
          // Stejné chování jako dřív Google mapa: skrolování stránky přes mapu
          // ji neposouvá — na dotyku posun dvěma prsty, na myši zoom jen
          // s Ctrl/⌘. Bez toho mapa přes celou šířku „chytá" scroll stránky.
          cooperativeGestures: true,
          locale: {
            'CooperativeGesturesHandler.WindowsHelpText':
              'Mapu přiblížíte kolečkem myši s klávesou Ctrl',
            'CooperativeGesturesHandler.MacHelpText': 'Mapu přiblížíte kolečkem myši s klávesou ⌘',
            'CooperativeGesturesHandler.MobileHelpText': 'Mapu posunete dvěma prsty',
            'NavigationControl.ZoomIn': 'Přiblížit',
            'NavigationControl.ZoomOut': 'Oddálit',
            'Popup.Close': 'Zavřít kartičku místa',
          },
        })
        mapInstanceRef.current = map
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left')

        // Jedno sdílené okno s kartičkou místa (stejné HTML jako mělo Google okno).
        // Kotva se NEURČUJE napevno: bez ní si ji MapLibre volí podle volného
        // místa, takže kartička u okraje mapy se otevře dovnitř a neořízne se
        // (Google to řešil autopanem; tohle je klidnější). Offsety posouvají
        // kartičku mimo pin (44 px, ukotvený dolním středem) pro každou stranu.
        const popup = new maplibregl.Popup({
          // MapLibre jinak po otevření přesune fokus na první odkaz v kartičce.
          // Kartička se otevírá i pouhým najetím myší na řádek výpisu — fokus
          // by pak stránku posunul za kartičkou (mapa pod okrajem okna, nebo
          // přilepená nad výpisem u posledních položek), řádek pod kurzorem
          // by se vyměnil a stránka by skákala nahoru a dolů. Najetí myší
          // nesmí hýbat fokusem ani stránkou; po kliku či klávese na pin fokus
          // do kartičky přesouvá `openPopup` samo (viz `focus`).
          focusAfterOpen: false,
          offset: {
            center: [0, 0],
            bottom: [0, -(MARKER_SIZE + 6)],
            'bottom-left': [0, -(MARKER_SIZE + 6)],
            'bottom-right': [0, -(MARKER_SIZE + 6)],
            top: [0, 10],
            'top-left': [0, 10],
            'top-right': [0, 10],
            left: [MARKER_SIZE / 2 + 8, -(MARKER_SIZE / 2 + 3)],
            right: [-(MARKER_SIZE / 2 + 8), -(MARKER_SIZE / 2 + 3)],
          },
          maxWidth: '224px',
          closeButton: true,
        })

        // Uživatelům s omezeným pohybem se mapa nepřisouvá animovaně, ale skokem.
        const snizitPohyb = window.matchMedia('(prefers-reduced-motion: reduce)').matches

        // Otevření kartičky (klik na pin i hover z výpisu). Pin mimo aktuální
        // výřez mapu přisune do středu; pin u okraje řeší automatická kotva
        // kartičky a zbylý drobný přesah dorovná panBy o změřený rozdíl —
        // dohromady stejné chování jako autopan Google InfoWindow.
        // `focus`: po výslovné akci (klik, Enter/mezerník na pinu) přejde fokus
        // na první odkaz v kartičce, ať se klávesnicí dá pokračovat dovnitř;
        // při otevření z hoveru fokus zůstává, kde byl.
        const openPopup = (m: MapMarker, { focus = false }: { focus?: boolean } = {}) => {
          const outOfView = !map.getBounds().contains([m.lng, m.lat])
          if (outOfView) map.easeTo({ center: [m.lng, m.lat], duration: snizitPohyb ? 0 : 350 })
          popup
            .setLngLat([m.lng, m.lat])
            .setHTML(DOMPurify.sanitize(buildInfoWindowContent(m)))
            .addTo(map)
          if (focus) {
            popup
              .getElement()
              ?.querySelector<HTMLElement>('a[href], button, [tabindex]:not([tabindex="-1"])')
              ?.focus()
          }
          if (outOfView) return // po vycentrování se kartička vejde vždy
          requestAnimationFrame(() => {
            if (cancelled || !mapInstanceRef.current) return
            const okraj = 8
            const pr = popup.getElement()?.getBoundingClientRect()
            const cr = map.getContainer().getBoundingClientRect()
            if (!pr) return
            let dx = 0
            let dy = 0
            if (pr.left < cr.left + okraj) dx = pr.left - (cr.left + okraj)
            else if (pr.right > cr.right - okraj) dx = pr.right - (cr.right - okraj)
            if (pr.top < cr.top + okraj) dy = pr.top - (cr.top + okraj)
            else if (pr.bottom > cr.bottom - okraj) dy = pr.bottom - (cr.bottom - okraj)
            if (dx || dy) map.panBy([dx, dy], { duration: snizitPohyb ? 0 : 250 })
          })
        }

        const bounds = new maplibregl.LngLatBounds()
        for (const m of currentMarkers) {
          const el = document.createElement('div')
          el.style.cssText = `width:${MARKER_SIZE}px;height:${MARKER_SIZE}px;cursor:pointer;`
          // Pin je interaktivní prvek — musí jít ovládat i klávesnicí a čtečka
          // musí vědět, co otevírá (Google markery tohle neuměly).
          el.setAttribute('role', 'button')
          el.setAttribute('tabindex', '0')
          el.setAttribute('aria-label', `Zobrazit kartičku místa ${m.title}`)
          el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              openPopup(m, { focus: true })
            }
          })
          // Stejná hygiena URL jako u kartičky: do <img src> jen ověřená
          // absolutní http(s) adresa; jiná hodnota = záložní kolečko níž.
          const markerImageUrl = m.imageUrl ? toSafeImageUrl(m.imageUrl) : null
          if (markerImageUrl) {
            const img = document.createElement('img')
            img.src = buildMarkerIconUrl(markerImageUrl)
            img.alt = m.title
            img.width = MARKER_SIZE
            img.height = MARKER_SIZE
            img.style.cssText = 'display:block;width:100%;height:100%;object-fit:cover;'
            if (!isCloudinaryHost(fromMediaProxy(markerImageUrl))) {
              img.style.borderRadius = '50%'
              img.style.border = '3px solid #fff'
            }
            el.appendChild(img)
          } else {
            // Bez fotky: plné kolečko v barvě webu.
            el.style.cssText +=
              'border-radius:50%;border:3px solid #fff;background:#215491;box-shadow:0 1px 4px rgba(0,0,0,.35);'
          }
          el.addEventListener('click', (e) => {
            e.stopPropagation()
            openPopup(m, { focus: true })
          })

          new maplibregl.Marker({ element: el, anchor: 'bottom' })
            .setLngLat([m.lng, m.lat])
            .addTo(map)
          bounds.extend([m.lng, m.lat])
        }

        // Najetí na kartu/řádek ve výpisu (`data-poiid` = id stránky) ukáže
        // kartičku u příslušného pinu; opuštění ji zavře. Výpis je v DOM dřív
        // než mapa (server-rendered), takže stačí posluchače navěsit jednou.
        const markerById = new Map(currentMarkers.map((m) => [String(m.id), m]))
        document.querySelectorAll('[data-poiid]').forEach((item) => {
          const poiId = (item as HTMLElement).dataset.poiid
          const m = poiId ? markerById.get(poiId) : undefined
          if (!m) return
          const show = () => openPopup(m)
          const hide = () => popup.remove()
          // mouseenter/mouseleave nebublají — pohyb myši mezi vnitřními prvky
          // řádku tak kartičku neotevírá a nezavírá pořád dokola.
          item.addEventListener('mouseenter', show)
          item.addEventListener('mouseleave', hide)
          hoverHandlers.push(
            { el: item, type: 'mouseenter', fn: show },
            { el: item, type: 'mouseleave', fn: hide },
          )
        })

        if (fitToMarkers && currentMarkers.length > 1) {
          // Vlastní odsazení jen na dost široké mapě — jinak by fitBounds
          // s odsazením větším než plátno vyhodil chybu.
          const width = mapRef.current?.clientWidth ?? 0
          const useCustomPadding =
            fitPadding !== undefined && width > fitPadding.left + fitPadding.right + 240
          map.fitBounds(bounds, {
            padding: useCustomPadding ? fitPadding : DEFAULT_FIT_PADDING,
            maxZoom: MAX_FIT_ZOOM,
            animate: false,
          })
        }

        // Vzhled okna kartičky — jednou pro celý web (vlastnímu HTML nesmí okno
        // podstrkávat bílé okraje; stejný trik jako dřív u Google InfoWindow).
        if (!document.getElementById('ml-popup-overrides')) {
          const style = document.createElement('style')
          style.id = 'ml-popup-overrides'
          style.textContent = `
            .maplibregl-popup-content { padding: 0 !important; border-radius: 12px !important; overflow: hidden; box-shadow: 0 10px 28px rgba(20,43,74,.25) !important; }
            .maplibregl-popup-close-button { top: 8px; right: 8px; width: 34px; height: 34px; border-radius: 50%; background: rgba(0,0,0,.5); color: #fff; font-size: 18px; line-height: 1; z-index: 10; }
            .maplibregl-popup-close-button:hover { background: rgba(0,0,0,.7); }
          `
          document.head.appendChild(style)
        }

        // Chyba PŘED prvním úspěšným vykreslením = mapa nenaběhla (rozbitý styl,
        // nedostupné dlaždice) → chybová UI. Pozdější chyby (výpadek jedné
        // dlaždice) jen logujeme, mapa jinak funguje.
        let mapStarted = false
        map.on('load', () => {
          mapStarted = true
          // Licenční text (OpenFreeMap © OpenMapTiles, OSM) hned sbalený do ⓘ —
          // MapLibre ho v kompaktním režimu ukazuje rozbalený a sbalí ho až po
          // prvním posunu mapy; tady by do prvního posunu ležel přes piny a štítek.
          // Sbalení jde přes vlastní tlačítko prvku (stejné jako klik uživatele),
          // takže třída i atribut `open` zůstanou v souladu s MapLibre. Atribuce
          // zůstává na kliknutí dostupná, licence ODbL tím není dotčena.
          const attribution = map.getContainer().querySelector('.maplibregl-ctrl-attrib')
          if (attribution?.classList.contains('maplibregl-compact-show')) {
            attribution.querySelector<HTMLButtonElement>('.maplibregl-ctrl-attrib-button')?.click()
          }
          if (!cancelled) {
            setLoadError(null)
            setLoaded(true)
          }
        })
        map.on('error', (e: { error?: { message?: string } }) => {
          const message = e?.error?.message ?? 'Mapu se nepodařilo načíst'
          console.warn('[MapLibreMap] chyba mapy:', message)
          if (!mapStarted) failMap(message)
        })
      } catch (err) {
        const message =
          err instanceof Error && err.message ? err.message : 'Mapu se nepodařilo načíst'
        failMap(message)
        console.warn('[MapLibreMap] load error:', message)
      }
    })()

    return () => {
      cancelled = true
      hoverHandlers.forEach(({ el, type, fn }) => el.removeEventListener(type, fn))
      mapInstanceRef.current?.remove()
      mapInstanceRef.current = null
    }
  }, [inView, stableMarkers, centerLat, centerLng, zoom, fitToMarkers, fitPadding])

  // Vnější kontejner je vždy v DOM (i před načtením) se stejnými rozměry —
  // IntersectionObserver má co pozorovat a nevzniká CLS při dokreslení mapy.
  // Zaoblení nesou PRÁVĚ DVA vnější obaly (kontejner + wrapper s overflow) —
  // profil autora je u pásu přes celou šířku vypíná selektory `[&>div]`
  // a `[&>div>div]`, vnitřní prvek mapy proto zaoblení mít nesmí.
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
      ) : (
        <div className="relative h-full w-full rounded-lg overflow-hidden">
          {!loaded && (
            <div className="absolute inset-0 z-10 border border-[#e4e4e4] bg-[#f8fafc] p-6 text-center text-sm text-[#4f5f74]">
              <p className="font-semibold text-[#1a3f6c]">Načítám mapu…</p>
            </div>
          )}
          {/* Kontejner mapy musí být v DOM už během inicializace (MapLibre do
              něj kreslí hned), proto se nepřepíná přes ternár. */}
          <div ref={mapRef} className="h-full w-full" />
        </div>
      )}
    </div>
  )
}
