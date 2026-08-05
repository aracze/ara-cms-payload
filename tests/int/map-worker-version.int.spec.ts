import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

/**
 * Worker MapLibre se servíruje jako statická kopie z public/maplibre (viz
 * scripts/build-map-style.mjs — bundlovaný worker se v Turbopack dev hroutí).
 * Kopie MUSÍ odpovídat nainstalované verzi maplibre-gl; po upgradu knihovny
 * se snadno zapomene skript spustit znovu a mapa by běžela s neslučitelným
 * workerem. Tenhle test drift chytí v CI — licenční hlavička dist souborů
 * nese přesnou verzi (…maplibre-gl-js/blob/vX.Y.Z/…).
 */
describe('worker MapLibre v public/maplibre', () => {
  const require = createRequire(import.meta.url)
  const { version } = require('maplibre-gl/package.json') as { version: string }

  it.each(['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'])(
    '%s odpovídá nainstalované verzi maplibre-gl',
    (file) => {
      const hlavicka = readFileSync(`public/maplibre/${file}`, 'utf8').slice(0, 500)
      expect(
        hlavicka,
        `public/maplibre/${file} nese jinou verzi než nainstalovaný maplibre-gl@${version} — spusť \`pnpm build:map-style\``,
      ).toContain(`maplibre-gl-js/blob/v${version}/`)
    },
  )
})
