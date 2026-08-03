/**
 * Jednorázový převod: jméno + příjmení → jedno pole `name`.
 *
 * PROČ: dvojice se nikde v aplikaci nepoužívala zvlášť (všech pět míst, kde se
 * jméno zobrazuje, ji zase slepilo dohromady) a jména se na dvě kolonky
 * spolehlivě nedělí — dvě příjmení, jen jedno jméno, tituly, jinde ve světě
 * příjmení první.
 *
 * ČTE PŘÍMO Z DATABÁZE, ne přes Payload. Pole `firstName`/`lastName` už
 * v konfiguraci kolekce NEJSOU (byla odstraněna spolu s tímhle převodem),
 * takže `payload.find` by je nevrátil — a skript by tiše prohlásil, že není co
 * převádět. Pak by se sloupce zahodily i s daty.
 *
 * Skript je IDEMPOTENTNÍ a NIC NEMAŽE: staré sloupce zůstávají, zahazují se
 * zvlášť až po kontrole. Když už v databázi nejsou, skript to řekne a skončí.
 *
 * Spouští se přes `pnpm migrate:user-name`.
 */
import { getPayload } from 'payload'
import config from '../src/payload.config'

const payload = await getPayload({ config })
// Spojení z Payloadu (node-postgres). Přes `drizzle` to nejde — balík se
// z ESM skriptu nenaimportuje.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pool = (payload.db as any).pool as { query: (t: string) => Promise<{ rows: unknown[] }> }

type Radek = { id: number; first_name: string | null; last_name: string | null }

const sloupce = (
  await pool.query(
    `select column_name from information_schema.columns
     where table_name = 'users' and column_name in ('first_name', 'last_name')`,
  )
).rows

if (sloupce.length === 0) {
  console.log('Sloupce first_name/last_name v databázi nejsou — převod už proběhl. Nic k práci.')
  process.exit(0)
}

const kprevodu = (
  await pool.query(
    `select id, first_name, last_name from users
     where (name is null or btrim(name) = '')
       and (btrim(coalesce(first_name, '')) <> '' or btrim(coalesce(last_name, '')) <> '')`,
  )
).rows as Radek[]

console.log(`K převodu: ${kprevodu.length} účtů`)

let prevedeno = 0
let chyby = 0

for (const r of kprevodu) {
  // `trim` na obou částech i na výsledku: v datech byl záznam „Veronika "
  // s mezerou na konci, bez ořezu by vzniklo jméno se dvěma mezerami.
  const cele = [r.first_name?.trim(), r.last_name?.trim()].filter(Boolean).join(' ').trim()
  if (!cele) continue
  try {
    // Zápis přes Payload (ne SQL), ať proběhnou hooky včetně invalidace profilu.
    await payload.update({
      collection: 'users',
      id: r.id,
      data: { name: cele },
      overrideAccess: true,
    })
    prevedeno++
  } catch (err) {
    chyby++
    console.error(`✗ účet #${r.id}:`, err instanceof Error ? err.message : err)
  }
}

// Do logu jdou jen počty. Jména jednotlivých lidí jsou osobní údaj a nasazovací
// výpisy se uchovávají dlouho a čte je kdekdo.
console.log(`Hotovo: převedeno ${prevedeno}, chyb ${chyby}`)
console.log('Staré sloupce zůstávají — zahoď je až po kontrole (viz README).')
process.exit(chyby > 0 ? 1 : 0)
