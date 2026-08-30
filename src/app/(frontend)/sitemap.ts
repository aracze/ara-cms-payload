import type { MetadataRoute } from 'next'
import { fetchSitemapEntries } from '@/lib/payload'
import { getSiteURL } from '@/lib/utils'
import { absoluteUrl } from '@/lib/seo'

// Sitemap se skládá až ZA BĚHU, nikdy při buildu. Dřív se prerendrovala při
// sestavení obrazu (kde CMS neběží) jako „jen homepage" a po každém nasazení
// tuhle verzi web servíroval, dokud ji první dotaz (často Googlebot) nevyžádal
// a ISR ji na pozadí nepřegenerovala. Data drží `cached()` v lib/payload.ts
// (tag `sitemap`, invalidace při publikaci), takže dynamický režim nic nestojí.
export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = getSiteURL()

  // Když CMS není dostupné, chyba propadne → 500. Google si sitemapu vyžádá
  // znovu; sitemapa s jedinou adresou by ho naopak přesvědčila, že web zbytek
  // stránek nemá.
  const { pages, articles } = await fetchSitemapEntries()

  // Homepage skládá nejnovější obsah, takže „změněno" = nejnovější změna kdekoliv.
  const newest = [...pages, ...articles].reduce(
    (max, e) => (e.lastModified > max ? e.lastModified : max),
    '',
  )

  const entries: MetadataRoute.Sitemap = [
    {
      url: site,
      ...(newest ? { lastModified: newest } : {}),
      changeFrequency: 'daily',
      priority: 1,
    },
    ...pages.map((p) => ({
      url: absoluteUrl(p.path),
      lastModified: p.lastModified,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    ...articles.map((a) => ({
      url: absoluteUrl(a.path),
      lastModified: a.lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ]

  // Deduplikace podle URL (kdyby se cesta stránky a článku shodovala).
  const seen = new Set<string>()
  return entries.filter((e) => {
    if (seen.has(e.url)) return false
    seen.add(e.url)
    return true
  })
}
