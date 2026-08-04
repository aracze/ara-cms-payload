/**
 * Jednorázový doběh: doplní PŮVODNÍ datum vytvoření stránek ze staré MySQL
 * (page.date_created) do pages.created_at podle legacy_page_id.
 *
 * PROČ: migrace nastavila created_at na čas importu, takže homepage sekce
 * „Co je nového" by u všech migrovaných míst ukazovala datum migrace místo
 * skutečného stáří („před 2 lety" jako na starém webu).
 *
 * Záměrně PŘÍMÉ SQL (payload.db.pool), NE Local API update:
 * - nesmí se změnit updated_at (sitemap lastmod, řazení dle úprav),
 * - nesmí vzniknout nové verze dokumentů ani běžet hooky/revalidace.
 * Aktualizují se i kopie v _pages_v.version_created_at (historie verzí).
 *
 * Zároveň vygeneruje scripts/prod-page-created-dates.sql se stejnými změnami
 * pro ruční aplikaci na produkci (psql v kontejneru, vzor prod-comments-parent.sql).
 *
 * Idempotentní. Spuštění: pnpm backfill:page-dates [-- --dry-run]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'
import { getPayload } from 'payload'
import config from '../src/payload.config'

const DRY_RUN = process.argv.includes('--dry-run')
const dirname = path.dirname(fileURLToPath(import.meta.url))

const payload = await getPayload({ config })
// Postgres pool adaptéru — vědomě mimo veřejné typy (viz komentář v hlavičce).
type PgQuery = (
  q: string,
  p?: unknown[],
) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>
const pool = (
  payload.db as unknown as {
    pool: { query: PgQuery; connect: () => Promise<{ query: PgQuery; release: () => void }> }
  }
).pool

const conn = await mysql.createConnection({
  host: process.env.OLD_DB_HOST || 'localhost',
  port: Number(process.env.OLD_DB_PORT || 3306),
  user: process.env.OLD_DB_USER || 'root',
  password: process.env.OLD_DB_PASSWORD || '',
  database: process.env.OLD_DB_NAME || 'cms',
})
const [rows] = await conn.query('SELECT id, date_created FROM page WHERE date_created IS NOT NULL')
await conn.end()

const legacy = (rows as { id: number; date_created: Date }[]).map((r) => ({
  id: r.id,
  iso: r.date_created.toISOString(),
}))
console.log(`Stará DB: ${legacy.length} stránek s date_created`)

const ids = legacy.map((l) => l.id)
const dates = legacy.map((l) => l.iso)

// Kolik migrovaných stránek na data čeká (a kolik legacy záznamů nemá protějšek)?
const matched = await pool.query(
  `SELECT count(*)::int AS n FROM pages WHERE legacy_page_id = ANY($1::int[])`,
  [ids],
)
const already = await pool.query(
  `SELECT count(*)::int AS n
   FROM pages p
   JOIN (SELECT unnest($1::int[]) AS lid, unnest($2::timestamptz[]) AS dc) d ON p.legacy_page_id = d.lid
   WHERE p.created_at = d.dc`,
  [ids, dates],
)
console.log(
  `Postgres: ${matched.rows[0].n} stránek se páruje přes legacy_page_id, z toho ${already.rows[0].n} už má správné datum`,
)

if (DRY_RUN) {
  console.log('DRY RUN — nic se nezapisuje.')
  process.exit(0)
}

// Transakce MUSÍ běžet na JEDNOM spojení — pool.query si pro každý příkaz
// půjčuje libovolné spojení z poolu, takže BEGIN/UPDATE/COMMIT by se mohly
// rozjet na různá spojení a atomicita by byla iluze.
const client = await pool.connect()
try {
  await client.query('BEGIN')
  const updPages = await client.query(
    `UPDATE pages p SET created_at = d.dc
     FROM (SELECT unnest($1::int[]) AS lid, unnest($2::timestamptz[]) AS dc) d
     WHERE p.legacy_page_id = d.lid AND p.created_at IS DISTINCT FROM d.dc`,
    [ids, dates],
  )
  const updVersions = await client.query(
    `UPDATE _pages_v v SET version_created_at = d.dc
     FROM (SELECT unnest($1::int[]) AS lid, unnest($2::timestamptz[]) AS dc) d
     JOIN pages p ON p.legacy_page_id = d.lid
     WHERE v.parent_id = p.id AND v.version_created_at IS DISTINCT FROM d.dc`,
    [ids, dates],
  )
  await client.query('COMMIT')
  console.log(`Hotovo: pages ${updPages.rowCount} řádků, _pages_v ${updVersions.rowCount} řádků.`)
} catch (err) {
  await client.query('ROLLBACK')
  throw err
} finally {
  client.release()
}

// SQL pro produkci — stejné změny, aplikují se ručně přes psql na serveru.
const values = legacy.map((l) => `(${l.id}, '${l.iso}'::timestamptz)`).join(',\n')
const prodSql = `-- Doplnění původního data vytvoření stránek ze staré MySQL (viz
-- scripts/backfill-page-created-dates.ts). Idempotentní; spustit JEDNOU na
-- produkci (ON_ERROR_STOP: při chybě skončit s nenulovým kódem, ne tiše
-- pokračovat): docker compose exec -T db psql -U postgres -d aracze \\
--   -v ON_ERROR_STOP=1 < tento-soubor
BEGIN;
CREATE TEMP TABLE legacy_dates (lid int, dc timestamptz) ON COMMIT DROP;
INSERT INTO legacy_dates (lid, dc) VALUES
${values};
UPDATE pages p SET created_at = d.dc FROM legacy_dates d
  WHERE p.legacy_page_id = d.lid AND p.created_at IS DISTINCT FROM d.dc;
UPDATE _pages_v v SET version_created_at = d.dc FROM legacy_dates d
  JOIN pages p ON p.legacy_page_id = d.lid
  WHERE v.parent_id = p.id AND v.version_created_at IS DISTINCT FROM d.dc;
COMMIT;
`
const sqlPath = path.resolve(dirname, 'prod-page-created-dates.sql')
fs.writeFileSync(sqlPath, prodSql)
console.log(`SQL pro produkci: ${sqlPath}`)

process.exit(0)
