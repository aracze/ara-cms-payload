import { test, expect } from '@playwright/test'
import { seedMapPages, cleanupMapPages, mapParent, mapPlaces } from '../helpers/seedMapPages'

// Mapa míst (MapLibre + OpenFreeMap): nejsložitější klientská komponenta webu.
// Test hlídá, že mapa naběhne (worker! — bundlovaný Turbopackem umí tiše umřít,
// viz komentáře v maplibre-map.tsx), vykreslí piny a kartička místa funguje
// z hoveru ve výpisu i uvnitř mapy.

test.describe('Mapa míst', () => {
  test.beforeAll(async () => {
    await seedMapPages()
  })

  test.afterAll(async () => {
    await cleanupMapPages()
  })

  test('výpis míst vykreslí mapu s piny a kartičkou místa', async ({ page }) => {
    await page.goto(`http://localhost:3000/${mapParent.slug}`)

    // Mapová knihovna se načítá líně až u viewportu — nejdřív dojet k sekci.
    await page.locator('#mista').scrollIntoViewIfNeeded()

    // Mapa opustila stav „Načítám mapu…" a vykreslila canvas (worker žije).
    await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Načítám mapu…')).toHaveCount(0, { timeout: 30_000 })

    // Oba seedované piny stojí na mapě.
    const piny = page.locator('.maplibregl-marker')
    await expect(piny).toHaveCount(mapPlaces.length)

    // Hover na kartu ve výpisu otevře kartičku příslušného místa na mapě…
    await page.locator(`[data-poiid]:has-text("${mapPlaces[0].title}")`).hover()
    const kartcka = page.locator('.maplibregl-popup')
    await expect(kartcka).toBeVisible()
    await expect(kartcka).toContainText(mapPlaces[0].title)
    await expect(kartcka).toContainText('Zobrazit detail')

    // …a je celá uvnitř mapy (kotva se u okraje otáčí dovnitř).
    const mapaBox = await page.locator('.maplibregl-map').boundingBox()
    const kartckaBox = await kartcka.boundingBox()
    expect(mapaBox).not.toBeNull()
    expect(kartckaBox).not.toBeNull()
    expect(kartckaBox!.x).toBeGreaterThanOrEqual(mapaBox!.x - 1)
    expect(kartckaBox!.y).toBeGreaterThanOrEqual(mapaBox!.y - 1)
    expect(kartckaBox!.x + kartckaBox!.width).toBeLessThanOrEqual(mapaBox!.x + mapaBox!.width + 1)
    expect(kartckaBox!.y + kartckaBox!.height).toBeLessThanOrEqual(mapaBox!.y + mapaBox!.height + 1)

    // Po odjetí myši kartička zmizí.
    await page.mouse.move(0, 0)
    await expect(kartcka).toHaveCount(0)

    // Piny jsou přístupné: mají roli tlačítka a Enter kartičku otevře.
    const pin = piny.first()
    await expect(pin).toHaveAttribute('role', 'button')
    await pin.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('.maplibregl-popup')).toBeVisible()
  })
})
