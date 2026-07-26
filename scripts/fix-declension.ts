/**
 * Doplní skloňované tvary názvů míst (`detail.genitive`, `detail.locative`)
 * ze seed souboru `scripts/data/place-declension.json`.
 *
 * K čemu to je: titulky podstránek skládá `buildPageTitle` z těchto polí
 * („Aktuální počasí a kdy jet **do Košic**“, „Ubytování **ve Wyomingu**“).
 * Předložka je součástí hodnoty, protože se z názvu odvodit nedá (na Slovensko
 * vs. do Chorvatska) — proto tvary drží databáze a ne algoritmus. Když pole
 * chybí, web použije nouzové „do <název>“ / „v <název>“, což u řady jmen
 * gramaticky nesedí.
 *
 * Chování:
 *   - prázdné pole doplní,
 *   - neprázdné pole nechá být — přepíše ho JEN u záznamu s `"overwrite": true`,
 *   - když už je hodnota stejná, přeskočí (skript je idempotentní),
 *   - když se název stránky rozejde se `title` v seedu, záznam přeskočí a
 *     nahlásí to (ochrana proti tomu, že by se ID posunulo na jinou stránku).
 *
 * Spuštění:
 *   pnpm fix:declension -- --dry-run     # jen vypíše, co by se změnilo
 *   pnpm fix:declension                  # ostrý běh
 */

import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { getPayload } from 'payload'
import configPromise from '../src/payload.config.js'

const isDryRun = process.argv.includes('--dry-run')

const dirname = path.dirname(fileURLToPath(import.meta.url))
const SEED_PATH = path.join(dirname, 'data', 'place-declension.json')

type SeedEntry = {
  id: number
  title: string
  genitive?: string
  locative?: string
  overwrite?: boolean
  note?: string
}

type PageDetail = Record<string, unknown> | null | undefined

function main() {
  const seed = JSON.parse(readFileSync(SEED_PATH, 'utf8')) as { places: SeedEntry[] }
  return run(seed.places)
}

async function run(entries: SeedEntry[]) {
  const payload = await getPayload({ config: configPromise })

  const planned: string[] = []
  const skippedFilled: string[] = []
  const mismatched: string[] = []
  const failed: string[] = []
  let updatedPages = 0
  let unchanged = 0

  for (const entry of entries) {
    let doc: { title?: unknown; detail?: PageDetail }
    try {
      doc = (await payload.findByID({
        collection: 'pages',
        id: entry.id,
        depth: 0,
        overrideAccess: true,
        select: { title: true, detail: true },
      })) as { title?: unknown; detail?: PageDetail }
    } catch {
      mismatched.push(`#${entry.id} ${entry.title} — stránka neexistuje`)
      continue
    }

    if (String(doc.title ?? '') !== entry.title) {
      mismatched.push(`#${entry.id} — seed čeká „${entry.title}", v CMS je „${doc.title}"`)
      continue
    }

    const detail = (doc.detail ?? {}) as Record<string, unknown>
    const updates: Record<string, string> = {}

    for (const field of ['genitive', 'locative'] as const) {
      const wanted = entry[field]
      if (!wanted) continue

      const current = String(detail[field] ?? '')
      if (current === wanted) continue

      if (current === '') {
        updates[field] = wanted
        planned.push(`  ${entry.title}: ${field} = „${wanted}"`)
      } else if (entry.overwrite) {
        updates[field] = wanted
        planned.push(`  ${entry.title}: ${field} „${current}" → „${wanted}"`)
      } else {
        skippedFilled.push(`  ${entry.title}: ${field} má „${current}", seed chce „${wanted}"`)
      }
    }

    if (Object.keys(updates).length === 0) {
      unchanged++
      continue
    }

    if (isDryRun) continue

    try {
      await payload.update({
        collection: 'pages',
        id: entry.id,
        // Skupinu `detail` posíláme celou — Payload by jinak ostatní pole
        // (souřadnice, měna, časové pásmo) vyprázdnil.
        data: { detail: { ...detail, ...updates } },
        depth: 0,
        overrideAccess: true,
      })
      updatedPages++
    } catch (err) {
      failed.push(`  #${entry.id} ${entry.title}: ${err instanceof Error ? err.message : err}`)
    }
  }

  console.log(`Záznamů v seedu: ${entries.length}`)
  console.log(`\nKe změně (${planned.length} hodnot):`)
  planned.forEach((line) => console.log(line))
  if (skippedFilled.length) {
    console.log(`\nJiž vyplněné, NEpřepisuji (${skippedFilled.length}) — chce „overwrite": true:`)
    skippedFilled.forEach((line) => console.log(line))
  }
  if (mismatched.length) {
    console.log(`\nPřeskočeno kvůli neshodě názvu (${mismatched.length}):`)
    mismatched.forEach((line) => console.log(line))
  }
  console.log(`\nBeze změny (už odpovídá seedu): ${unchanged}`)

  if (isDryRun) {
    console.log('\n--dry-run: nic se nezapisovalo.')
    return
  }
  console.log(`Uloženo stránek: ${updatedPages}`)
  if (failed.length) {
    console.log(`Selhalo (${failed.length}):`)
    failed.forEach((line) => console.log(line))
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
