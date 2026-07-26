/**
 * Přepočítá adresy stránek (`fullSlug`) a řetězec předků (`breadcrumbs`) podle
 * AKTUÁLNÍHO pravidla v `src/lib/page-url.ts`.
 *
 * Kdy ho spustit: po změně pravidla pro skládání URL. Payload přepočítává
 * `breadcrumbs`/`fullSlug` jen při uložení dokumentu, takže už existující
 * stránky si drží adresy podle starého pravidla, dokud je něco neuloží.
 *
 * Co dělá:
 *   1. načte celý strom stránek (id, parent, slug, kategorie, „Zobrazit v URL"),
 *   2. spočítá cílovou adresu každé stránky přes `buildPageUrl` (STEJNÁ funkce,
 *      kterou používá CMS při ukládání — žádná druhá implementace pravidla),
 *   3. stránky s odchylkou uloží (od nejvyšší úrovně dolů), takže hooky pluginu
 *      přepíšou `breadcrumbs` i `fullSlug`,
 *   4. výsledek zkontroluje a případné dopočty dorovná druhým průchodem.
 *
 * Je idempotentní — druhý běh nenajde nic k opravě.
 *
 * Spuštění:
 *   pnpm fix:page-urls -- --dry-run     # jen vypíše, co by se změnilo
 *   pnpm fix:page-urls                  # ostrý běh
 */

import 'dotenv/config'
import { getPayload } from 'payload'
import configPromise from '../src/payload.config.js'
import { buildPageUrl } from '../src/lib/page-url.js'

const isDryRun = process.argv.includes('--dry-run')

type Row = {
  id: number
  parentId: number | null
  slug: string
  category: string
  includeInChildUrlPaths: boolean
  fullSlug: string
}

/** Řetězec předků od nejvyšší úrovně po stránku samotnou. */
function chainFor(id: number, rows: Map<number, Row>): Row[] {
  const chain: Row[] = []
  const seen = new Set<number>()
  let current: number | null = id
  while (current !== null && !seen.has(current)) {
    seen.add(current)
    const row = rows.get(current)
    if (!row) break
    chain.push(row)
    current = row.parentId
  }
  return chain.reverse()
}

async function main() {
  const payload = await getPayload({ config: configPromise })

  const all = await payload.find({
    collection: 'pages',
    limit: 0,
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: {
      slug: true,
      category: true,
      parent: true,
      includeInChildUrlPaths: true,
      fullSlug: true,
    },
  })

  const rows = new Map<number, Row>()
  for (const doc of all.docs as Record<string, unknown>[]) {
    const parent = doc.parent
    rows.set(Number(doc.id), {
      id: Number(doc.id),
      parentId: typeof parent === 'number' ? parent : null,
      slug: String(doc.slug ?? ''),
      category: String(doc.category ?? ''),
      includeInChildUrlPaths: doc.includeInChildUrlPaths !== false,
      fullSlug: String(doc.fullSlug ?? ''),
    })
  }

  const targets: { row: Row; expected: string; depth: number }[] = []
  for (const row of rows.values()) {
    const chain = chainFor(row.id, rows)
    const expected = buildPageUrl(
      chain.map((node) => ({
        slug: node.slug,
        category: node.category,
        includeInChildUrlPaths: node.includeInChildUrlPaths,
      })),
    )
    if (expected !== row.fullSlug) {
      targets.push({ row, expected, depth: chain.length })
    }
  }

  // Od nejvyšší úrovně dolů — potomci staví adresu z rodiče, takže rodič musí
  // být přepočítaný první.
  targets.sort((a, b) => a.depth - b.depth)

  console.log(`Stránek celkem: ${rows.size}, k opravě: ${targets.length}`)
  for (const { row, expected } of targets) {
    console.log(`  ${row.fullSlug || '(bez adresy)'} → ${expected}`)
  }

  if (isDryRun) {
    console.log('\n--dry-run: nic se nezapisovalo.')
    return
  }
  if (targets.length === 0) return

  // Prázdné `data` stačí — `breadcrumbs` i `fullSlug` doplní hooky (plugin
  // nested-docs + field hook na fullSlug). Ukládáme po jedné, ať se chyba jedné
  // stránky nepropíše do zbytku.
  const failed: { id: number; reason: string }[] = []
  for (const { row } of targets) {
    try {
      await payload.update({
        collection: 'pages',
        id: row.id,
        data: {},
        depth: 0,
        overrideAccess: true,
      })
    } catch (err) {
      failed.push({ id: row.id, reason: err instanceof Error ? err.message : String(err) })
    }
  }

  // Kontrola: přečteme dotčené stránky znovu a porovnáme s očekáváním. Pokud
  // hook na `fullSlug` v prvním průchodu viděl ještě starý řetězec, dorovná to
  // druhé uložení.
  const remaining: string[] = []
  for (const { row, expected } of targets) {
    const fresh = await payload.findByID({
      collection: 'pages',
      id: row.id,
      depth: 0,
      overrideAccess: true,
      select: { fullSlug: true },
    })
    const actual = String((fresh as Record<string, unknown>).fullSlug ?? '')
    if (actual !== expected) {
      await payload.update({
        collection: 'pages',
        id: row.id,
        data: {},
        depth: 0,
        overrideAccess: true,
      })
      const again = await payload.findByID({
        collection: 'pages',
        id: row.id,
        depth: 0,
        overrideAccess: true,
        select: { fullSlug: true },
      })
      const secondTry = String((again as Record<string, unknown>).fullSlug ?? '')
      if (secondTry !== expected) {
        remaining.push(`#${row.id}: ${secondTry} (čekáno ${expected})`)
      }
    }
  }

  console.log(`\nHotovo. Opraveno: ${targets.length - failed.length - remaining.length}`)
  if (failed.length) {
    console.log(`Selhalo uložení: ${failed.length}`)
    failed.forEach((f) => console.log(`  #${f.id}: ${f.reason}`))
  }
  if (remaining.length) {
    console.log(`Adresa se nedorovnala ani druhým uložením: ${remaining.length}`)
    remaining.forEach((r) => console.log(`  ${r}`))
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
