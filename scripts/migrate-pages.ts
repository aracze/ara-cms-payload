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
import { Page } from '../src/payload-types'

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
    WHERE \`${COL_ID}\` = 4496
    ORDER BY \`${COL_ID}\`
    ${limitClause}
  `
  const [rows] = await conn.execute<mysql.RowDataPacket[]>(query)
  return rows as OldRecord[]
}

async function htmlToLexical(
  html: string,
  payload: Payload,
  mediaMap: {
    filename: Map<string, number | string>
    cloudinary: Map<string, number | string>
  },
): Promise<object> {
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

    const blocks: any[] = []

    // Extrakce <table> pro nativní Lexical tabulku
    const tables = doc.querySelectorAll('table')
    tables.forEach((table: any) => {
      const index = blocks.length
      const rows: any[] = []

      const trs = table.querySelectorAll('tr')
      let rowIndex = 0
      trs.forEach((tr: any) => {
        const cells: any[] = []
        const tds = tr.querySelectorAll('td, th')
        tds.forEach((td: any) => {
          // Běžné staré tabulky často používají td i pro hlavičku. Pokud je to první řádek, bereme to jako hlavičku.
          const isHeader = td.tagName.toLowerCase() === 'th' || rowIndex === 0 ? 1 : 0
          const cellText = td.textContent?.trim() || ''

          cells.push({
            type: 'tablecell',
            headerState: isHeader,
            colSpan: parseInt(td.getAttribute('colspan') || '1', 10),
            rowSpan: parseInt(td.getAttribute('rowspan') || '1', 10),
            value: 0,
            format: '',
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
                    text: cellText,
                    format: 0,
                    style: '',
                    mode: 'normal',
                    version: 1,
                  },
                ],
              },
            ],
          })
        })

        if (cells.length > 0) {
          rows.push({
            type: 'tablerow',
            height: 0,
            format: '',
            version: 1,
            children: cells,
          })
        }
        rowIndex++
      })

      blocks.push({
        type: 'table',
        format: '',
        version: 1,
        children: rows,
      })

      const p = doc.createElement('p')
      p.textContent = `__PAYLOAD_BLOCK_${index}__`

      if (table.parentNode) table.parentNode.replaceChild(p, table)
    })

    // 5. Oprava vnořených seznamů (přesunutí <ul> z prázdného <li> do předchozího <li>)
    const listItems = Array.from(doc.querySelectorAll('li'))
    listItems.forEach((li: any) => {
      const firstChild = li.firstElementChild
      if (firstChild && (firstChild.tagName === 'UL' || firstChild.tagName === 'OL')) {
        // Kontrola, zda li obsahuje POUZE ten seznam a žádný jiný vlastní text
        const directText = Array.from(li.childNodes)
          .filter((node: any) => node.nodeType === 3) // Node.TEXT_NODE
          .map((node: any) => node.textContent.trim())
          .join('')

        if (directText === '' && li.previousElementSibling?.tagName === 'LI') {
          li.previousElementSibling.appendChild(firstChild)
          li.remove()
        }
      }
    })

    // Extrakce <iframe> pro MapBlock
    const iframes = doc.querySelectorAll('iframe')
    iframes.forEach((iframe: any) => {
      const src = iframe.getAttribute('src') || ''
      const index = blocks.length
      blocks.push({
        type: 'block',
        fields: {
          blockType: 'mapBlock',
          iframeUrl: src,
          caption: '',
        },
        format: '',
        version: 2,
      })
      const p = doc.createElement('p')
      p.textContent = `__PAYLOAD_BLOCK_${index}__`
      if (iframe.parentNode) iframe.parentNode.replaceChild(p, iframe)
    })

    // Extrakce <img> pro ContentImage
    const imgs = doc.querySelectorAll('img')
    for (let i = 0; i < imgs.length; i++) {
      const img = imgs[i] as any
      const src = img.getAttribute('src') || ''
      const alt = img.getAttribute('alt') || ''

      const filename = src.split('/').pop()?.split('?')[0] || ''
      const nameWithoutExt = filename.includes('.')
        ? filename.split('.').slice(0, -1).join('.')
        : filename

      let mediaId = null
      if (filename) {
        // Zkusíme najít podle filename, nebo podle cloudinaryPublicId (s i bez přípony)
        mediaId =
          mediaMap.filename.get(filename) ||
          mediaMap.cloudinary.get(nameWithoutExt) ||
          mediaMap.cloudinary.get(filename) ||
          null
      }

      const index = blocks.length
      if (mediaId) {
        blocks.push({
          type: 'block',
          fields: {
            blockType: 'contentImage',
            image: mediaId,
            caption: alt,
          },
          format: '',
          version: 2,
        })
      } else {
        blocks.push({
          type: 'paragraph',
          children: [
            {
              type: 'text',
              text: `[Chybějící obrázek: ${src}]`,
              format: 0,
              style: '',
              mode: 'normal',
              version: 1,
            },
          ],
          format: '',
          indent: 0,
          version: 1,
        })
      }

      const p = doc.createElement('p')
      p.textContent = `__PAYLOAD_BLOCK_${index}__`
      if (img.parentNode) img.parentNode.replaceChild(p, img)
    }

    const cleanedHtml = doc.body.innerHTML

    // @ts-ignore
    const editorConfig = await editorConfigFactory.default({ config: payload.config })
    const lexicalData: any = await convertHTMLToLexical({ html: cleanedHtml, editorConfig, JSDOM })

    // Rekurzivní nahrazení placeholderů v Lexical stromu
    function replaceBlocks(node: any) {
      if (!node || typeof node !== 'object') return
      if (node.children && Array.isArray(node.children)) {
        for (let i = 0; i < node.children.length; i++) {
          const child = node.children[i]
          if (child.type === 'paragraph' && child.children?.length > 0) {
            // Zkusíme najít textový uzel, který obsahuje náš placeholder
            const textNode = child.children.find(
              (c: any) => c.type === 'text' && c.text.includes('__PAYLOAD_BLOCK_'),
            )
            if (textNode) {
              const match = textNode.text.match(/__PAYLOAD_BLOCK_(\d+)__/)
              if (match) {
                const blockIndex = parseInt(match[1], 10)
                if (blocks[blockIndex]) {
                  node.children[i] = blocks[blockIndex]
                }
                continue
              }
            }
          }
          replaceBlocks(child)
        }
      }
    }

    replaceBlocks(lexicalData?.root)
    return lexicalData
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

    // ─────────────────────────────────────────────────────────────────────────────
    // PRE-FETCHING (OPTIMALIZACE)
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('⏳ Načítám cache pro optimalizaci...')

    // 1. Načtení všech uživatelů
    const allUsers = await payload.find({
      collection: 'users',
      limit: 0,
      depth: 0,
      pagination: false,
    })
    const usersMap = new Map(allUsers.docs.map((u: any) => [Number(u.legacyUserId), u.id]))

    // 2. Načtení všech médií
    const allMedia = await payload.find({
      collection: 'media',
      limit: 0,
      depth: 0,
      pagination: false,
    })
    const mediaMap = {
      filename: new Map(allMedia.docs.map((m: any) => [m.filename, m.id])),
      cloudinary: new Map(allMedia.docs.map((m: any) => [m.cloudinaryPublicId, m.id])),
    }

    // 3. Načtení stávajících stránek (pro update a parent vztahy)
    const allPages = await payload.find({
      collection: 'pages',
      limit: 0,
      depth: 0,
      pagination: false,
    })
    const pagesMap = new Map(
      allPages.docs.map((p: any) => [Number(p.legacyPageId), { id: p.id, slug: p.slug }]),
    )

    console.log(
      `✅ Cache připravena: ${usersMap.size} uživatelů, ${allMedia.docs.length} médií, ${pagesMap.size} stránek\n`,
    )

    let created = 0
    let updated = 0
    let skippedDryRun = 0
    let errors = 0

    for (const [index, record] of records.entries()) {
      const progress = `[${index + 1}/${records.length}]`

      // Zkontroluj zda záznam v Payload už existuje podle legacyPageId (z cache)
      const existingInfo = pagesMap.get(record.id)
      const isUpdate = !!existingInfo

      if (isDryRun) {
        const action = isUpdate ? 'UPDATE' : 'CREATE'
        console.log(`${progress} 📋 DRY RUN [${action}] "${record.title}" (slug: ${record.slug})`)
        skippedDryRun++
        continue
      }

      try {
        // Zpracování vztahu uživatele (createdBy) přes legacyUserId (z cache)
        let createdByUserId = undefined
        if (record.created_by_id) {
          const legacyIdNum = Number(record.created_by_id)
          createdByUserId = usersMap.get(legacyIdNum)
          if (!createdByUserId) {
            console.warn(
              `   [DEBUG] Uživatel s legacy ID ${legacyIdNum} NEBYL NALEZEN v Payload CMS!`,
            )
          }
        }

        // Zpracování nadřazené stránky (parent) podle parent_id (z cache)
        let parentId = undefined
        let parentSlug: string | null | undefined = undefined
        if (record.parent_id) {
          const legacyParentIdNum = Number(record.parent_id)
          const parentInfo = pagesMap.get(legacyParentIdNum)
          if (parentInfo) {
            parentId = parentInfo.id
            parentSlug = parentInfo.slug
          } else {
            console.warn(
              `   [DEBUG] Nadřazená stránka s legacy ID ${legacyParentIdNum} NEBYLA NALEZENA v Payload CMS!`,
            )
          }
        }

        // Zpracování vztahu obrázku (featuredImage) podle filename nebo cloudinaryPublicId (z cache)
        let featuredImageId = undefined
        if (record.main_image_name) {
          const imageName = String(record.main_image_name)
          const imageNameWithoutExt = imageName.includes('.')
            ? imageName.split('.').slice(0, -1).join('.')
            : imageName

          featuredImageId =
            mediaMap.filename.get(imageName) ||
            mediaMap.cloudinary.get(imageNameWithoutExt) ||
            mediaMap.cloudinary.get(imageName)

          if (!featuredImageId) {
            console.warn(
              `   [DEBUG] Obrázek ${record.main_image_name} NEBYL NALEZEN v Payload CMS!`,
            )
          }
        }

        // Převod HTML → Lexical JSON (s využitím mediaMap pro inline obrázky)
        const lexicalText = await htmlToLexical(record.text || '', payload, mediaMap)

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

        const pageData: any = {
          legacyPageId: record.id,
          title: String(record.title || '').substring(0, 255),
          slug: slug,
          text: lexicalText,
          category: (categoryMap[String(record.page_category)] ||
            'Místo k navštívení') as Page['category'],
          createdBy: createdByUserId,
          parent: parentId,
          includeInChildUrlPaths: record.stop_place_to_visit_propagate_here !== 0,
          detail: {
            googleMapsAddress: String(record.google_map_search_phrase || ''),
            latitude: record.latitude ? String(record.latitude) : undefined,
            longitude: record.longitude ? String(record.longitude) : undefined,
            googleMapsZoom: record.zoom_level || 10,
            locative: String(record.czech6th_case || ''),
            genitive: String(record.czech2nd_case || ''),
            timezone: String(record.timezone_name || ''),
            currencyCode: String(record.currency_name || ''),
            showWeather: Boolean(record.display_weather_overview === 1),
          },
          meta: {
            title: String(record.meta_title || ''),
            description: String(record.meta_description || ''),
          },
          affiliate: {
            toursUrl: String(record.affiliate_second_item || ''),
            accommodationUrl: String(record.affiliate_third_item || ''),
            carRentalUrl: String(record.affiliate_fourth_item || ''),
            kiwiIataCode: String(record.affiliate_kiwi_fly_to || ''),
          },
          featuredImage: {
            image: featuredImageId,
            featureImageStyleCss: String(record.main_image_css || ''),
          },
        }

        if (isUpdate && existingInfo) {
          await payload.update({
            collection: 'pages',
            id: existingInfo.id,
            data: pageData,
            draft: false,
            overrideAccess: true,
          })
          console.log(`${progress} ✅ Aktualizováno: "${record.title}"`)
          updated++
        } else {
          await payload.create({
            collection: 'pages',
            data: pageData,
            draft: false,
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
