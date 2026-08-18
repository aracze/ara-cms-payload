// Media proxy (media.ara.cz): normálně proxuje na Cloudinary s dlouhou edge
// keší (kredity za přenos přestanou téct), při výpadku Cloudinary podává
// zálohu z R2 — pokud možno zmenšenou přes Cloudflare Image Transformations.
// Čistá logika cest je v media-path.ts, tady jen síť a hlavičky.

import { cfImageOptions, deriveR2Keys, negotiateFormat, parsePath } from './media-path'

export interface Env {
  /** R2 bucket se zálohou originálů médií (plní hook v src/collections/Media.ts). */
  BACKUP: R2Bucket
  /** Např. https://res.cloudinary.com/ara — testy fallbacku podvrhnou neplatný host. */
  CLOUDINARY_ORIGIN: string
  /** Custom doména R2 bucketu — zdroj pro Image Transformations (bez rekurze na sebe). */
  BACKUP_HOST: string
}

const YEAR_SECONDS = 31_536_000
/** Adresy jsou verzované/obsahově adresované → klidně navždy. */
const IMMUTABLE_CACHE = `public, max-age=${YEAR_SECONDS}, immutable`
/** Nouzový režim jen krátce — po oživení Cloudinary se rychle vrátí zmenšeniny. */
const FALLBACK_CACHE = 'public, max-age=300'

/** Z upstreamu kopírujeme jen tohle; x-cld-error a spol. ven nepatří. */
const COPIED_HEADERS = ['content-type', 'content-length', 'etag', 'last-modified']

function buildResponse(upstream: Response, cacheControl: string, isHead: boolean): Response {
  const headers = new Headers()
  for (const name of COPIED_HEADERS) {
    const value = upstream.headers.get(name)
    if (value) headers.set(name, value)
  }
  headers.set('cache-control', cacheControl)
  headers.set('vary', 'Accept')
  headers.set('x-content-type-options', 'nosniff')
  // Ladicí viditelnost: stav edge keše SUBREQUESTU (HIT = Cloudinary už
  // o požadavku neví). Vnější cf-cache-status tu neexistuje — custom
  // doména Workeru volá Worker vždy.
  const upstreamCache = upstream.headers.get('cf-cache-status')
  if (upstreamCache) headers.set('x-upstream-cache', upstreamCache)
  return new Response(isHead ? null : upstream.body, { status: 200, headers })
}

const mediaProxy = {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, HEAD' } })
    }
    const isHead = request.method === 'HEAD'
    const url = new URL(request.url)
    const parsed = parsePath(url.pathname)
    if (!parsed.ok) {
      return new Response(parsed.status === 400 ? 'Invalid transformation' : 'Not found', {
        status: parsed.status,
      })
    }
    const { resourceType, version, key } = parsed.path
    // f_auto → konkrétní formát dle Accept (Cloudflare keš ignoruje Vary).
    const transform = negotiateFormat(parsed.path.transform, request.headers.get('accept') ?? '')

    // Query string se zahazuje (Cloudinary ho ignoruje, jen by kazil keš).
    // Upstream dostává holý GET bez klientských hlaviček — URL po vyjednání
    // formátu plně určuje bajty. Keš je klíčovaná URL subrequestu.
    const upstreamUrl = `${env.CLOUDINARY_ORIGIN}/${resourceType}/upload/${
      transform ? `${transform}/` : ''
    }${version}${key}`

    let upstream: Response | undefined
    try {
      upstream = await fetch(upstreamUrl, {
        signal: AbortSignal.timeout(10_000),
        cf: { cacheEverything: true, cacheTtl: YEAR_SECONDS },
      })
    } catch {
      upstream = undefined
    }
    if (upstream?.ok) {
      return buildResponse(upstream, IMMUTABLE_CACHE, isHead)
    }
    // Tělo neúspěšné odpovědi uvolnit, ať nedrží spojení.
    void upstream?.body?.cancel()

    // Nouzový režim: deaktivovaný účet = 401, chybějící asset = 404, výpadek
    // = 5xx/timeout → záloha z R2. `raw` (SVG) se podává tak, jak je.
    const imageOptions = resourceType === 'image' ? cfImageOptions(transform) : null
    for (const r2Key of deriveR2Keys(key)) {
      const exists = await env.BACKUP.head(r2Key)
      if (!exists) continue

      if (imageOptions) {
        try {
          const resized = await fetch(`https://${env.BACKUP_HOST}/${encodeURI(r2Key)}`, {
            signal: AbortSignal.timeout(10_000),
            cf: { image: imageOptions, cacheEverything: true, cacheTtl: 300 },
          })
          if (resized.ok) return buildResponse(resized, FALLBACK_CACHE, isHead)
          void resized.body?.cancel()
        } catch {
          // zmenšování nedostupné (kvóta/vypnuto) → poslední záchrana níž
        }
      }

      // Poslední záchrana: surový originál přímo z bucketu.
      const object = await env.BACKUP.get(r2Key)
      if (!object) continue
      const headers = new Headers()
      object.writeHttpMetadata(headers)
      if (!headers.get('content-type')) headers.set('content-type', 'application/octet-stream')
      headers.set('cache-control', FALLBACK_CACHE)
      headers.set('vary', 'Accept')
      headers.set('x-content-type-options', 'nosniff')
      return new Response(isHead ? null : object.body, { status: 200, headers })
    }

    // Není ani na Cloudinary, ani v záloze → propagovat stav upstreamu.
    return new Response('Image unavailable', { status: upstream?.status ?? 502 })
  },
}

export default mediaProxy
