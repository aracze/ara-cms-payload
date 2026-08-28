// Čisté funkce media proxy — parsování cesty, whitelist transformací,
// vyjednání formátu a odvození klíče v R2 záloze. Bez závislosti na workerd,
// aby šly unit-testovat obyčejným vitestem (viz test/media-path.test.ts).

/** Rozparsovaná cesta `/(image|raw)/upload/[transformace/][v123/]<public_id>[.ext]`. */
export type ParsedPath = {
  resourceType: 'image' | 'raw'
  /** Ověřený transformační segment (může obsahovat f_auto), nebo null. */
  transform: string | null
  /** Verze včetně koncového lomítka (`v123/`), nebo prázdný řetězec. */
  version: string
  /** public_id včetně případné složky (avatars/…) a přípony. */
  key: string
}

export type ParseResult = { ok: true; path: ParsedPath } | { ok: false; status: 400 | 404 }

// Šířky, které web reálně generuje: next/image imageSizes (výchozí sada) ∪
// deviceSizes (next.config.mjs) ∪ pevné konstanty (mapa 44/220, rich-text
// 420/790, lightbox 1600). Cokoliv mimo množinu = pokus razit vlastní
// varianty přes naši doménu (a pálit Cloudinary kredity) → 400.
const ALLOWED_WIDTHS = new Set([
  16, 32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 44, 220, 420, 790, 1600,
  // Náhled v adminu Payloadu (cloudinary plugin: 150×150, c_fill,g_auto).
  // Od přepisu adres už při čtení z CMS (src/hooks/media-proxy.ts) jde
  // i thumbnailURL přes proxy.
  150,
])

// Uzavřený slovník komponent, které skládá náš kód (loader, karty, rich-text,
// mapa). Viz src/lib/cloudinary-loader.ts, place/deal-card-image,
// rich-text-html a maplibre-map v hlavním appu.
const TRANSFORM_COMPONENT_PATTERNS = [
  /^f_(auto|avif|webp|png|jpg)$/,
  /^q_(auto|100|[1-9][0-9]?)$/,
  /^c_(limit|fit|fill)$/,
  /^g_auto$/,
  /^r_max$/,
  /^bo_3px_solid_white$/,
  /^ar_(5:7|1:1|3:2|2:1|21:8|16:9)$/,
  /^h_(44|126|150)$/,
]

/** Každá komponenta segmentu musí projít whitelistem, jinak celý segment padá. */
export function isValidTransform(segment: string): boolean {
  if (segment.length > 100) return false
  const components = segment.split(',')
  if (components.length === 0 || components.length > 8) return false
  return components.every((component) => {
    const width = component.match(/^w_(\d{1,4})$/)
    if (width) return ALLOWED_WIDTHS.has(Number(width[1]))
    return TRANSFORM_COMPONENT_PATTERNS.some((pattern) => pattern.test(component))
  })
}

// Naše transformace mají VŽDY ≥2 komponenty, takže obsahují čárku. Segment
// bez čárky ve tvaru Cloudinary parametru (`e_blur:300`, `t_named`…) web
// nikdy negeneruje — je to pokus o ražení variant a zaslouží 400, ne tiché
// přeposlání (Cloudinary by ho jako transformaci provedl). Poznává se podle
// ZNÁMÝCH Cloudinary prefixů (ne libovolného `xx_`), aby složka v public_id
// (`foo_bar/…`) neprošla omylem jako transformace → 400.
const CLOUDINARY_PARAM_PREFIX =
  /^(a|ar|b|bo|br|c|co|cs|d|dl|dn|dpr|du|e|eo|f|fl|fn|fps|g|h|if|ki|l|o|p|pg|q|r|so|sp|t|u|vc|vs|w|x|y|z)_/
function looksLikeSingleTransform(segment: string): boolean {
  return CLOUDINARY_PARAM_PREFIX.test(segment)
}

export function parsePath(pathname: string): ParseResult {
  // Jen delivery typ `upload` — zejména `/image/fetch/<url>` (proxování
  // cizích adres na náš účet) nesmí projít.
  const match = pathname.match(/^\/(image|raw)\/upload\/(.+)$/)
  if (!match) return { ok: false, status: 404 }
  const resourceType = match[1] as 'image' | 'raw'
  const segments = match[2].split('/')

  let transform: string | null = null
  if (segments.length > 1 && segments[0].includes(',')) {
    transform = segments.shift() as string
    if (!isValidTransform(transform)) return { ok: false, status: 400 }
  } else if (segments.length > 1 && looksLikeSingleTransform(segments[0])) {
    return { ok: false, status: 400 }
  }

  let version = ''
  if (segments.length > 1 && /^v\d+$/.test(segments[0])) {
    version = `${segments.shift()}/`
  }

  // Čárka v klíči = zbloudilá transformace (public_id čárky nemívají).
  const key = segments.join('/')
  if (!key || key.includes('..') || key.includes(',') || segments.some((s) => s === '')) {
    return { ok: false, status: 404 }
  }

  return { ok: true, path: { resourceType, transform, version, key } }
}

// `image/avif;q=0` znamená „AVIF výslovně odmítám" — prostý substring test
// by ho přesto poslal. Typ bereme jen s q > 0 (chybějící q = 1 dle RFC 9110).
function accepts(accept: string, type: string): boolean {
  const match = accept.match(new RegExp(`${type}\\s*(;[^,]*)?(,|$)`))
  if (!match) return false
  const quality = (match[1] ?? '').match(/;\s*q=([0-9.]+)/)
  return !quality || Number(quality[1]) > 0
}

// f_auto nesmí do keše tak, jak přijde: Cloudflare keš ignoruje Vary, takže
// by formát vybraný pro prvního návštěvníka dostali všichni (AVIF do starého
// prohlížeče = rozbité obrázky). Přepis na konkrétní formát podle Accept —
// každá formátová třída tak má vlastní URL, tedy vlastní keš záznam (max 3).
export function negotiateFormat(transform: string | null, accept: string): string | null {
  if (!transform) return null
  const components = transform.split(',')
  if (!components.includes('f_auto')) return transform

  // Bez moderního formátu token odebrat (originální formát) — f_jpg by
  // zahodil PNG průhlednost.
  const replacement = accepts(accept, 'image/avif')
    ? 'f_avif'
    : accepts(accept, 'image/webp')
      ? 'f_webp'
      : null

  const rewritten = components
    .map((component) => (component === 'f_auto' ? replacement : component))
    .filter((component): component is string => component !== null)
  return rewritten.length > 0 ? rewritten.join(',') : null
}

// Klíč v R2 záloze = `<public_id>.<formát>` (přesně resolveR2Key
// v src/collections/Media.ts; `.jpeg` se při záloze normalizuje na `.jpg`).
// Legacy adresy z rich-textu bývaly bez přípony — zkusíme nejčastější
// kandidáty v pořadí podle výskytu v knihovně médií.
export function deriveR2Keys(key: string): string[] {
  let decoded = key
  try {
    decoded = decodeURIComponent(key)
  } catch {
    // ponecháme původní tvar — lepší šance na shodu než žádná
  }
  // `..` po dekódování (%2E%2E prošlo kontrolou v parsePath): R2 klíče sice
  // nejsou cesty, ale URL na media-backup by se normalizovala — raději nic.
  if (decoded.includes('..')) return []
  const match = decoded.match(/^(.+)\.([A-Za-z0-9]{2,5})$/)
  if (match) {
    const extension = match[2].toLowerCase() === 'jpeg' ? 'jpg' : match[2].toLowerCase()
    return [`${match[1]}.${extension}`]
  }
  return ['jpg', 'png', 'webp'].map((extension) => `${decoded}.${extension}`)
}

/** Podmnožina voleb Cloudflare Image Transformations, kterou používáme. */
export type CfImageOptions = {
  width?: number
  height?: number
  fit?: 'scale-down' | 'contain' | 'cover'
  gravity?: 'auto'
  quality?: number
  format?: 'avif' | 'webp'
}

// Mapování Cloudinary transformace na Cloudflare Image Transformations
// (nouzový režim: zmenšování záloh z R2). r_max/bo_* ekvivalent nemají —
// markery mapy budou při výpadku hranaté; f_png netřeba (bez r_max není
// průhlednost potřeba). Přijatelná degradace na dobu výpadku.
export function cfImageOptions(transform: string | null): CfImageOptions | null {
  if (!transform) return null
  const options: CfImageOptions = {}
  let aspectWidth = 0
  let aspectHeight = 0
  for (const component of transform.split(',')) {
    let match
    if ((match = component.match(/^w_(\d+)$/))) options.width = Number(match[1])
    else if ((match = component.match(/^h_(\d+)$/))) options.height = Number(match[1])
    else if (component === 'c_limit') options.fit = 'scale-down'
    else if (component === 'c_fit') options.fit = 'contain'
    else if (component === 'c_fill') options.fit = 'cover'
    else if (component === 'g_auto') options.gravity = 'auto'
    else if ((match = component.match(/^q_(\d+)$/))) options.quality = Number(match[1])
    else if ((match = component.match(/^ar_(\d+):(\d+)$/))) {
      aspectWidth = Number(match[1])
      aspectHeight = Number(match[2])
    } else if (component === 'f_avif') options.format = 'avif'
    else if (component === 'f_webp') options.format = 'webp'
  }
  // ar_X:Y s c_fill: dopočítat výšku z šířky (Cloudflare ar volbu nemá).
  if (aspectWidth > 0 && aspectHeight > 0 && options.width && !options.height) {
    options.height = Math.round((options.width * aspectHeight) / aspectWidth)
  }
  return Object.keys(options).length > 0 ? options : null
}

// Podpis doručovací URL (Cloudinary „signed URL“, segment `s--xxxxxxxx--/`).
// Na účtu je zapnutý Strict transformations: nepodepsanou transformaci
// Cloudinary odmítne (404), takže staré adresy v indexech botů už negenerují
// nové odvozeniny. Proxy je jediné místo, které podepisuje — whitelist výše
// tím pádem rozhoduje, co se na Cloudinary vůbec smí vyrobit.
//
// Algoritmus (ověřeno proti oficiálnímu Node SDK `cloudinary.url(…, {sign_url:
// true})`): SHA-1 z `<transformace>/<public_id vč. přípony><api_secret>`,
// base64url, prvních 8 znaků. Verze (`v123`) se do podpisu NEPOČÍTÁ.
export async function signTransform(
  transform: string,
  key: string,
  apiSecret: string,
): Promise<string> {
  const data = new TextEncoder().encode(`${transform}/${key}${apiSecret}`)
  const digest = await crypto.subtle.digest('SHA-1', data)
  const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)))
  return `s--${base64.replace(/\+/g, '-').replace(/\//g, '_').slice(0, 8)}--`
}
