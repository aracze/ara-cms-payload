/**
 * Migrační skript: MySQL DB (HTML text) → Payload CMS (Lexical JSON)
 *
 * Prerekvizity (nainstalujte před spuštěním):
 *   pnpm add -D mysql2
 *
 * Konfigurace:
 *   Doplňte OLD_DB_* proměnné do .env nebo přímo níže v sekci KONFIGURACE
 *
 * Spuštění:
 *   pnpm migrate:pages -- --dry-run    # jen zobrazí co by udělal, nic se neuloží
 *   pnpm migrate:pages                 # skutečná migrace
 *   pnpm migrate:pages -- --limit=10   # migrace jen prvních 10 záznamů (pro test)
 */

import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

// 1. ENV musí být načten jako první
const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

import { getPayload } from 'payload'
import mysql from 'mysql2/promise'
import {
  convertHTMLToLexical,
  editorConfigFactory,
} from '@payloadcms/richtext-lexical'

// ─────────────────────────────────────────────────────────────────────────────
// KONFIGURACE — upravte nebo doplňte do .env
// ─────────────────────────────────────────────────────────────────────────────

const OLD_DB_CONFIG = {
  host:     process.env.OLD_DB_HOST     || 'localhost',
  port:     Number(process.env.OLD_DB_PORT || 3306),
  user:     process.env.OLD_DB_USER     || 'root',
  password: process.env.OLD_DB_PASSWORD || '',
  database: process.env.OLD_DB_NAME     || 'stara_databaze',
}

// ⚠️ DOPLŇTE: Název tabulky a sloupců ve starém MySQL DB
const OLD_TABLE   = 'destinations'   // tabulka s texty
const COL_ID      = 'id'
const COL_TITLE   = 'title'          // název stránky/destinace
const COL_SLUG    = 'slug'
const COL_HTML    = 'text'           // HTML obsah
// const COL_PLAIN = 'unformatted_text' // plain text (nepoužijeme, HTML stačí)

// ─────────────────────────────────────────────────────────────────────────────

// Parsování argumentů
const isDryRun = process.argv.includes('--dry-run')
const limitArg = process.argv.find((a) => a.startsWith('--limit='))
const limit    = limitArg ? parseInt(limitArg.split('=')[1]) : null

type OldRecord = {
  id: number
  title: string
  slug: string
  text: string
  [key: string]: unknown
}

/**
 * Stáhne záznamy ze starého MySQL DB
 */
async function fetchOldRecords(conn: mysql.Connection): Promise<OldRecord[]> {
  const limitClause = limit ? `LIMIT ${limit}` : ''
  const [rows] = await conn.execute<mysql.RowDataPacket[]>(
    `SELECT 
       \`${COL_ID}\`    AS id,
       \`${COL_TITLE}\` AS title,
       \`${COL_SLUG}\`  AS slug,
       \`${COL_HTML}\`  AS text
     FROM \`${OLD_TABLE}\`
     ORDER BY \`${COL_ID}\`
     ${limitClause}`,
  )
  return rows as OldRecord[]
}

/**
 * Převede HTML string na Lexical JSON.
 * Pokud HTML null/prázdné → vrátí prázdný Lexical dokument.
 * Pokud konverze selže → fallback na plain text odstavec.
 */
async function htmlToLexical(
  html: string | null | undefined,
  editorConfig: Awaited<ReturnType<typeof editorConfigFactory.default>>,
): Promise<object> {
  if (!html || html.trim() === '') {
    return emptyLexical()
  }

  try {
    return await convertHTMLToLexical({ html, editorConfig })
  } catch (err) {
    console.warn(`    ⚠️  HTML → Lexical selhalo, ukládám jako plain text. (${err})`)
    const plainText = html.replace(/<[^>]+>/g, '').trim()
    if (!plainText) return emptyLexical()
    return {
      root: {
        type: 'root', format: '', indent: 0, version: 1,
        children: [{
          type: 'paragraph', format: '', indent: 0, version: 1,
          children: [{ type: 'text', text: plainText, format: 0, style: '', mode: 'normal', detail: 0, version: 1 }],
        }],
      },
    }
  }
}

function emptyLexical(): object {
  return { root: { type: 'root', format: '', indent: 0, version: 1, children: [] } }
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🚀 Migrace spuštěna${isDryRun ? ' (DRY RUN — nic se neuloží)' : ''}`)
  if (limit) console.log(`   Limit: ${limit} záznamů`)
  console.log()

  // Připojení k MySQL
  const conn = await mysql.createConnection(OLD_DB_CONFIG)
  console.log(`✅ Připojeno k MySQL: ${OLD_DB_CONFIG.database}@${OLD_DB_CONFIG.host}`)

  // Inicializace Payload
  const config = (await import('../src/payload.config')).default
  const payload = await getPayload({ config })
  console.log('✅ Payload inicializován\n')

  // Příprava Lexical editor configu
  const editorConfig = await editorConfigFactory.default({ config: payload.config })

  // Načtení záznamů
  const records = await fetchOldRecords(conn)
  console.log(`📦 Nalezeno ${records.length} záznamů\n`)

  let created  = 0
  let updated  = 0
  let skipped  = 0
  let errCount = 0

  for (const [i, record] of records.entries()) {
    const progress = `[${i + 1}/${records.length}]`
    console.log(`${progress} "${record.title}" (slug: ${record.slug})`)

    // Zkontroluj zda záznam v Payload už existuje
    const existing = await payload.find({
      collection: 'pages',
      where: { slug: { equals: record.slug } },
      limit: 1,
    })

    // Převod HTML → Lexical JSON
    const lexicalText = await htmlToLexical(record.text, editorConfig)

    // ───────────────────────────────────────────────────────────────────────
    // ⚠️  UPRAVTE: Namapujte data na Payload pole
    //     Přidejte další pole podle vaší kolekce (category, parent, atd.)
    // ───────────────────────────────────────────────────────────────────────
    const pageData = {
      title: String(record.title || '').substring(0, 255),
      slug:  String(record.slug  || '').substring(0, 255),
      text:  lexicalText,
      // category: mapCategory(record.category),
      // parent: null,
    }

    if (isDryRun) {
      const action = existing.totalDocs > 0 ? 'UPDATE' : 'CREATE'
      console.log(`    📋 DRY RUN [${action}]: "${record.title}"`)
      skipped++
      continue
    }

    try {
      if (existing.totalDocs > 0) {
        await payload.update({
          collection: 'pages',
          id: existing.docs[0].id,
          data: pageData,
        })
        console.log(`    ✅ Aktualizováno (Payload ID: ${existing.docs[0].id})`)
        updated++
      } else {
        const doc = await payload.create({
          collection: 'pages',
          data: pageData,
        })
        console.log(`    ✅ Vytvořeno (Payload ID: ${doc.id})`)
        created++
      }
    } catch (err) {
      console.error(`    ❌ Chyba:`, err)
      errCount++
    }
  }

  await conn.end()

  console.log('\n══════════════════════════════════════════')
  console.log('📊 Výsledky migrace:')
  console.log(`   Vytvořeno:     ${created}`)
  console.log(`   Aktualizováno: ${updated}`)
  console.log(`   Přeskočeno:    ${skipped}  (dry-run)`)
  console.log(`   Chyby:         ${errCount}`)
  console.log('══════════════════════════════════════════\n')

  process.exit(errCount > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('\n💥 Fatální chyba:', err)
  process.exit(1)
})
