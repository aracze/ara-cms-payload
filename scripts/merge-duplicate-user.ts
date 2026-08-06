/**
 * Sloučení dvou účtů JEDNOHO člověka do jednoho.
 *
 * PROČ: jeden ze spoluautorů měl na webu dva účty — starší z legacy migrace
 * a novější s vyplněným jménem, medailonkem a fotkou. Jeho práce se tím dělila
 * na dvě hromádky, takže v sekci „Náš tým" na stránce O nás vypadal jako někdo,
 * kdo skoro nic nenapsal.
 *
 * Do KOMENTÁŘŮ ANI DO KÓDU nepiš e-mailové adresy účtů — repozitář je veřejný.
 * Který účet se ponechává, říkají `KEEP_USERNAME`/`DROP_USERNAME` níž
 * (uživatelská jména jsou veřejná, jsou z nich adresy profilů), e-maily si
 * skript sám vypíše z databáze při běhu.
 *
 * CO DĚLÁ:
 *  1. do PONECHANÉHO účtu doplní jméno, medailonek a avatar ze RUŠENÉHO
 *     (jen tam, kde rušený účet má vyplněno — nic se nepřepisuje na prázdno),
 *  2. přepíše autorství veškerého obsahu rušeného účtu na ponechaný
 *     (stránky, jejich verze, články, komentáře a recenze, transakce)
 *     a předá mu i vlastnictví jeho avataru,
 *  3. rušený účet smaže (přihlašovací e-mail zaniká — zůstává ten ponechaný).
 *
 * PROČ PŘÍMÝM SQL a ne Local API: `payload.update` nad publikovanou stránkou
 * zakládá novou verzi a mění `updatedAt`, takže by 27 přepsaných autorství
 * nafouklo historii a posunulo data úprav. Autorství je přitom jediný sloupec,
 * který se mění.
 *
 * BEZPEČNOSTNÍ POJISTKA: seznam tabulek s autorstvím je vypsaný ručně, ale
 * skript si ho na začátku ověří proti skutečným cizím klíčům v databázi.
 * Kdyby Payload přidal další odkaz na uživatele (nová kolekce s `createdBy`),
 * skript se zastaví s chybou místo toho, aby data tiše osiřela.
 *
 * Běh je v JEDNÉ transakci — buď projde všechno, nebo nic.
 *
 * SPUŠTĚNÍ:
 *   pnpm merge:duplicate-user            → jen vypíše, co by se stalo
 *   pnpm merge:duplicate-user -- --apply → provede
 *
 * Skript je IDEMPOTENTNÍ: když rušený účet neexistuje, jen to oznámí a skončí.
 * Na PRODUKCI se pouští zvlášť (a po přímém zápisu do DB je potřeba
 * `docker compose up -d --force-recreate cms`, aby appka zapomněla cache).
 */
import { getPayload } from 'payload'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres/drizzle'
import config from '../src/payload.config'

/** Účet, který zůstane (jeho username i e-mail se nemění). */
const KEEP_USERNAME = 'lojzatran'
/** Účet, který se do něj vlije a zanikne. */
const DROP_USERNAME = 'lojza.ibg'

/**
 * Kde všude se drží autorství obsahu — sloupce, které se přepisují na
 * ponechaný účet. Ověřuje se proti cizím klíčům, viz assertCoversAllReferences.
 */
const AUTHORSHIP_COLUMNS: { table: string; column: string; label: string }[] = [
  { table: 'pages', column: 'created_by_id', label: 'stránky' },
  { table: '_pages_v', column: 'version_created_by_id', label: 'verze stránek' },
  { table: 'articles', column: 'created_by_id', label: 'články' },
  { table: 'comments', column: 'author_id', label: 'komentáře a recenze' },
  { table: 'transactions', column: 'user_id', label: 'transakce' },
  { table: 'avatars', column: 'owner_id', label: 'vlastnictví avataru' },
]

/**
 * Sloupce, které nejsou odkazem na uživatele „zvenčí", ale ČÁSTÍ jeho účtu —
 * role, přihlášená sezení a interní stav administrace. Ty se nepřepisují;
 * zmizí s účtem (mají `ON DELETE cascade`). Přepsat je by ponechanému účtu
 * duplikovalo role a přenášelo cizí sezení.
 */
const ACCOUNT_OWNED_COLUMNS: { table: string; column: string }[] = [
  { table: 'users_roles', column: 'parent_id' },
  { table: 'users_sessions', column: '_parent_id' },
  { table: 'payload_locked_documents_rels', column: 'users_id' },
  { table: 'payload_preferences_rels', column: 'users_id' },
]

type UserRow = {
  id: number
  username: string
  email: string
  name: string | null
  description: string | null
  avatar_id: number | null
}

const apply = process.argv.includes('--apply')

const payload = await getPayload({ config })
const db = payload.db as unknown as PostgresAdapter
const drizzle = db.drizzle as unknown as {
  execute: (query: unknown) => Promise<{ rows: Record<string, unknown>[] }>
  transaction: <T>(fn: (tx: typeof drizzle) => Promise<T>) => Promise<T>
}

const rows = (
  await drizzle.execute(sql`
    select id, username, email, name, description, avatar_id
    from users
    where username in (${KEEP_USERNAME}, ${DROP_USERNAME})
  `)
).rows as unknown as UserRow[]

const keep = rows.find((r) => r.username === KEEP_USERNAME)
const drop = rows.find((r) => r.username === DROP_USERNAME)

if (!keep) {
  console.error(`CHYBA: ponechávaný účet „${KEEP_USERNAME}" v databázi není.`)
  process.exit(1)
}
if (!drop) {
  console.log(`Účet „${DROP_USERNAME}" už neexistuje — nic ke slučování.`)
  process.exit(0)
}

/**
 * Pojistka: KAŽDÝ cizí klíč na `users` musí být zařazený — buď jako autorství
 * (přepíše se), nebo jako část účtu (zmizí s ním). Cokoli nezařazeného skript
 * zastaví.
 *
 * ZÁMĚRNĚ se nefiltruje podle `delete_rule`. Dnes platí, že autorství má
 * SET NULL a části účtu CASCADE, ale spoléhat na to je past: kdyby nová kolekce
 * dostala `createdBy` s `ON DELETE cascade`, filtr na SET NULL by ji přeskočil,
 * skript by ji nepřepsal — a mazání účtu na konci by ten obsah smazalo s ním.
 * Pravidlo se proto jen vypisuje pro kontrolu, nerozhoduje.
 */
async function assertCoversAllReferences(): Promise<void> {
  const fks = (
    await drizzle.execute(sql`
      select tc.table_name, kcu.column_name, rc.delete_rule
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on kcu.constraint_name = tc.constraint_name
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_name = tc.constraint_name
      join information_schema.referential_constraints rc
        on rc.constraint_name = tc.constraint_name
      where tc.constraint_type = 'FOREIGN KEY'
        and ccu.table_name = 'users'
    `)
  ).rows as unknown as { table_name: string; column_name: string; delete_rule: string }[]

  const classified = new Set(
    [...AUTHORSHIP_COLUMNS, ...ACCOUNT_OWNED_COLUMNS].map((c) => `${c.table}.${c.column}`),
  )
  const unknown = fks.filter((fk) => !classified.has(`${fk.table_name}.${fk.column_name}`))

  if (unknown.length > 0) {
    console.error(
      'CHYBA: na uživatele odkazují sloupce, které skript nezná:\n' +
        unknown
          .map((fk) => `  ${fk.table_name}.${fk.column_name} (ON DELETE ${fk.delete_rule})`)
          .join('\n') +
        '\n\nZařaď každý z nich a spusť znovu:\n' +
        '  · drží autorství nebo vlastnictví obsahu → AUTHORSHIP_COLUMNS (přepíše se)\n' +
        '  · je součástí účtu (role, sezení, stav adminu) → ACCOUNT_OWNED_COLUMNS (zmizí s účtem)\n' +
        'Nezařazený sloupec by se při mazání účtu buď vynuloval, nebo smazal spolu s ním.',
    )
    process.exit(1)
  }
}

await assertCoversAllReferences()

// ── Plán ────────────────────────────────────────────────────────────────────

console.log(`ponechat: #${keep.id} ${keep.username} <${keep.email}>`)
console.log(`zrušit:   #${drop.id} ${drop.username} <${drop.email}>`)
console.log('')

const profileUpdates: string[] = []
if (drop.name && drop.name !== keep.name) {
  profileUpdates.push(`jméno: ${keep.name ?? '(prázdné)'} → ${drop.name}`)
}
if (drop.description && drop.description !== keep.description) {
  profileUpdates.push(`medailonek: ${keep.description ?? '(prázdný)'} → ${drop.description}`)
}
if (drop.avatar_id && drop.avatar_id !== keep.avatar_id) {
  profileUpdates.push(`avatar: ${keep.avatar_id ?? '(žádný)'} → ${drop.avatar_id}`)
}
console.log(
  profileUpdates.length > 0
    ? 'profil:\n  ' + profileUpdates.join('\n  ')
    : 'profil: není co doplnit',
)

console.log('')
for (const { table, column, label } of AUTHORSHIP_COLUMNS) {
  const res = await drizzle.execute(
    sql`select count(*)::int as n from ${sql.identifier(table)} where ${sql.identifier(column)} = ${drop.id}`,
  )
  const n = Number((res.rows[0] as { n: number }).n)
  console.log(`${label}: ${n} → přepsat na #${keep.id}`)
}

if (!apply) {
  console.log('\nZKUŠEBNÍ BĚH — nic se nezměnilo. Provedeš to přidáním --apply.')
  process.exit(0)
}

// ── Provedení ───────────────────────────────────────────────────────────────

await drizzle.transaction(async (tx) => {
  // Oba účty načteme ZNOVU a se zámkem. Plán výše se čte mimo transakci, takže
  // mezi výpisem a zápisem může kdokoli v adminu účet upravit nebo smazat —
  // pak by se přenesla stará hodnota jména či avataru a skript by přesto
  // ohlásil úspěch. `FOR UPDATE` řádky do konce transakce zamkne a hodnoty pro
  // sloučení se berou až z nich.
  const locked = (
    await tx.execute(sql`
      select id, username, email, name, description, avatar_id
      from users
      where username in (${KEEP_USERNAME}, ${DROP_USERNAME})
      order by id
      for update
    `)
  ).rows as unknown as UserRow[]

  const keepLocked = locked.find((r) => r.username === KEEP_USERNAME)
  const dropLocked = locked.find((r) => r.username === DROP_USERNAME)

  // Vyhozená chyba transakci vrátí zpět, takže se nezapíše nic.
  if (!keepLocked || !dropLocked) {
    throw new Error(
      'Účty se mezitím změnily: ' +
        (!keepLocked ? `„${KEEP_USERNAME}" už neexistuje. ` : '') +
        (!dropLocked ? `„${DROP_USERNAME}" už neexistuje. ` : '') +
        'Nic se nezměnilo — spusť skript znovu a zkontroluj plán.',
    )
  }
  if (keepLocked.id !== keep.id || dropLocked.id !== drop.id) {
    throw new Error(
      'Účty se mezitím změnily (jiná ID než ve vypsaném plánu). Nic se nezměnilo — spusť skript znovu.',
    )
  }

  for (const { table, column } of AUTHORSHIP_COLUMNS) {
    await tx.execute(
      sql`update ${sql.identifier(table)} set ${sql.identifier(column)} = ${keepLocked.id} where ${sql.identifier(column)} = ${dropLocked.id}`,
    )
  }

  // COALESCE zachová hodnotu rušeného účtu jen když je vyplněná — prázdné pole
  // by ponechanému účtu nemělo přepsat to, co už má.
  await tx.execute(sql`
    update users set
      name = coalesce(nullif(${dropLocked.name ?? null}, ''), name),
      description = coalesce(nullif(${dropLocked.description ?? null}, ''), description),
      avatar_id = coalesce(${dropLocked.avatar_id ?? null}, avatar_id),
      updated_at = now()
    where id = ${keepLocked.id}
  `)

  await tx.execute(sql`delete from users where id = ${dropLocked.id}`)
})

console.log(`\nHOTOVO: účet #${drop.id} ${drop.username} sloučen do #${keep.id} ${keep.username}.`)
console.log('Profil na /profil/' + DROP_USERNAME + ' od teď vrací 404 — což je správně.')

process.exit(0)
