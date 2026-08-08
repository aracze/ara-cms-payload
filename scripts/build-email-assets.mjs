/**
 * Vygeneruje obrázky pro HTML e-maily webu.
 *
 * PROČ: e-maily nemůžou používat grafiku webu přímo — logo je na webu SVG,
 * které Gmail v e-mailech nezobrazí, a kresba papouška je WebP, kterému
 * nerozumí starší Outlook. Poštovní klienti chtějí obyčejné PNG načítané
 * z veřejné adresy. Při změně loga nebo kresby stačí skript spustit znovu:
 *
 *   node scripts/build-email-assets.mjs
 *
 * Výstup (odkazuje na něj šablona v src/lib/email-template.ts):
 *   public/assets/email/logo.png — modrý nápis Ara.cz, 168 px (zobrazuje se 84 px, @2x)
 *   public/assets/email/ara.png  — kresba papouška,   340 px (zobrazuje se 170 px, @2x)
 */
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'public/assets/email')

// Nápis „Ara.cz" — stejná křivka jako logo v hlavičce webu (globál Header),
// jen s pevně danou modrou výplní místo bílé (v e-mailu leží na světlém
// podkladu). Křivka je tady zkopírovaná schválně: skript nesmí záviset na
// běžící databázi. Barva #224386 je oficiální modrá loga — přesně tahle
// vyplňuje původní `logo-blue.png` z podkladů starého webu (OneDrive).
const LOGO_FILL = '#224386'
const LOGO_PATH =
  'M254.34,209.36q1.07,19.23,3.2,32.84l-37.71,10.35c3-15.24,6.13-31.85,8.17-44.72,4.75-29.73-34.62-93-54-119-21.74-29.32-72.41-43.94-111.91-20-9.73,37.69-7.61,79.86,28,91.93,1.57-6.87-5.94-10.25,0-12,5.91,4.62,10.07,4.62,16,0,3.19,7.46,6.68,14.63,8,24-3.26,3.86-35.41,7.88-45.7,82.11-13.56-6.18-25.83-15.59-36.75-28.4Q0,189.33,0,134.05q0-58.2,35.51-96.14T125.23,0a105.12,105.12,0,0,1,26.16,3.49A199.44,199.44,0,0,1,181.57,14.2l71.7-2.67v150.3Q253.27,190.14,254.34,209.36ZM403.62,16.85q-19.37,11.47-33.79,36.88l-1.6-42.2H290.08V252h84V147.16q0-34.14,13.49-43.08t52.76-9h18.17V5.35h-6.68Q423,5.35,403.62,16.85ZM724.91,242.2l-77.85,21.36-7.5-22.95Q623.81,252.34,608.73,258a90.3,90.3,0,0,1-31.64,5.61q-46.46,0-78.09-37.11t-31.64-92.4q0-58.2,35.52-96.14T592.59,0a105.19,105.19,0,0,1,26.17,3.49A199.74,199.74,0,0,1,648.93,14.2l71.7-2.67v150.3q0,28.3,1.07,47.53T724.91,242.2ZM636.62,72.66a62.8,62.8,0,0,0-14.27-6.14,50.44,50.44,0,0,0-13.47-1.86q-23.73,0-40,19.88T552.61,134.6q0,28.31,14.27,47.13t34.8,18.83a37.34,37.34,0,0,0,16.94-4.4q8.67-4.41,18-13.49Zm133.9,173q13.32,13.57,31.43,13.59A44.32,44.32,0,0,0,834.31,246a43.36,43.36,0,0,0,13.45-32q0-19.19-13.31-32.22T802,168.72a42.94,42.94,0,0,0-31.7,13.19,43.93,43.93,0,0,0-13,32.09Q757.21,232.12,770.52,245.69Zm323.34-85.31q-25.53,16.6-44.87,24t-36.35,7.39q-27.33,0-44.09-16T951.79,133.5q0-24.73,18.05-41.36t45.38-16.63q15.19,0,32.87,6A190,190,0,0,1,1084.83,99l9-72.1a180.45,180.45,0,0,0-40.79-15.12,186.59,186.59,0,0,0-43.37-5Q949,6.78,908.9,44.33t-40.14,93.05q0,53.42,37.31,88.26t95.38,34.83a158,158,0,0,0,42.72-5.81,189.1,189.1,0,0,0,42.22-18ZM1322,253.73l9.86-63.39H1227.68L1335.07,13.53H1124.29l-14.66,63.39h92.73l-107.5,176.81Z'

// Šířka 168 px = 84 px v e-mailu na běžném displeji, ostré i na retině (@2x).
const LOGO_WIDTH = 168
const LOGO_HEIGHT = Math.round((263.56 / 1335.07) * LOGO_WIDTH)
const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${LOGO_WIDTH}" height="${LOGO_HEIGHT}" viewBox="0 0 1335.07 263.56"><path fill="${LOGO_FILL}" d="${LOGO_PATH}"/></svg>`

mkdirSync(OUT_DIR, { recursive: true })

await sharp(Buffer.from(logoSvg)).png().toFile(join(OUT_DIR, 'logo.png'))

// Kresba papouška — stejný soubor jako na chybových stránkách, jen zmenšený
// a převedený na PNG s průhledností (340 px = 170 px v e-mailu, @2x).
await sharp(join(ROOT, 'public/assets/404-ara.webp'))
  .resize({ width: 340 })
  .png({ compressionLevel: 9 })
  .toFile(join(OUT_DIR, 'ara.png'))

console.log(`Hotovo: ${OUT_DIR}/logo.png (${LOGO_WIDTH}×${LOGO_HEIGHT}) a ara.png (340 px)`)
