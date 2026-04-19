/**
 * Migrační skript: MySQL DB (HTML text) → Payload CMS (Lexical JSON)
 *
 * Prerekvizity (nainstalujte před spuštěním):
 *   pnpm add -D mysql2
 *
 * Spuštění:
 *   pnpm migrate:pages -- --dry-run
 *   pnpm migrate:pages
 *   pnpm migrate:pages -- --limit=10
 */

import 'dotenv/config'
import mysql from 'mysql2/promise'
import { getPayload } from 'payload'
import { convertHTMLToLexical } from '@payloadcms/richtext-lexical'
// @ts-ignore
import { JSDOM } from 'jsdom'
import configPromise from '../src/payload.config.js'

// ─────────────────────────────────────────────────────────────────────────────
// KONFIGURACE
// ─────────────────────────────────────────────────────────────────────────────

const OLD_DB_CONFIG = {
  host: process.env.OLD_DB_HOST || 'localhost',
  port: Number(process.env.OLD_DB_PORT || 3306),
  user: process.env.OLD_DB_USER || 'root',
  password: process.env.OLD_DB_PASSWORD || '',
  database: process.env.OLD_DB_NAME || 'cms',
}

// ⚠️ Názvy tabulek a sloupců ze staré DB
const OLD_TABLE = 'destinations' // Vráceno na původní hodnotu
const COL_ID = 'id'
const COL_TITLE = 'title'
const COL_SLUG = 'slug'
const COL_HTML = 'text'

// ─────────────────────────────────────────────────────────────────────────────

const isDryRun = process.argv.includes('--dry-run')
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='))
const limit = limitArg ? Number(limitArg.split('=')[1]) : null

type OldRecord = {
  id: number
  title: string
  slug: string
  text: string
  [key: string]: unknown
}

async function fetchOldRecords(conn: mysql.Connection): Promise<OldRecord[]> {
  const limitClause = limit && Number.isFinite(limit) ? `LIMIT ${limit}` : ''
  const query = `
    SELECT 
      \`${COL_ID}\`    AS id,
      \`${COL_TITLE}\` AS title,
      \`${COL_SLUG}\`  AS slug,
      \`${COL_HTML}\`  AS text
    FROM \`${OLD_TABLE}\`
    ORDER BY \`${COL_ID}\`
    ${limitClause}
  `
  const [rows] = await conn.execute<mysql.RowDataPacket[]>(query)
  return rows as OldRecord[]
}

async function htmlToLexical(html: string | null | undefined, payload: any): Promise<object> {
  if (!html || html.trim() === '') {
    return emptyLexical()
  }

  try {
    // V Payload 3 lze editor config získat přímo z nabootovaného payloadu
    const editorConfig = await payload.config.editor({ config: payload.config })
    return await convertHTMLToLexical({ html, editorConfig, JSDOM })
  } catch (err) {
    console.warn(`    ⚠️  HTML → Lexical selhalo, ukládám jako plain text. (${err})`)
    const plainText = html.replace(/<[^>]+>/g, '').trim()
    if (!plainText) return emptyLexical()
    return {
      root: {
        type: 'root',
        format: '',
        indent: 0,
        version: 1,
        children: [
          {
            type: 'paragraph',
            format: '',
            indent: 0,
            version: 1,
            children: [
              {
                type: 'text',
                text: plainText,
                format: 0,
                style: '',
                mode: 'normal',
                detail: 0,
                version: 1,
              },
            ],
          },
        ],
      },
    }
  }
}

function emptyLexical(): object {
  return { root: { type: 'root', format: '', indent: 0, version: 1, children: [] } }
}

// ─────────────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\n🚀 Migrace pages spuštěna${isDryRun ? ' (DRY RUN)' : ''}`)
  if (limit) console.log(`   Limit: ${limit}`)

  const conn = await mysql.createConnection(OLD_DB_CONFIG)
  console.log(`✅ Připojeno k MySQL: ${OLD_DB_CONFIG.database}@${OLD_DB_CONFIG.host}`)

  // @ts-ignore
  const payload = await getPayload({ config: configPromise })
  console.log('✅ Payload inicializován')

  const records = await fetchOldRecords(conn)
  console.log(`📦 Nalezeno ${records.length} záznamů v tabulce \`${OLD_TABLE}\`\n`)

  let created = 0
  let updated = 0
  let skippedDryRun = 0
  let errors = 0

  for (const [index, record] of records.entries()) {
    const progress = `[${index + 1}/${records.length}]`

    // Zkontroluj zda záznam v Payload už existuje
    const existing = await payload.find({
      collection: 'pages',
      where: { slug: { equals: record.slug } },
      depth: 0,
      limit: 1,
    })

    if (isDryRun) {
      const action = existing.totalDocs > 0 ? 'UPDATE' : 'CREATE'
      console.log(`${progress} 📋 DRY RUN [${action}] "${record.title}" (slug: ${record.slug})`)
      skippedDryRun++
      continue
    }

    try {
      // Převod HTML → Lexical JSON
      const lexicalText = await htmlToLexical(record.text, payload)

      const pageData = {
        title: String(record.title || '').substring(0, 255),
        slug: String(record.slug || '').substring(0, 255),
        text: lexicalText,
        category: 'Místa', // Povinné pole v Pages.ts
      }

      if (existing.totalDocs > 0) {
        await payload.update({
          collection: 'pages',
          id: existing.docs[0].id,
          data: pageData,
          overrideAccess: true,
        })
        console.log(`${progress} ✅ Aktualizováno: "${record.title}"`)
        updated++
      } else {
        await payload.create({
          collection: 'pages',
          data: pageData,
          overrideAccess: true,
        })
        console.log(`${progress} ✅ Vytvořeno: "${record.title}"`)
        created++
      }
    } catch (err) {
      console.error(`${progress} ❌ Chyba u "${record.title}":`, err)
      errors++
    }
  }

  await conn.end()

  console.log('\n══════════════════════════════════════════')
  console.log('📊 Výsledky migrace pages:')
  console.log(`   Vytvořeno:            ${created}`)
  console.log(`   Aktualizováno:        ${updated}`)
  console.log(`   Přeskočeno (dry-run): ${skippedDryRun}`)
  console.log(`   Chyby:                ${errors}`)
  console.log('══════════════════════════════════════════\n')

  process.exit(errors > 0 ? 1 : 0)
}

run().catch((error) => {
  console.error('💥 Fatální chyba migrace pages:', error)
  process.exit(1)
})
