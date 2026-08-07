import type { Endpoint } from 'payload'
import { APIError } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import { BetaAnalyticsDataClient } from '@google-analytics/data'
import { timingSafeEqual } from 'node:crypto'

/** Porovnání secretu časově konstantní — obyčejné `!==` by šlo uhodnout po znacích z doby odezvy. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/**
 * Normalizuje GA4 `pagePath` na tvar shodný s uloženým `fullSlug` (vedoucí
 * lomítko, žádné koncové, bez query stringu) — viz ověření v Části B plánu.
 */
function normalizePagePath(pagePath: string): string {
  const withoutQuery = pagePath.split('?')[0]
  const withoutTrailingSlash = withoutQuery.replace(/\/+$/, '') || '/'
  return withoutTrailingSlash.startsWith('/') ? withoutTrailingSlash : `/${withoutTrailingSlash}`
}

export async function fetchPageViewsByFullSlug(): Promise<Map<string, number>> {
  const propertyId = process.env.GA4_PROPERTY_ID
  const credentialsJson = process.env.GA4_SERVICE_ACCOUNT_JSON
  if (!propertyId || !credentialsJson) {
    throw new APIError('GA4_PROPERTY_ID / GA4_SERVICE_ACCOUNT_JSON není nastaveno', 500)
  }

  const credentials = JSON.parse(credentialsJson)
  const client = new BetaAnalyticsDataClient({ credentials })

  const viewsByFullSlug = new Map<string, number>()
  const pageSize = 100_000
  let offset = 0

  // Defenzivní stránkování — v praxi má web řádově tisíce stránek, vejde se
  // do jednoho requestu, ale nespoléháme na to napevno.
  for (;;) {
    const [response] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate: '365daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }],
      limit: pageSize,
      offset,
    })

    for (const row of response.rows ?? []) {
      const pagePath = row.dimensionValues?.[0]?.value
      const views = Number(row.metricValues?.[0]?.value ?? 0)
      if (!pagePath || !Number.isFinite(views)) continue
      const fullSlug = normalizePagePath(pagePath)
      viewsByFullSlug.set(fullSlug, (viewsByFullSlug.get(fullSlug) ?? 0) + views)
    }

    const rowCount = response.rowCount ?? response.rows?.length ?? 0
    offset += pageSize
    if (offset >= rowCount) break
  }

  return viewsByFullSlug
}

type DrizzleTx = { execute: (query: unknown) => Promise<unknown> }
type DrizzleLike = DrizzleTx & {
  transaction: <T>(fn: (tx: DrizzleTx) => Promise<T>) => Promise<T>
}

// Jeden hromadný UPDATE za dávku — ne dotaz na stránku. VĚDOMĚ mimo Payload
// Local API (bez hooků), aby noční sync nespustil revalidateTag pro každou
// z tisíců stránek; čerstvost čísel dorazí přes `revalidate: 300` v cached().
//
// Reset na 0 před zápisem: klouzavé 12měsíční okno se má samo opravit i
// směrem DOLŮ — stránka, co přestala být populární, nesmí si držet starou
// hodnotu navěky jen proto, že v aktuálním GA4 exportu nemá žádný řádek.
// Celé v jedné transakci, ať reset nezůstane bez re-apply při chybě uprostřed.
async function writePageViews(
  db: { drizzle: DrizzleLike },
  viewsByFullSlug: Map<string, number>,
  batchSize = 500,
): Promise<number> {
  const entries = [...viewsByFullSlug.entries()]

  return db.drizzle.transaction(async (tx) => {
    // Serializace proti souběhu: curl v cronu má --retry, takže při timeoutu
    // klienta (server ještě dobíhá) může dorazit druhý běh současně s prvním.
    // `_try_` varianta se vrátí OKAMŽITĚ (nečeká) — blokující pg_advisory_xact_lock
    // by při zaseknutém prvním běhu držel DB spojení druhého požadavku navěky,
    // což by při opakovaných selháních mohlo vyčerpat connection pool pro celý web.
    const lockResult = (await tx.execute(
      sql`SELECT pg_try_advisory_xact_lock(hashtext('aracze:sync-analytics')) AS acquired`,
    )) as { rows: { acquired: boolean }[] }
    if (!lockResult.rows[0]?.acquired) {
      throw new APIError('Sync už běží (souběžný požadavek) — zkus to za chvíli znovu', 409)
    }

    await tx.execute(sql`UPDATE pages SET analytics_page_views = 0`)

    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize)
      const values = sql.join(
        batch.map(([fullSlug, views]) => sql`(${fullSlug}::text, ${views}::int)`),
        sql`, `,
      )
      await tx.execute(sql`
        UPDATE pages AS p
        SET analytics_page_views = v.views
        FROM (VALUES ${values}) AS v(full_slug, views)
        WHERE p.full_slug = v.full_slug
      `)
    }

    // Přesný počet stránek s nenulovou hodnotou PO zápisu — ne odhad z dávek
    // (ne každá GA4 cesta odpovídá reálné stránce, viz `/prihlaseni`, `/login`).
    const countResult = (await tx.execute(
      sql`SELECT count(*)::int AS count FROM pages WHERE analytics_page_views > 0`,
    )) as { rows: { count: number }[] }
    return countResult.rows[0]?.count ?? 0
  })
}

export const syncAnalyticsEndpoint: Endpoint = {
  path: '/sync-analytics',
  method: 'post',
  handler: async (req) => {
    const secret = process.env.ANALYTICS_SYNC_SECRET
    const providedSecret = req.headers.get('x-sync-secret')
    const roles = Array.isArray(req.user?.roles) ? req.user?.roles : []
    const isAdmin = Boolean(req.user) && roles.includes('admin')
    // Spouští GitHub Actions cron bez session → sdílené tajemství. Přihlášený
    // admin z prohlížeče (test z adminu) taky projde.
    if (!isAdmin && (!secret || !providedSecret || !safeEqual(providedSecret, secret))) {
      throw new APIError('Forbidden', 403)
    }

    const dryRun = new URL(req.url ?? '', 'http://localhost').searchParams.get('dryRun') === '1'

    const viewsByFullSlug = await fetchPageViewsByFullSlug()

    if (dryRun) {
      return Response.json({
        ok: true,
        dryRun: true,
        matchedPaths: viewsByFullSlug.size,
        sample: [...viewsByFullSlug.entries()].slice(0, 20),
      })
    }

    const db = req.payload.db as unknown as { drizzle: DrizzleLike }
    const pagesWithViews = await writePageViews(db, viewsByFullSlug)

    return Response.json({ ok: true, matchedPaths: viewsByFullSlug.size, pagesWithViews })
  },
}
