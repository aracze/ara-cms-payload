import type { MetadataRoute } from 'next'
import { getSiteURL } from '@/lib/utils'

export default function robots(): MetadataRoute.Robots {
  const site = getSiteURL()
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Affiliate redirecty (/go/pojisteni…) — nejsou to obsah,
      // nemají se procházet ani indexovat. Platí pro všechny boty (na rozdíl od
      // starého robots.txt, kde prázdné skupiny Googlebot/Seznambot blokaci obcházely).
      // Výsledky hledání jsou z pohledu vyhledávačů nekonečný duplicitní obsah —
      // stránka má i meta robots noindex, tohle šetří samotné procházení.
      disallow: ['/go/', '/hledani'],
    },
    sitemap: `${site}/sitemap.xml`,
    host: site,
  }
}
