/**
 * Úklid osiřelých profilových fotek — avatarů, na které se neodkazuje žádný účet.
 *
 * PROČ: výměna fotky je několik kroků (nahrát → přepsat účet → smazat starou).
 * Server-side akce po sobě uklízí sama a umí i souběh dvou uložení, ale
 * v okamžiku, kdy se sejdou TŘI (jeden odebírá fotku, druhý nahrává novou),
 * může jeden soubor zůstat viset bez vazby. Uvnitř jednoho požadavku se to
 * dovřít nedá — proto tenhle doběh.
 *
 * Je bezpečný: maže VÝHRADNĚ avatary, které nikdo nemá nastavené jako svůj.
 * Bez parametru jen vypíše, co by smazal; smaže až s `--smazat`.
 *
 * Spouští se přes `pnpm cleanup:avatars [--smazat]` (klidně po nasazení
 * nebo občas ručně).
 */
import { getPayload } from 'payload'
import config from '../src/payload.config'

const smazat = process.argv.includes('--smazat')
const payload = await getPayload({ config })

const [avatary, uzivatele] = await Promise.all([
  payload.find({
    collection: 'avatars',
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: { filename: true, owner: true },
  }),
  payload.find({
    collection: 'users',
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: { avatar: true },
  }),
])

const pouzite = new Set<number>()
for (const u of uzivatele.docs as unknown as { avatar?: number | { id?: number } | null }[]) {
  const id = typeof u.avatar === 'number' ? u.avatar : u.avatar?.id
  if (typeof id === 'number') pouzite.add(id)
}

const osirele = (avatary.docs as unknown as { id: number; filename?: string }[]).filter(
  (a) => !pouzite.has(a.id),
)

console.log(`Avatarů celkem: ${avatary.docs.length}, používaných: ${pouzite.size}`)
if (osirele.length === 0) {
  console.log('Žádné osiřelé fotky — nic k úklidu.')
  process.exit(0)
}

console.log(`\nOsiřelých: ${osirele.length}`)
for (const a of osirele) console.log(`  #${a.id} ${a.filename ?? ''}`)

if (!smazat) {
  console.log('\nTohle byl jen výpis. Smazání spustíš přes: pnpm cleanup:avatars --smazat')
  process.exit(0)
}

let smazano = 0
for (const a of osirele) {
  try {
    await payload.delete({ collection: 'avatars', id: a.id, overrideAccess: true })
    smazano++
  } catch (err) {
    console.error(`✗ #${a.id}:`, err instanceof Error ? err.message : err)
  }
}
console.log(`\nSmazáno ${smazano} z ${osirele.length}.`)
process.exit(0)
