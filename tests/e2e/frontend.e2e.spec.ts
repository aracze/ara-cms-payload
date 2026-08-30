import { test, expect, Page } from '@playwright/test'

test.describe('Frontend', () => {
  let page: Page

  test.beforeAll(async ({ browser }, testInfo) => {
    const context = await browser.newContext()
    page = await context.newPage()
  })

  test('can go on homepage', async ({ page }) => {
    await page.goto('http://localhost:3000')

    await expect(page).toHaveTitle(/Ara\.cz – Cestovní průvodce po světě/)

    const heading = page.locator('h1').first()

    // Skrytý h1 (sr-only) s klíčovými slovy — viditelně titulek nese hledací pole.
    await expect(heading).toHaveText('Ara.cz – cestovní průvodce po světě')
  })
})
