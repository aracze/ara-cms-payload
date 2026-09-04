import type { Endpoint } from 'payload'
import { APIError } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import { BetaAnalyticsDataClient } from '@google-analytics/data'
import { timingSafeEqual } from 'node:crypto'
import { HOMEPAGE_POPULAR_DESTINATIONS_TAG, safeRevalidate } from '@/hooks/revalidation'

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

/** Zobrazení stránky ve dvou klouzavých oknech. */
export type PageViews = {
  /** 12 měsíců — řazení v sekci „Co vidět". */
  views365: number
  /** 30 dní — výběr „Oblíbené" pod vyhledáváním na homepage (sezónnost). */
  views30: number
}

// Obě okna v JEDNOM dotazu: GA4 při více `dateRanges` přidá na KONEC dimenzí
// `dateRange` s hodnotou = `name` okna. Nelze ji žádat explicitně (API vrací
// INVALID_ARGUMENT „Field dateRange is not a dimension"), proto se čte jako
// poslední (druhá) hodnota řádku a kontroluje se proti názvům oken.
const DATE_RANGES = [
  { startDate: '365daysAgo', endDate: 'today', name: 'views365' },
  { startDate: '30daysAgo', endDate: 'today', name: 'views30' },
] as const

export async function fetchPageViewsByFullSlug(): Promise<{
  viewsByFullSlug: Map<string, PageViews>
  /** Řádky bez rozpoznaného okna — diagnostika pro dryRun (změna chování GA4 API). */
  skippedRows: number
}> {
  const propertyId = process.env.GA4_PROPERTY_ID
  const credentialsJson = process.env.GA4_SERVICE_ACCOUNT_JSON
  if (!propertyId || !credentialsJson) {
    throw new APIError('GA4_PROPERTY_ID / GA4_SERVICE_ACCOUNT_JSON není nastaveno', 500)
  }

  const credentials = JSON.parse(credentialsJson)
  const client = new BetaAnalyticsDataClient({ credentials })

  const viewsByFullSlug = new Map<string, PageViews>()
  let skippedRows = 0
  const pageSize = 100_000
  let offset = 0

  // Defenzivní stránkování — v praxi má web řádově tisíce stránek (× 2 okna),
  // vejde se do jednoho requestu, ale nespoléháme na to napevno.
  for (;;) {
    const [response] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [...DATE_RANGES],
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }],
      limit: pageSize,
      offset,
    })

    for (const row of response.rows ?? []) {
      const pagePath = row.dimensionValues?.[0]?.value
      const range = row.dimensionValues?.[1]?.value
      const views = Number(row.metricValues?.[0]?.value ?? 0)
      if (!pagePath || !Number.isFinite(views)) continue
      if (range !== 'views365' && range !== 'views30') {
        skippedRows++
        continue
      }
      const fullSlug = normalizePagePath(pagePath)
      const entry = viewsByFullSlug.get(fullSlug) ?? { views365: 0, views30: 0 }
      entry[range] += views
      viewsByFullSlug.set(fullSlug, entry)
    }

    const rowCount = response.rowCount ?? response.rows?.length ?? 0
    offset += pageSize
    if (offset >= rowCount) break
  }

  // Pojistka proti tichému vynulování: zápis začíná resetem obou sloupců na 0,
  // takže prázdný výsledek (změna tvaru odpovědi GA4, jiný název dimenze okna)
  // by smazal čísla u všech stránek a cron by přitom skončil zeleně.
  if (viewsByFullSlug.size === 0) {
    throw new APIError(
      `GA4 nevrátilo žádný rozpoznaný řádek (přeskočeno ${skippedRows}) — zápis přeskočen`,
      500,
    )
  }

  return { viewsByFullSlug, skippedRows }
}

type DrizzleTx = { execute: (query: unknown) => Promise<unknown> }
type DrizzleLike = DrizzleTx & {
  transaction: <T>(fn: (tx: DrizzleTx) => Promise<T>) => Promise<T>
}

// Jeden hromadný UPDATE za dávku — ne dotaz na stránku. VĚDOMĚ mimo Payload
// Local API (bez hooků), aby noční sync nespustil revalidateTag pro každou
// z tisíců stránek; čerstvost čísel dorazí přes `revalidate: 300` v cached().
//
// Reset na 0 před zápisem: klouzavé okno (12 měsíců i 30 dní) se má samo opravit i
// směrem DOLŮ — stránka, co přestala být populární, nesmí si držet starou
// hodnotu navěky jen proto, že v aktuálním GA4 exportu nemá žádný řádek.
// Celé v jedné transakci, ať reset nezůstane bez re-apply při chybě uprostřed.
async function writePageViews(
  db: { drizzle: DrizzleLike },
  viewsByFullSlug: Map<string, PageViews>,
  batchSize = 500,
): Promise<{ pagesWithViews: number; pagesWithViews30d: number }> {
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

    await tx.execute(sql`UPDATE pages SET analytics_page_views = 0, analytics_page_views30d = 0`)

    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize)
      const values = sql.join(
        batch.map(
          ([fullSlug, { views365, views30 }]) =>
            sql`(${fullSlug}::text, ${views365}::int, ${views30}::int)`,
        ),
        sql`, `,
      )
      await tx.execute(sql`
        UPDATE pages AS p
        SET analytics_page_views = v.views_365, analytics_page_views30d = v.views_30
        FROM (VALUES ${values}) AS v(full_slug, views_365, views_30)
        WHERE p.full_slug = v.full_slug
      `)
    }

    // Admin formulář i čtení draftů berou hodnoty z POSLEDNÍ verze v `_pages_v`
    // (pole je v adminu jen ke čtení, ale formulář ho odesílá) — bez tohoto
    // zápisu by publikace stránky z rozpracovaného návrhu vrátila do `pages`
    // stará čísla a do dalšího syncu pokazila řazení i „Oblíbené". Jeden
    // UPDATE přes všechny stránky (nese i reset na 0). Stejný vzor jako
    // `version_affiliate_deals` v syncAffiliateDeals.ts.
    await tx.execute(sql`
      UPDATE _pages_v AS v
      SET version_analytics_page_views = p.analytics_page_views,
          version_analytics_page_views30d = p.analytics_page_views30d
      FROM pages AS p
      WHERE v.parent_id = p.id AND v.latest = true
    `)

    // Přesný počet stránek s nenulovou hodnotou PO zápisu — ne odhad z dávek
    // (ne každá GA4 cesta odpovídá reálné stránce, viz `/prihlaseni`, `/login`).
    const countResult = (await tx.execute(sql`
      SELECT
        count(*) FILTER (WHERE analytics_page_views > 0)::int AS pages_with_views,
        count(*) FILTER (WHERE analytics_page_views30d > 0)::int AS pages_with_views_30d
      FROM pages
    `)) as { rows: { pages_with_views: number; pages_with_views_30d: number }[] }
    return {
      pagesWithViews: countResult.rows[0]?.pages_with_views ?? 0,
      pagesWithViews30d: countResult.rows[0]?.pages_with_views_30d ?? 0,
    }
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

    const { viewsByFullSlug, skippedRows } = await fetchPageViewsByFullSlug()

    if (dryRun) {
      return Response.json({
        ok: true,
        dryRun: true,
        matchedPaths: viewsByFullSlug.size,
        skippedRows,
        sample: [...viewsByFullSlug.entries()].slice(0, 20),
      })
    }

    const db = req.payload.db as unknown as { drizzle: DrizzleLike }
    const counts = await writePageViews(db, viewsByFullSlug)

    // Zápis šel mimo hooky (viz writePageViews), takže cache homepage neví o
    // nových číslech — „Oblíbené" pod vyhledáváním invalidujeme ručně jedním
    // tagem. Řazení „Co vidět" na stránkách míst dál spoléhá na pojistku
    // `revalidate: 300` v cached(), tisíce tagů stránek se schválně nevolají.
    await safeRevalidate([HOMEPAGE_POPULAR_DESTINATIONS_TAG])

    return Response.json({ ok: true, matchedPaths: viewsByFullSlug.size, ...counts })
  },
}
