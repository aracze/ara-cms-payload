import type { MetadataRoute } from 'next'
import { getSiteURL } from '@/lib/utils'

/**
 * Trénovací AI crawleři — stahují celý web (včetně všech fotek z Cloudinary)
 * jako podklad pro trénink budoucích modelů. V srpnu 2026 dělali přes polovinu
 * přenosů z Cloudinary a přešvihli kredity free plánu, přínos pro web žádný.
 *
 * POZOR: vyhledávací/asistenční boti (OAI-SearchBot, ChatGPT-User,
 * Claude-SearchBot/Claude-User, PerplexityBot, Googlebot…) tu být NESMÍ —
 * díky nim AI asistenti web citují a posílají návštěvníky.
 * Google-Extended a Applebot-Extended nejsou crawleři, ale opt-out tokeny
 * (procházení dělá Googlebot/Applebot, tokeny jen zakazují použití pro trénink).
 */
const TRAINING_BOTS = [
  'GPTBot',
  'ClaudeBot',
  'CCBot',
  'Amazonbot',
  'Bytespider',
  'meta-externalagent',
  'Google-Extended',
  'Applebot-Extended',
]

export default function robots(): MetadataRoute.Robots {
  const site = getSiteURL()
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Affiliate redirecty (/go/pojisteni…) — nejsou to obsah,
        // nemají se procházet ani indexovat. Platí pro všechny boty (na rozdíl od
        // starého robots.txt, kde prázdné skupiny Googlebot/Seznambot blokaci obcházely).
        // Admin a REST API Payloadu (surové JSONy kolekcí) nemají ve výsledcích
        // co dělat a nejsou to HTML stránky, které by nesly vlastní meta robots.
        //
        // Stránky účtu (/prihlaseni, /registrace, /nastaveni, hesla) ani /hledani
        // tu SCHVÁLNĚ nejsou: mají meta robots noindex, a ten Google uplatní jen
        // u URL, kterou smí stáhnout — zakázaná adresa by v indexu zůstala jako
        // „bez popisu" (přihlášení je navíc odkazované z hlavičky každé stránky).
        disallow: ['/go/', '/admin', '/api/'],
      },
      {
        // Bot si z robots.txt vybírá nejkonkrétnější skupinu — kdo je tady,
        // obecné pravidlo výše ignoruje a nesmí nikam.
        userAgent: TRAINING_BOTS,
        disallow: '/',
      },
    ],
    sitemap: `${site}/sitemap.xml`,
    host: site,
  }
}
