// Generuje velké ikony webu (ikona pro Google/PWA, apple-touch-icon) z papouška z loga.
// Ikonu záložky src/app/favicon.ico NEgeneruje — zůstává původní ručně připravený soubor
// (papoušek od kraje ke kraji, průhledné pozadí), v záložce je potřeba velký a prohlížeč
// nic neořezává. Spuštění: pnpm build:icons (výstupy jsou verzované v repu, skript slouží
// k reprodukci a k budoucím úpravám). Volitelně ICON_OUT=<složka> pro náhledy mimo repo
// a ICON_FILL=<0–1> pro jiný podíl papouška na šířce ikony.
//
// Proč okraj: Google ve výsledcích vyhledávání ořezává favicon do kolečka a těsný výřez
// (papoušek na 81 % šířky) přišel o pravé rohy. Velké ikony proto mají papouška na 65 %
// šířky (okraj podle podkladu „logo-fb-small“, rozhodnutí 5. 9. 2026) a posunutého tak, aby
// rovné pravé rohy ležely uvnitř kružnice o poloměru ~48,5 % hrany. src/app/icon.png je
// průhledný, ikony pro PWA/Apple/JSON-LD jsou na bílé (launchery a schema.org chtějí
// neprůhledné).
// Barva #224386 je původní modrá loga (podklad „logo-fb-small“), tmavší než modrá hlavičky.
import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const BLUE = '#224386'
// Papoušek = první uzavřený obrys (subpath) z SVG loga uloženého v CMS (Header → logo).
const PARROT_PATH =
  'M254.34,209.36q1.07,19.23,3.2,32.84l-37.71,10.35c3-15.24,6.13-31.85,8.17-44.72,4.75-29.73-34.62-93-54-119-21.74-29.32-72.41-43.94-111.91-20-9.73,37.69-7.61,79.86,28,91.93,1.57-6.87-5.94-10.25,0-12,5.91,4.62,10.07,4.62,16,0,3.19,7.46,6.68,14.63,8,24-3.26,3.86-35.41,7.88-45.7,82.11-13.56-6.18-25.83-15.59-36.75-28.4Q0,189.33,0,134.05q0-58.2,35.51-96.14T125.23,0a105.12,105.12,0,0,1,26.16,3.49A199.44,199.44,0,0,1,181.57,14.2l71.7-2.67v150.3Q253.27,190.14,254.34,209.36Z'

const FILL = Number(process.env.ICON_FILL ?? 0.65)
const SAFE_RADIUS = 0.485
const OUT = process.env.ICON_OUT ?? '.'
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }
const WHITE = '#ffffff'

const parrotMaster = await sharp(
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 290 290"><path fill="${BLUE}" d="${PARROT_PATH}"/></svg>`,
  ),
  { density: 600 },
)
  .png()
  .toBuffer()
const parrot = await sharp(parrotMaster).trim().png().toBuffer()
const { width: pw, height: ph } = await sharp(parrot).metadata()
const aspect = ph / pw

/** Umístění papouška: svisle na střed, vpravo tak, aby rohy zůstaly v kružnici. */
function layout(fill) {
  const halfH = (fill * aspect) / 2
  const dx = Math.sqrt(Math.max(0, SAFE_RADIUS ** 2 - halfH ** 2))
  const right = Math.min(0.5 + dx, 1 - (1 - fill) / 2)
  return { width: fill, left: right - fill, top: 0.5 - halfH }
}

async function icon(size, { fill = FILL, background = TRANSPARENT, center = false } = {}) {
  const l = layout(fill)
  const width = Math.round(size * fill)
  const bird = await sharp(parrot).resize({ width, fit: 'inside' }).png().toBuffer()
  const meta = await sharp(bird).metadata()
  const left = center ? Math.round((size - meta.width) / 2) : Math.round(size * l.left)
  const top = Math.round((size - meta.height) / 2)
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: bird, left, top }])
    .png({ compressionLevel: 9 })
    .toBuffer()
}

async function out(rel, buf) {
  const file = path.join(OUT, rel)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, buf)
}

await out('src/app/icon.png', await icon(512))
await out('src/app/apple-icon.png', await icon(180, { background: WHITE }))
await out('public/icon-192.png', await icon(192, { background: WHITE }))
await out('public/icon-512.png', await icon(512, { background: WHITE }))
// Maskable (Android ořezává do kruhu ~80 % hrany): papoušek na středu a menší.
await out(
  'public/icon-maskable-512.png',
  await icon(512, { fill: 0.56, background: WHITE, center: true }),
)
console.log(`Ikony vygenerovány (podíl papouška ${FILL}, výstup ${OUT}).`)
