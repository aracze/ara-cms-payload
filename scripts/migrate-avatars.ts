/**
 * Jednorázový převod: profilové fotky z kolekce Media do nové kolekce Avatars.
 *
 * PROČ: avatary dřív ležely v redakční knihovně (Media), kam smí vkládat jen
 * redakce. Aby si je lidé mohli měnit sami, dostaly vlastní kolekci s vlastními
 * právy (viz src/collections/Avatars.ts). Přepnutím `relationTo` u pole
 * `users.avatar` se ale stará vazba na Media zahodí — tenhle skript ji obnoví.
 *
 * Zdroj vazeb je JSON vytvořený PŘED přepnutím schématu:
 *   psql -c "copy (select … from users u join media m on m.id=u.avatar_id) to stdout"
 *
 * Soubory se stahují z Cloudinary a nahrávají znovu (přes Local API, aby proběhl
 * ořez na čtverec i nahrání na Cloudinary). Originály v Media zůstávají — nic
 * se nemaže, kdyby bylo potřeba se vrátit.
 *
 * Skript je IDEMPOTENTNÍ: uživatele, který už avatar v nové kolekci má, přeskočí.
 * Spouští se přes `pnpm migrate:avatars <cesta-k-json>`.
 */
import { readFileSync } from 'node:fs'
import { getPayload } from 'payload'
import config from '../src/payload.config'

type Radek = {
  user_id: number
  username: string | null
  media_id: number
  url: string
  filename: string | null
  mime_type: string | null
}

const cesta = process.argv[2]
if (!cesta) {
  console.error('Použití: pnpm migrate:avatars <cesta-k-avatary-mapa.json>')
  process.exit(1)
}

const radky: Radek[] = JSON.parse(readFileSync(cesta, 'utf-8'))
const payload = await getPayload({ config })

// Databáze má u starých souborů i nestandardní „image/jpg" — Avatars přijímá
// jen oficiální typy, takže je potřeba převod.
function normalizujMime(mime: string | null, url: string): string {
  const m = (mime || '').toLowerCase()
  if (m === 'image/png') return 'image/png'
  if (m === 'image/webp') return 'image/webp'
  if (m === 'image/jpeg' || m === 'image/jpg') return 'image/jpeg'
  if (url.toLowerCase().endsWith('.png')) return 'image/png'
  if (url.toLowerCase().endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

let prevedeno = 0
let preskoceno = 0
let chyby = 0

for (const r of radky) {
  try {
    // Už převedený? (opakované spuštění nesmí zakládat duplicity)
    const stavajici = await payload.findByID({
      collection: 'users',
      id: r.user_id,
      depth: 0,
      select: { avatar: true, username: true },
      overrideAccess: true,
    })
    if (stavajici?.avatar) {
      preskoceno++
      continue
    }

    // Timeout: bez něj by se skript na nedostupném souboru zasekl natrvalo.
    const odpoved = await fetch(r.url, { signal: AbortSignal.timeout(30_000) })
    if (!odpoved.ok) {
      console.error(`✗ ${r.username ?? r.user_id}: stažení selhalo (HTTP ${odpoved.status})`)
      chyby++
      continue
    }
    const data = Buffer.from(await odpoved.arrayBuffer())
    const mimetype = normalizujMime(r.mime_type, r.url)

    const avatar = await payload.create({
      collection: 'avatars',
      // `owner` tu předáváme ručně — hook ho bere z přihlášení, které skript nemá.
      data: { owner: r.user_id, alt: `Profilová fotka ${r.username ?? ''}`.trim() },
      file: { name: r.filename || `avatar-${r.user_id}.jpg`, data, mimetype, size: data.length },
      overrideAccess: true,
    })

    try {
      await payload.update({
        collection: 'users',
        id: r.user_id,
        data: { avatar: avatar.id },
        overrideAccess: true,
      })
    } catch (err) {
      // Nahráno, ale nenapojeno → uklidíme, ať v nové kolekci nezůstane sirotek
      // a opakované spuštění skriptu začalo z čistého stavu.
      await payload
        .delete({ collection: 'avatars', id: avatar.id, overrideAccess: true })
        .catch(() => {})
      throw err
    }

    prevedeno++
    console.log(`✓ ${r.username ?? r.user_id} → avatar #${avatar.id}`)
  } catch (err) {
    chyby++
    console.error(`✗ ${r.username ?? r.user_id}:`, err instanceof Error ? err.message : err)
  }
}

console.log(`\nHotovo: převedeno ${prevedeno}, přeskočeno ${preskoceno}, chyb ${chyby}`)
process.exit(chyby > 0 ? 1 : 0)
