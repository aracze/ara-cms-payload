import 'dotenv/config'
import { getPayload } from 'payload'
import configPromise from '../src/payload.config'

// Migrace ze staré Grails DB natáhla „Počet obyvatel" a „Řízení" jako
// nice-to-know kartu typu `language` s prázdným headerText — bublina se
// renderovala prázdná (bez ikony/textu). Přeřadí tyto konkrétní karty na nové
// typy `population`/`drivingSide`, které mají vlastní ikonu (viz
// src/lib/rich-text-html.ts). Rozpozná se přesně podle title, ne podle
// prázdného headerText (to by mohlo shodit i platnou kartu jazyka).
const titleToType: Record<string, string> = {
  'Počet obyvatel': 'population',
  Řízení: 'drivingSide',
}

function fixNiceToKnowBlocks(node: unknown): number {
  let fixed = 0
  if (Array.isArray(node)) {
    for (const item of node) fixed += fixNiceToKnowBlocks(item)
    return fixed
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>
    const fields = obj.fields as Record<string, unknown> | undefined
    if (obj.type === 'block' && fields?.blockType === 'niceToKnowBlock') {
      const items = Array.isArray(fields.items) ? (fields.items as Record<string, unknown>[]) : []
      for (const item of items) {
        const newType = titleToType[String(item.title ?? '').trim()]
        if (newType && item.type === 'language') {
          item.type = newType
          fixed++
        }
      }
    }
    for (const value of Object.values(obj)) fixed += fixNiceToKnowBlocks(value)
  }
  return fixed
}

const run = async () => {
  const payload = await getPayload({ config: configPromise })

  const { docs } = await payload.find({
    collection: 'pages',
    where: { category: { equals: 'Praktické informace' } },
    depth: 0,
    limit: 200,
  })

  let pagesFixed = 0
  let cardsFixed = 0
  for (const page of docs) {
    const text = page.text
    const count = fixNiceToKnowBlocks(text)
    if (count > 0) {
      await payload.update({
        collection: 'pages',
        id: page.id,
        data: { text, _status: page._status ?? 'published' },
      })
      pagesFixed++
      cardsFixed += count
      console.log(`${page.fullSlug}: ${count} karta/y`)
    }
  }

  console.log(`\nHotovo — opraveno ${cardsFixed} karet na ${pagesFixed} stránkách.`)
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
