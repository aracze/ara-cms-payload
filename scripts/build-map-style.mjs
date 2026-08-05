/**
 * Vygeneruje vlastní mapové styly webu z OpenFreeMap „Liberty".
 *
 * PROČ: OpenStreetMap data + MapLibre umožňují mapu přebarvit do identity
 * webu místo výchozích barev. Styl se generuje ze živého Liberty stylu,
 * takže při změně upstreamu stačí skript spustit znovu:
 *
 *   node scripts/build-map-style.mjs
 *
 * Výstup (čte ho MapLibreMap komponenta):
 *   public/map-styles/aracze.json
 *
 * Dlaždice, fonty i sprity zůstávají na tiles.openfreemap.org (zdarma, bez
 * klíče a bez limitů — služba sponzorovaná Cloudflare).
 */
import { writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'public/map-styles')

const odpoved = await fetch('https://tiles.openfreemap.org/styles/liberty')
if (!odpoved.ok) {
  throw new Error(`Liberty styl se nepodařilo stáhnout: HTTP ${odpoved.status}`)
}
const liberty = await odpoved.json()

// ── Palety ───────────────────────────────────────────────────────────────────
// Klíče: VODA/VODA_LINKA (moře, řeky), PAPIR (pevnina), LES/TRAVA/PARK (zeleně
// + jejich krytí — Liberty zeleně navíc tlumí přes fill-opacity, les 0.4 a
// louky 0.3, s alfou v barvě by výsledek byl vybledlý), SILNICE_LEM/DALNICE/
// HLAVNI (silniční síť místo výchozí oranžové), POPISEK/POPISEK_HALO (text
// sídel), HRANICE (státní hranice).
const PALETA = {
  // „Zelená à la Google" — vítězná varianta z výběru 5. 8. 2026: mátový podklad
  // krajiny, světle modrá voda, bílé silnice; blízko vzhledu, na který jsou
  // návštěvníci zvyklí z Google Maps.
  VODA: '#9fc3ea',
  VODA_LINKA: '#8fb7e2',
  PAPIR: '#e8f0e3',
  // Mátový papír nesmí prosvítat zástavbou (výchozí krytí jen 0.49), jinak
  // jsou města v detailu celá zelená — Google dává městům neutrální tón.
  MESTO: 'rgba(235, 232, 224, 0.92)',
  LES: 'rgba(147, 198, 128, 0.8)',
  LES_KRYTI: 0.7,
  TRAVA: 'rgba(178, 216, 152, 0.8)',
  TRAVA_KRYTI: 0.5,
  PARK: '#b8dfa0',
  SILNICE_LEM: '#d6cfc0',
  DALNICE: '#f7e6a2',
  HLAVNI: '#fdf6d8',
  POPISEK: '#3d5266',
  POPISEK_HALO: 'rgba(255,255,255,0.92)',
  HRANICE: '#9daebc',
}

/** Aplikuje paletu na kopii Liberty stylu a vrátí nový styl. */
function obarvi(paleta) {
  const style = structuredClone(liberty)

  const pravidla = [
    { match: (id) => id === 'background', paint: { 'background-color': paleta.PAPIR } },
    { match: (id) => id === 'water', paint: { 'fill-color': paleta.VODA } },
    { match: (id) => id.startsWith('waterway'), paint: { 'line-color': paleta.VODA_LINKA } },
    {
      match: (id) => id === 'landcover_wood',
      paint: { 'fill-color': paleta.LES, 'fill-opacity': paleta.LES_KRYTI },
    },
    {
      match: (id) => id === 'landcover_grass',
      paint: { 'fill-color': paleta.TRAVA, 'fill-opacity': paleta.TRAVA_KRYTI },
    },
    { match: (id) => id === 'park', paint: { 'fill-color': paleta.PARK } },
    { match: (id) => id === 'park_outline', paint: { 'line-color': paleta.PARK } },
    // Zástavba — viz komentář u MESTO v paletě.
    ...(paleta.MESTO
      ? [{ match: (id) => id === 'landuse_residential', paint: { 'fill-color': paleta.MESTO } }]
      : []),
    // Silniční síť: lemy hlavních tahů z oranžové do pískové, výplně ztlumit.
    {
      match: (id) =>
        id.endsWith('_casing') && /(motorway|trunk_primary|secondary_tertiary|link)/.test(id),
      paint: { 'line-color': paleta.SILNICE_LEM },
    },
    { match: (id) => /(motorway)(_link)?$/.test(id), paint: { 'line-color': paleta.DALNICE } },
    {
      match: (id) =>
        /(trunk_primary|secondary_tertiary|^road_link$|tunnel_link$)/.test(id) &&
        !id.endsWith('_casing'),
      paint: { 'line-color': paleta.HLAVNI },
    },
    { match: (id) => id.startsWith('boundary'), paint: { 'line-color': paleta.HRANICE } },
  ]

  for (const layer of style.layers) {
    for (const p of pravidla) {
      if (!p.match(layer.id)) continue
      // Paint property smí dostat jen vrstva odpovídajícího typu — id se
      // překrývají (např. `waterway_line_label` je symbol) a MapLibre cizí
      // property odmítne jako rozbitý styl (mapa se pak vůbec nevykreslí).
      for (const [key, value] of Object.entries(p.paint ?? {})) {
        if (key.startsWith(`${layer.type}-`)) {
          ;(layer.paint ??= {})[key] = value
        }
      }
    }
    // Popisky: všem symbolovým vrstvám sjednotit barvu textu (výchozí Liberty
    // má několik odstínů hnědé/šedé). Halo nechat světlé.
    if (layer.type === 'symbol' && layer.paint) {
      if (layer.paint['text-color']) layer.paint['text-color'] = paleta.POPISEK
      if (layer.paint['text-halo-color']) layer.paint['text-halo-color'] = paleta.POPISEK_HALO
    }
  }
  return style
}

mkdirSync(OUT_DIR, { recursive: true })
const style = obarvi(PALETA)
writeFileSync(join(OUT_DIR, 'aracze.json'), JSON.stringify(style))
console.log('zapsáno: aracze.json | vrstev:', style.layers.length)

// ── Worker MapLibre do /public ──────────────────────────────────────────────
// MapLibre parsuje dlaždice ve web workeru. Turbopack (dev) worker rozbije
// (moduly workeru se zhroutí hned po startu a mapa navždy „načítá"), proto se
// worker servíruje jako statický soubor mimo bundler přes setWorkerUrl()
// v MapLibreMap komponentě. Worker relativně importuje shared modul, musí
// tedy ležet vedle sebe. POZOR: po upgradu maplibre-gl spustit tento skript
// znovu, ať verze workeru odpovídá verzi knihovny.
const DIST = join(ROOT, 'node_modules/maplibre-gl/dist')
const WORKER_DIR = join(ROOT, 'public/maplibre')
mkdirSync(WORKER_DIR, { recursive: true })
for (const f of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  copyFileSync(join(DIST, f), join(WORKER_DIR, f))
  console.log('zkopírováno:', join('public/maplibre', f))
}
