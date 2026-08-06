import type { Endpoint } from 'payload'
import { APIError } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import { BetaAnalyticsDataClient } from '@google-analytics/data'

/**
 * Normalizuje GA4 `pagePath` na tvar shodný s uloženým `fullSlug` (vedoucí
 * lomítko, žádné koncové, bez query stringu) — viz ověření v Části B plánu.
 */
function normalizePagePath(pagePath: string): string {
  const withoutQuery = pagePath.split('?')[0]
  const withoutTrailingSlash = withoutQuery.replace(/\/+$/, '')
  return withoutTrailingSlash || '/'
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

// Jeden hromadný UPDATE za dávku — ne dotaz na stránku. VĎDOMĚ mimo Payload
// Local API (bez hooků), aby noční sync nespustil revalidateTag pro každou
// z tisíců stránek; čerstvost čísel dorazí přes `revalidate: 300` v cached().
async function writePageViews(
  db: { drizzle: { execute: (query: unknown) => Promise<unknown> } },
  viewsByFullSlug: Map<string, number>,
  batchSize = 500,
): Promise<number> {
  const entries = [...viewsByFullSlug.entries()]
  let updated = 0

  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize)
    const values = sql.join(
      batch.map(([fullSlug, views]) => sql`(${fullSlug}::text, ${views}::int)`),
      sql`, `,
    )
    const result = await db.drizzle.execute(sql`
      UPDATE pages AS p
      SET analytics_page_views = v.views
      FROM (VALUES ${values}) AS v(full_slug, views)
      WHERE p.full_slug = v.full_slug
    `)
    updated += (result as { rowCount?: number }).rowCount ?? batch.length
  }

  return updated
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
    if (!isAdmin && (!secret || providedSecret !== secret)) {
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

    const db = req.payload.db as unknown as {
      drizzle: { execute: (query: unknown) => Promise<unknown> }
    }
    const updated = await writePageViews(db, viewsByFullSlug)

    return Response.json({ ok: true, matchedPaths: viewsByFullSlug.size, updated })
  },
}
