import type { MetadataRoute } from 'next'
import { getSiteURL } from '@/lib/utils'

export default function robots(): MetadataRoute.Robots {
  const site = getSiteURL()
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Affiliate redirecty (/go/porovnej24, /go/epojisteni…) — nejsou to obsah,
      // nemají se procházet ani indexovat. Platí pro všechny boty (na rozdíl od
      // starého robots.txt, kde prázdné skupiny Googlebot/Seznambot blokaci obcházely).
      disallow: '/go/',
    },
    sitemap: `${site}/sitemap.xml`,
    host: site,
  }
}
