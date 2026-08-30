/**
 * KOŘENOVÝ LAYOUT (Root Layout)
 * ----------------------------
 * Tento soubor definuje strukturu HTML, která obaluje všechny stránky v aplikaci.
 * Next.js ho automaticky použije pro každou trasu (route).
 */

import type { Metadata, Viewport } from 'next'
import { Open_Sans, Poppins } from 'next/font/google'
import './globals.css'
import { isProduction } from '@/lib/utils'
import {
  DEFAULT_DESCRIPTION,
  getSiteURLObject,
  RSS_ALTERNATE,
  SITE_NAME,
  SITE_TITLE_SUFFIX,
} from '@/lib/seo'
import { Header } from '@/components/layout/header/header'
import { sanitizeHeaderLogoSvg } from '@/lib/rich-text-html'
import { Footer } from '@/components/layout/footer/footer'
import { NavigationProgress } from '@/components/layout/navigation-progress'
import { RichTextLightbox } from '@/components/features/rich-text-lightbox'
import { WebVitals } from '@/components/features/web-vitals'
import { Analytics } from '@/components/features/analytics'
import { fetchRootPages } from '@/lib/payload'
import { getCurrentUser } from '@/lib/auth'
import { getTurnstileSiteKey } from '@/lib/comment-spam'

// 1. NASTAVENÍ PÍSEM (Google Fonts)
// Jen řezy, které web opravdu používá — každý řez × subset je samostatný soubor
// s <link rel=preload> v hlavičce a soupeří o síť s hero fotkou (LCP).
// Open Sans (text): 300 perex v řádku článku, 400/500/600/700 běžný text
// (`.prose a` 500, tučné 600/700). Bez 800 — extra tučné jsou jen nadpisy (Poppins).
const openSans = Open_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-open-sans',
  display: 'swap',
})

const poppins = Poppins({
  // Poppins nesou jen nadpisy (font-heading): 600 semibold (panely, h3–h6),
  // 700 bold (h1–h2, sekce), 800 extra tučné nadpisy sekcí na složených
  // Praktických informacích — Poppins má bold (700) opticky slabý, bez nahraného
  // řezu by ho prohlížeč jen uměle ztučnil (nehezké) nebo nechal na 700.
  // 400 pro `font-normal` u nadpisů z rich textu. Žádný nadpis není light (300)
  // ani medium (500), ty řezy se nenačítají.
  weight: ['400', '600', '700', '800'],
  subsets: ['latin', 'latin-ext'],
  variable: '--font-poppins',
  display: 'swap',
})

// 2. SEO METADATA
// Výchozí <title>/<meta description> a společné části Open Graph. Stránky si
// titulek, popisek, canonical a OG skládají přes `buildPageMetadata` v
// src/lib/seo.ts (Next vnořená pole jako `openGraph` mezi layoutem a stránkou
// neslučuje, proto je tady jen fallback pro routy bez vlastních metadat).
// `metadataBase` dělá z relativních adres (canonical, og:image) absolutní.
export const metadata: Metadata = {
  metadataBase: getSiteURLObject(),
  title: {
    template: `%s | ${SITE_TITLE_SUFFIX}`,
    default: `${SITE_TITLE_SUFFIX} – Cestovní průvodce`,
  },
  description: DEFAULT_DESCRIPTION,
  alternates: { types: RSS_ALTERNATE },
  openGraph: { type: 'website', siteName: SITE_NAME, locale: 'cs_CZ' },
  twitter: { card: 'summary' },
}

// Barva lišty prohlížeče na mobilu (a v manifestu) = modrá hlavičky webu.
export const viewport: Viewport = {
  themeColor: '#215491',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Navigaci a přihlášeného uživatele načítáme SOUBĚŽNĚ — jsou na sobě
  // nezávislé a hlavička potřebuje obojí.
  const [{ data }, currentUser] = await Promise.all([fetchRootPages(), getCurrentUser()])

  // Ořežeme navigační strom jen na pole, která Header reálně používá. Bez toho by se
  // celý `depth=2` strom (včetně `text`/`meta`/… všech stránek a článků) serializoval
  // do RSC payloadu na každé stránce a nafoukl HTML zdroj o megabajty.
  const headerPages = (data.pages ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    fullSlug: p.fullSlug,
    category: p.category,
    children: p.children?.docs
      ? {
          docs: p.children.docs.map((c) => ({
            id: c.id,
            title: c.title,
            fullSlug: c.fullSlug,
          })),
        }
      : undefined,
  }))

  // Logo SVG sanitizujeme na SERVERU a Headeru (klient) předáme hotový string —
  // tím se DOMPurify nedostane do klientského bundlu.
  const headerLogo = data.global?.header?.logo ?? null
  const headerLogoSvg = headerLogo?.svgCode ? sanitizeHeaderLogoSvg(headerLogo.svgCode) : null

  return (
    // data-scroll-behavior říká Nextu, že plynulé scrollování (globals.css:
    // scroll-behavior smooth) je záměr — Next ho pak při přechodech mezi
    // stránkami dočasně vypne (scroll nahoru je okamžitý) a zmizí warning
    // „missing-data-scroll-behavior" v konzoli.
    <html
      lang="cs"
      data-scroll-behavior="smooth"
      className={`${openSans.variable} ${poppins.variable}`}
    >
      <body className="antialiased">
        {/* Měření návštěvnosti se souhlasem. Jen v produkci — jinak by si vývoj
            zanášel statistiky vlastními průchody. */}
        {isProduction() && <Analytics />}

        {/* Skip link pro klávesnici/čtečky — skrytý, dokud nedostane fokus (Tab). */}
        <a
          href="#obsah"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[400] focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:font-semibold focus:text-[#215491] focus:shadow-lg"
        >
          Přeskočit na obsah
        </a>
        {!isProduction() && <WebVitals />}

        {/* Progress bar pro pomalejší přechody mezi stránkami (rychlé proběhnou bez něj). */}
        <NavigationProgress />

        {/* Zvětšování fotek v obsahu (odkazy rel="lightbox") přes PhotoSwipe. */}
        <RichTextLightbox />

        {/* HLAVNÍ KONTEJNER: flex rozložení pro menu a obsah */}
        <div className="flex flex-col min-h-screen">
          {/* Header renderujeme vždy (i když se navigace nenačte — fetchRootPages
              vrací pages: [] při výpadku DB) — logo, hledání a CTA tak zůstanou. */}
          <Header
            pages={headerPages}
            headerLogo={headerLogo}
            logoSvgHtml={headerLogoSvg}
            user={currentUser}
            // Klíč Turnstile pro přihlašovací okno (registrace/obnova hesla
            // uvnitř okna) — čte se na serveru, klientovi jde jen veřejná část.
            turnstileSiteKey={getTurnstileSiteKey()}
          />
          <div className="grow w-full">{children}</div>
          <Footer />
        </div>
      </body>
    </html>
  )
}
