/**
 * Jednorázový převod: jméno + příjmení → jedno pole `name`.
 *
 * PROČ: dvojice se nikde v aplikaci nepoužívala zvlášť (všech pět míst, kde se
 * jméno zobrazuje, ji zase slepilo dohromady) a jména se na dvě kolonky
 * spolehlivě nedělí — dvě příjmení, jen jedno jméno, tituly, jinde ve světě
 * příjmení první.
 *
 * Skript je IDEMPOTENTNÍ: účty, které už `name` mají, přeskočí. Stará pole
 * NEMAŽE — zůstávají do chvíle, než se sloupce zahodí i v produkci.
 *
 * Spouští se přes `pnpm migrate:user-name`.
 */
import { getPayload } from 'payload'
import config from '../src/payload.config'

const payload = await getPayload({ config })

const { docs } = await payload.find({
  collection: 'users',
  limit: 0,
  pagination: false,
  depth: 0,
  overrideAccess: true,
  select: { name: true, firstName: true, lastName: true, username: true },
})

let prevedeno = 0
let preskoceno = 0

for (const doc of docs as unknown as {
  id: number
  name?: string | null
  firstName?: string | null
  lastName?: string | null
  username?: string | null
}[]) {
  if (doc.name) {
    preskoceno++
    continue
  }
  // `trim` na obou částech i na výsledku: v datech je záznam „Veronika "
  // s mezerou na konci, bez ořezu by vzniklo jméno se dvěma mezerami.
  const cele = [doc.firstName?.trim(), doc.lastName?.trim()].filter(Boolean).join(' ').trim()
  if (!cele) {
    preskoceno++
    continue
  }

  await payload.update({
    collection: 'users',
    id: doc.id,
    data: { name: cele },
    overrideAccess: true,
  })
  prevedeno++
  console.log(`✓ ${doc.username ?? doc.id} → „${cele}"`)
}

console.log(`\nHotovo: převedeno ${prevedeno}, přeskočeno ${preskoceno} (prázdné nebo už hotové)`)
process.exit(0)
