/**
 * Jednorázový doběh: označí VŠECHNY existující účty za ověřené (`_verified`).
 *
 * PROČ: zapnutím `auth.verify` v kolekci Users začne Payload odmítat přihlášení
 * každému, kdo nemá `_verified: true`. Účty, které existovaly předtím (migrovaní
 * uživatelé i administrátoři), tenhle příznak nemají — bez doběhu by se nikdo
 * nepřihlásil, včetně adminů do administrace.
 *
 * Skript je IDEMPOTENTNÍ (opakované spuštění nic nerozbije) a nemění nic jiného
 * než tenhle příznak. Spouští se přes `pnpm backfill:verified`.
 *
 * Pozn.: schéma se do produkce přenáší dumpem z lokálu (viz payload.config.ts),
 * takže po doběhu v dev putuje příznak do produkce spolu s daty. Kdyby se
 * produkce plnila jinak, je nutné skript spustit i tam.
 */
import { getPayload } from 'payload'
import config from '../src/payload.config'

const payload = await getPayload({ config })

const all = await payload.find({
  collection: 'users',
  limit: 0,
  pagination: false,
  depth: 0,
  overrideAccess: true,
  select: { email: true },
})

let updated = 0
let already = 0

for (const user of all.docs) {
  const doc = user as { id: number | string; email?: string; _verified?: boolean | null }
  if (doc._verified === true) {
    already++
    continue
  }
  await payload.update({
    collection: 'users',
    id: doc.id,
    data: { _verified: true } as never,
    overrideAccess: true,
    // Bez revalidačního hooku — nejde o změnu veřejného profilu.
    context: { skipHooks: true },
  })
  updated++
}

console.log(
  `Účtů celkem: ${all.docs.length} | označeno jako ověřené: ${updated} | už bylo ověřených: ${already}`,
)
process.exit(0)
