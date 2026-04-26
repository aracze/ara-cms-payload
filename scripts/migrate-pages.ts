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
import { getPayload, type Payload } from 'payload'
import { convertHTMLToLexical, editorConfigFactory } from '@payloadcms/richtext-lexical'
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
const OLD_TABLE = 'page' // Správný název tabulky
const COL_ID = 'id'
const COL_TITLE = 'title'
const COL_SLUG = 'unique_url' // v db to je unique_url
const COL_HTML = 'text'

// ─────────────────────────────────────────────────────────────────────────────

const isDryRun = process.argv.includes('--dry-run')
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='))
let limit: number | null = null
if (limitArg) {
  const parsed = parseInt(limitArg.split('=')[1], 10)
  if (!isNaN(parsed) && parsed > 0) {
    limit = parsed
  }
}

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
      \`${COL_HTML}\`  AS text,
      \`zoom_level\`,
      \`google_map_search_phrase\`,
      \`lat\` AS latitude,
      \`lng\` AS longitude,
      \`page_category\`,
      \`parent_id\`,
      \`created_by_id\`,
      \`meta_description\`,
      \`meta_title\`,
      \`stop_place_to_visit_propagate_here\`,
      \`czech2nd_case\`,
      \`czech6th_case\`,
      \`timezone_name\`,
      \`currency_name\`,
      \`display_weather_overview\`,
      \`affiliate_second_item\`,
      \`affiliate_third_item\`,
      \`affiliate_fourth_item\`,
      \`affiliate_kiwi_fly_to\`,
      \`main_image_css\`,
      \`main_image_name\`
    FROM \`${OLD_TABLE}\`
    WHERE \`${COL_ID}\` = 4495
    ORDER BY \`${COL_ID}\`
    ${limitClause}
  `
  const [rows] = await conn.execute<mysql.RowDataPacket[]>(query)
  return rows as OldRecord[]
}

async function htmlToLexical(html: string | null | undefined, payload: Payload): Promise<object> {
  if (!html || html.trim() === '') {
    return emptyLexical()
  }

  try {
    // Pomocí JSDOM očistíme HTML o anchor odkazy a prázdné odkazy, které zlobí v Lexicalu
    const dom = new JSDOM(html)
    const doc = dom.window.document

    const anchors = doc.querySelectorAll('a[href^="#"], a[name]')
    anchors.forEach((a: any) => {
      const parent = a.parentNode
      if (parent) {
        while (a.firstChild) {
          parent.insertBefore(a.firstChild, a)
        }
        parent.removeChild(a)
      }
    })

    const emptyLinks = doc.querySelectorAll('a:not([href]), a[href=""]')
    emptyLinks.forEach((a: any) => {
      const parent = a.parentNode
      if (parent) {
        while (a.firstChild) {
          parent.insertBefore(a.firstChild, a)
        }
        parent.removeChild(a)
      }
    })

    const cleanedHtml = doc.body.innerHTML

    // @ts-ignore
    const editorConfig = await editorConfigFactory.default({ config: payload.config })
    return await convertHTMLToLexical({ html: cleanedHtml, editorConfig, JSDOM })
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

  let conn
  try {
    conn = await mysql.createConnection(OLD_DB_CONFIG)
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

      // Zkontroluj zda záznam v Payload už existuje podle legacyPageId
      const existing = await payload.find({
        collection: 'pages',
        where: { legacyPageId: { equals: record.id } },
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
        // Zpracování vztahu uživatele (createdBy) přes legacyUserId
        let createdByUserId = undefined
        if (record.created_by_id) {
          const legacyIdNum = Number(record.created_by_id)
          const userQuery = await payload.find({
            collection: 'users',
            where: { legacyUserId: { equals: legacyIdNum } },
            limit: 1,
            depth: 0,
          })
          if (userQuery.totalDocs > 0) {
            createdByUserId = userQuery.docs[0].id
            console.log(
              `   [DEBUG] Nalezen uživatel s legacy ID ${legacyIdNum} -> payload ID: ${createdByUserId}`,
            )
          } else {
            console.warn(
              `   [DEBUG] Uživatel s legacy ID ${legacyIdNum} NEBYL NALEZEN v Payload CMS!`,
            )
          }
        }

        // Zpracování nadřazené stránky (parent) podle parent_id
        let parentId = undefined
        let parentSlug = undefined
        if (record.parent_id) {
          const legacyParentIdNum = Number(record.parent_id)
          const parentQuery = await payload.find({
            collection: 'pages',
            where: { legacyPageId: { equals: legacyParentIdNum } },
            limit: 1,
            depth: 0,
          })
          if (parentQuery.totalDocs > 0) {
            parentId = parentQuery.docs[0].id
            parentSlug = parentQuery.docs[0].slug as string
            console.log(
              `   [DEBUG] Nalezena nadřazená stránka s legacy ID ${legacyParentIdNum} -> payload ID: ${parentId} (slug: ${parentSlug})`,
            )
          } else {
            console.warn(
              `   [DEBUG] Nadřazená stránka s legacy ID ${legacyParentIdNum} NEBYLA NALEZENA v Payload CMS!`,
            )
          }
        }

        // Zpracování vztahu obrázku (featuredImage) podle filename nebo cloudinaryPublicId
        let featuredImageId = undefined
        if (record.main_image_name) {
          const imageName = String(record.main_image_name)
          const imageNameWithoutExt = imageName.includes('.')
            ? imageName.split('.').slice(0, -1).join('.')
            : imageName

          const mediaQuery = await payload.find({
            collection: 'media',
            where: {
              or: [
                { filename: { contains: imageName } },
                { cloudinaryPublicId: { equals: imageNameWithoutExt } },
                { cloudinaryPublicId: { equals: imageName } },
              ],
            },
            limit: 1,
            depth: 0,
          })

          if (mediaQuery.totalDocs > 0) {
            featuredImageId = mediaQuery.docs[0].id
            console.log(
              `   [DEBUG] Nalezen obrázek ${record.main_image_name} -> payload ID: ${featuredImageId}`,
            )
          } else {
            console.warn(
              `   [DEBUG] Obrázek ${record.main_image_name} NEBYL NALEZEN v Payload CMS!`,
            )
          }
        }

        // Převod HTML → Lexical JSON
        const lexicalText = await htmlToLexical(record.text, payload)

        const categoryMap: Record<string, string> = {
          PLACE_TO_VISIT: 'Místo k navštívení',
          TOURIST_POINT: 'Turistický cíl',
          DESTINATION_LIST: 'Místa',
          PRACTICAL_INFORMATION: 'Praktické informace',
          ENTRY_REQUIREMENTS: 'Vstupní podmínky',
          GETTING_THERE: 'Cesta',
          WEATHER: 'Počasí',
          TRANSPORT: 'Doprava',
          CURRENCY_AND_PRICES: 'Měna a ceny',
          HEALTH_AND_SAFETY: 'Zdraví a bezpečí',
          LANGUAGE_AND_CULTURE: 'Jazyk a kultura',
          FOOD_AND_DRINKS: 'Jídlo a pití',
          ACCOMMODATION: 'Ubytování',
          ARTICLE_LIST: 'Články',
          INSPIRATION: 'Články',
        }

        // Příprava slugu (vzetí části za posledním lomítkem nebo očištění od prefixu rodiče)
        let slug = String(record.slug || '').substring(0, 255)

        if (slug.includes('/')) {
          const oldSlug = slug
          slug = slug.split('/').pop() || slug
          console.log(`   [DEBUG] Slug zkrácen (podle lomítka): ${oldSlug} -> ${slug}`)
        }

        if (parentSlug && slug.startsWith(`${parentSlug}-`)) {
          const oldSlug = slug
          slug = slug.replace(`${parentSlug}-`, '')
          console.log(`   [DEBUG] Slug očištěn (podle rodiče): ${oldSlug} -> ${slug}`)
        }

        const pageData = {
          legacyPageId: record.id,
          title: String(record.title || '').substring(0, 255),
          slug: slug,
          text: lexicalText,
          category: categoryMap[String(record.page_category)] || 'Místo k navštívení',
          createdBy: createdByUserId,
          parent: parentId,
          includeInChildUrlPaths: record.stop_place_to_visit_propagate_here !== 0,
          detail: {
            googleMapsAddress: record.google_map_search_phrase || '',
            latitude: record.latitude ? String(record.latitude) : undefined,
            longitude: record.longitude ? String(record.longitude) : undefined,
            googleMapsZoom: record.zoom_level || 10,
            locative: record.czech6th_case || '',
            genitive: record.czech2nd_case || '',
            timezone: record.timezone_name || '',
            currencyCode: record.currency_name || '',
            showWeather: record.display_weather_overview === 1 || false,
          },
          meta: {
            title: record.meta_title || '',
            description: record.meta_description || '',
          },
          affiliate: {
            toursUrl: record.affiliate_second_item || '',
            accommodationUrl: record.affiliate_third_item || '',
            carRentalUrl: record.affiliate_fourth_item || '',
            kiwiIataCode: record.affiliate_kiwi_fly_to || '',
          },
          featuredImage: {
            image: featuredImageId,
            featureImageStyleCss: record.main_image_css || '',
          },
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

    console.log('\n══════════════════════════════════════════')
    console.log('📊 Výsledky migrace pages:')
    console.log(`   Vytvořeno:            ${created}`)
    console.log(`   Aktualizováno:        ${updated}`)
    console.log(`   Přeskočeno (dry-run): ${skippedDryRun}`)
    console.log(`   Chyby:                ${errors}`)
    console.log('══════════════════════════════════════════\n')

    process.exit(errors > 0 ? 1 : 0)
  } finally {
    if (conn) {
      await conn.end()
    }
  }
}

run().catch((error) => {
  console.error('💥 Fatální chyba migrace pages:', error)
  process.exit(1)
})
