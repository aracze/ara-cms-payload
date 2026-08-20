import 'dotenv/config'
import { getPayload } from 'payload'
import configPromise from '../src/payload.config'
import {
  isR2Configured,
  r2Delete,
  r2ListKeys,
  r2ObjectExists,
  r2Put,
  resolveR2Key,
} from '../src/lib/r2-backup'

/**
 * Dorovnání zrcadla avatarů v R2 (viz hooky v src/collections/Avatars.ts):
 *
 * 1. dozálohuje avatary, které v R2 chybí (jednorázový backfill + oprava
 *    selhaných záloh),
 * 2. smaže z R2 osiřelé klíče ve složce `avatars/`, ke kterým už neexistuje
 *    dokument (zrcadlo = jen aktuální avatary; bucket je veřejně čitelný
 *    přes media-backup.ara.cz, staré fotky tam nemají co dělat).
 *
 * Idempotentní. Spouští se s PRODUKČNÍM prostředím (Cloudinary `ara` + R2):
 *   pnpm backup:avatars
 *
 * Staré migrované avatary bez složky `avatars/` sdílejí soubor s kolekcí
 * Media — jejich záloha patří Media a tento skript je záměrně přeskakuje.
 */

const run = async () => {
  if (!isR2Configured()) {
    console.error('Chybí konfigurace R2 (S3_* environment variables).')
    process.exit(1)
  }

  const payload = await getPayload({ config: configPromise })

  // Bez stránkování schválně: expectedKeys MUSÍ obsahovat úplně všechny
  // avatary, jinak by úklid „osiřelých" smazal platné zálohy z dalších stránek.
  const { docs } = await payload.find({
    collection: 'avatars',
    pagination: false,
    limit: 0,
    depth: 0,
    overrideAccess: true,
  })

  const expectedKeys = new Set<string>()
  let backedUp = 0
  let skipped = 0
  let legacy = 0
  let failed = 0

  for (const doc of docs as unknown as Array<Record<string, unknown>>) {
    const publicId = doc.cloudinaryPublicId as string | undefined
    if (!publicId) continue
    const key = resolveR2Key(
      publicId,
      doc.mimeType as string | undefined,
      doc.cloudinaryFormat as string | undefined,
    )
    if (!key.startsWith('avatars/')) {
      legacy++
      continue
    }
    // Klíč evidujeme VŽDY (i bez url) — jinak by úklid níž smazal existující
    // zálohu dokumentu, kterému jen chybí url, jako osiřelou.
    expectedKeys.add(key)

    const url = doc.url as string | undefined
    if (!url) {
      console.error(`Selhalo: ${key} — dokument nemá url, zálohu nelze pořídit.`)
      failed++
      continue
    }

    try {
      if (await r2ObjectExists(key)) {
        skipped++
        continue
      }
      const response = await fetch(url, { signal: AbortSignal.timeout(15_000) })
      if (!response.ok) throw new Error(`Cloudinary: ${response.statusText}`)
      await r2Put({
        key,
        body: Buffer.from(await response.arrayBuffer()),
        contentType: doc.mimeType as string | undefined,
      })
      console.log(`Zálohováno: ${key}`)
      backedUp++
    } catch (error) {
      console.error(`Selhalo: ${key} — ${error instanceof Error ? error.message : error}`)
      failed++
    }
  }

  // Osiřelé klíče (dokument už neexistuje) — pryč, zrcadlo drží jen aktuální.
  let orphansRemoved = 0
  for (const key of await r2ListKeys('avatars/')) {
    if (expectedKeys.has(key)) continue
    try {
      await r2Delete(key)
      console.log(`Osiřelý klíč smazán: ${key}`)
      orphansRemoved++
    } catch (error) {
      console.error(`Mazání selhalo: ${key} — ${error instanceof Error ? error.message : error}`)
      failed++
    }
  }

  console.log(
    `Hotovo: ${backedUp} zálohováno, ${skipped} už v R2, ${orphansRemoved} osiřelých smazáno, ` +
      `${legacy} legacy (spravuje Media), ${failed} chyb.`,
  )
  process.exit(failed > 0 ? 1 : 0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
