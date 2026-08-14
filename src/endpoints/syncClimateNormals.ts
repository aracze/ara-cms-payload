import type { Endpoint } from 'payload'
import { APIError } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import { timingSafeEqual } from 'node:crypto'
import { safeRevalidate } from '@/hooks/revalidation'
import { PageCategory, type ClimateNormalMonth, type ClimateNormals } from '@/types/payload'

/**
 * Měsíční sync klimatických normálů: pro publikované stránky kategorie
 * „Počasí" stáhne z Meteostat API (point/normals) dlouhodobé měsíční průměry
 * — min/max teplotu a srážky — a uloží je do JSON pole `climateNormals`.
 * Souřadnice se berou z rodičovského místa (stránka počasí vlastní nemá).
 *
 * Stejný vzor jako /api/sync-affiliate-deals: spouští GitHub Actions cron
 * (.github/workflows/sync-climate-normals.yml) se sdíleným tajemstvím
 * ANALYTICS_SYNC_SECRET; zápis jde přímým SQL mimo Payload hooky (stránky mají
 * drafts — update přes Local API by sypal historii verzí), invalidace cache se
 * proto volá ručně přes revalidateTag.
 *
 * Selhání jednoho místa NEMAŽE minulá data: stránka drží poslední úspěšně
 * stažené normály a chyba se jen vrátí v odpovědi.
 *
 * Meteostat kvóty (RapidAPI Basic zdarma): 500 dotazů/měsíc → sync se pouští
 * 1× měsíčně (~174 stránek počasí) a mezi dotazy se čeká. Normály jsou
 * třicetileté průměry, častější obnova nemá smysl. Licence dat: CC BY 4.0 —
 * web u grafu uvádí „Zdroj: Meteostat" (viz climate-section.tsx).
 */

/** Porovnání secretu časově konstantní — obyčejné `!==` by šlo uhodnout po znacích z doby odezvy. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const METEOSTAT_DELAY_MS = 1200 // slušný rozestup pod rate limitem RapidAPI
const FETCH_TIMEOUT_MS = 30_000

/** Řádek odpovědi Meteostat point/normals (jeden měsíc jednoho období). */
type MeteostatNormalRow = {
  start?: number
  end?: number
  month?: number
  tmin?: number | null
  tmax?: number | null
  prcp?: number | null
}

/**
 * Normály pro souřadnice z Meteostat API. Odpověď může obsahovat víc
 * referenčních období (např. 1961–1990 i 1991–2020) — bere se nejnovější.
 * Bez kompletních teplot (tmin/tmax všech 12 měsíců) vyhazuje chybu — graf
 * s dírou v čáře by vypadal rozbitě; srážky smí chybět (sloupec se vynechá).
 */
async function fetchMeteostatNormals(lat: number, lon: number): Promise<ClimateNormals> {
  const apiKey = process.env.METEOSTAT_RAPIDAPI_KEY
  if (!apiKey) throw new Error('METEOSTAT_RAPIDAPI_KEY není nastaveno')

  const params = new URLSearchParams({ lat: String(lat), lon: String(lon) })
  const res = await fetch(`https://meteostat.p.rapidapi.com/point/normals?${params}`, {
    headers: {
      'x-rapidapi-key': apiKey,
      'x-rapidapi-host': 'meteostat.p.rapidapi.com',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`Meteostat API ${res.status}`)
  const json = (await res.json()) as { data?: MeteostatNormalRow[] }
  const rows = json.data ?? []
  if (rows.length === 0) throw new Error('Meteostat nevrátil žádné normály')

  // Nejnovější období = největší koncový rok (při shodě největší počáteční).
  let latest: { start: number; end: number } | null = null
  for (const row of rows) {
    const start = Number(row.start)
    const end = Number(row.end)
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue
    if (!latest || end > latest.end || (end === latest.end && start > latest.start)) {
      latest = { start, end }
    }
  }

  const monthRows = latest
    ? rows.filter((r) => Number(r.start) === latest.start && Number(r.end) === latest.end)
    : rows

  const numberOrNull = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null

  const months: ClimateNormalMonth[] = []
  for (let month = 1; month <= 12; month++) {
    const row = monthRows.find((r) => Number(r.month) === month)
    months.push({
      month,
      tmin: numberOrNull(row?.tmin),
      tmax: numberOrNull(row?.tmax),
      prcp: numberOrNull(row?.prcp),
    })
  }

  if (months.some((m) => m.tmin === null || m.tmax === null)) {
    throw new Error('Meteostat nemá pro tyto souřadnice kompletní teploty (12 měsíců)')
  }

  return {
    months,
    period: latest,
    updatedAt: new Date().toISOString(),
  }
}

type WeatherPage = {
  id: number
  fullSlug?: string | null
  parent?: number | { id: number } | null
  climateNormals?: unknown
}

type ParentPlace = {
  id: number
  detail?: { latitude?: string | null; longitude?: string | null } | null
}

type DrizzleTx = { execute: (query: unknown) => Promise<unknown> }
type DrizzleLike = DrizzleTx & {
  transaction: <T>(fn: (tx: DrizzleTx) => Promise<T>) => Promise<T>
}

export const syncClimateNormalsEndpoint: Endpoint = {
  path: '/sync-climate-normals',
  method: 'post',
  handler: async (req) => {
    const secret = process.env.ANALYTICS_SYNC_SECRET
    const providedSecret = req.headers.get('x-sync-secret')
    const roles = Array.isArray(req.user?.roles) ? req.user?.roles : []
    const isAdmin = Boolean(req.user) && roles.includes('admin')
    // Spouští GitHub Actions cron bez session → sdílené tajemství (stejné jako
    // sync-analytics, ať na serveru nepřibývá další env). Přihlášený admin projde.
    if (!isAdmin && (!secret || !providedSecret || !safeEqual(providedSecret, secret))) {
      throw new APIError('Forbidden', 403)
    }
    const dryRun = new URL(req.url ?? '', 'http://localhost').searchParams.get('dryRun') === '1'

    // Jen publikované stránky počasí — overrideAccess: true obchází přístupová
    // práva (a s nimi filtr draftů), proto se _status hlídá explicitně.
    const pagesRes = await req.payload.find({
      collection: 'pages',
      overrideAccess: true,
      where: {
        and: [{ _status: { equals: 'published' } }, { category: { equals: PageCategory.Pocasi } }],
      },
      depth: 0,
      limit: 0,
      pagination: false,
      select: { fullSlug: true, parent: true, climateNormals: true },
      joins: false,
    })
    const pages = pagesRes.docs as unknown as WeatherPage[]

    // Souřadnice rodičovských míst jedním dotazem (stránka počasí vlastní nemá).
    const parentIds = [
      ...new Set(
        pages
          .map((p) => (typeof p.parent === 'object' ? p.parent?.id : p.parent))
          .filter((id): id is number => typeof id === 'number'),
      ),
    ]
    const parentsRes = await req.payload.find({
      collection: 'pages',
      overrideAccess: true,
      where: { id: { in: parentIds } },
      depth: 0,
      limit: 0,
      pagination: false,
      select: { detail: true },
      joins: false,
    })
    const parentById = new Map((parentsRes.docs as unknown as ParentPlace[]).map((p) => [p.id, p]))

    const errors: string[] = []
    const results: { id: number; fullSlug: string | null; normals: ClimateNormals }[] = []
    let skipped = 0

    // Sekvenčně s rozestupy (rate limit RapidAPI). Kdyby víc stránek sdílelo
    // souřadnice, druhá se obslouží z cache — kvóta je jen 500 dotazů/měsíc.
    const normalsCache = new Map<string, ClimateNormals | Error>()
    for (const page of pages) {
      const parentId = typeof page.parent === 'object' ? page.parent?.id : page.parent
      const parent = typeof parentId === 'number' ? parentById.get(parentId) : undefined
      const lat = Number.parseFloat(parent?.detail?.latitude ?? '')
      const lon = Number.parseFloat(parent?.detail?.longitude ?? '')
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        skipped++
        errors.push(`${page.fullSlug}: rodičovské místo nemá souřadnice`)
        continue
      }

      const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)}`
      if (!normalsCache.has(cacheKey)) {
        try {
          normalsCache.set(cacheKey, await fetchMeteostatNormals(lat, lon))
        } catch (err) {
          normalsCache.set(cacheKey, err instanceof Error ? err : new Error(String(err)))
        }
        await sleep(METEOSTAT_DELAY_MS)
      }
      const cached = normalsCache.get(cacheKey)
      if (!cached || cached instanceof Error) {
        // Selhání nemaže minulá data — stránka si nechá poslední úspěšný sync.
        skipped++
        errors.push(
          `${page.fullSlug} meteostat(${cacheKey}): ${cached instanceof Error ? cached.message : 'bez dat'}`,
        )
        continue
      }
      results.push({ id: page.id, fullSlug: page.fullSlug ?? null, normals: cached })
    }

    if (dryRun) {
      return Response.json({ ok: true, dryRun: true, pages: results, skipped, errors })
    }

    // Přímý SQL zápis mimo hooky (viz hlavička souboru) — v jedné transakci
    // s try-advisory lockem proti souběhu (curl --retry umí poslat druhý běh).
    const db = req.payload.db as unknown as { drizzle: DrizzleLike }
    await db.drizzle.transaction(async (tx) => {
      const lockResult = (await tx.execute(
        sql`SELECT pg_try_advisory_xact_lock(hashtext('aracze:sync-climate-normals')) AS acquired`,
      )) as { rows: { acquired: boolean }[] }
      if (!lockResult.rows[0]?.acquired) {
        throw new APIError('Sync už běží (souběžný požadavek) — zkus to za chvíli znovu', 409)
      }
      for (const r of results) {
        await tx.execute(
          sql`UPDATE pages SET climate_normals = ${JSON.stringify(r.normals)}::jsonb WHERE id = ${r.id}`,
        )
      }
    })

    // Zápis šel mimo hooky → invalidace cache stránek ručně (vzor revalidation.ts).
    await safeRevalidate([
      'pages',
      ...results.filter((r) => r.fullSlug).map((r) => 'page_' + r.fullSlug),
    ])

    return Response.json({
      ok: true,
      pages: pages.length,
      updated: results.length,
      skipped,
      errors,
    })
  },
}
