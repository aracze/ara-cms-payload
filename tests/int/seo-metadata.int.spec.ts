import { describe, it, expect } from 'vitest'

// SEO metadata (src/lib/seo.ts): titulek a popisek z CMS pole `meta` s
// fallbacky, absolutní canonical, Open Graph a JSON-LD článku. Hlídá hlavně
// zacházení s legacy titulky („… • Ara.cz") a zkracování popisku.
import {
  articleJsonLd,
  buildPageMetadata,
  DEFAULT_DESCRIPTION,
  DESCRIPTION_MAX,
  resolveSeoDescription,
  resolveSeoTitle,
  SITE_NAME,
  SITE_TITLE_SUFFIX,
  stripSiteSuffix,
  truncateDescription,
} from '@/lib/seo'
import { getSiteURL } from '@/lib/utils'

const lexical = (paragraphs: string[]) => ({
  root: {
    type: 'root',
    children: paragraphs.map((text) => ({
      type: 'paragraph',
      children: [{ type: 'text', text }],
    })),
  },
})

describe('stripSiteSuffix — přípona webu z legacy/plugin titulků', () => {
  it('odřízne „• Ara.cz" ze starého webu i „| Ara.cz" z plugin-seo', () => {
    expect(stripSiteSuffix('Astana: Cestovní průvodce Astanou • Ara.cz')).toBe(
      'Astana: Cestovní průvodce Astanou',
    )
    expect(stripSiteSuffix('Norsko | Ara.cz')).toBe('Norsko')
    expect(stripSiteSuffix('Norsko - Ara.cz ')).toBe('Norsko')
  })

  it('zvládne i legacy varianty s frází a překlep „•vAra.cz"', () => {
    expect(stripSiteSuffix('Salzburská ZOO - cestovní průvodce Ara.cz')).toBe('Salzburská ZOO')
    expect(stripSiteSuffix('Podmořské jeskyně Nereo: Cestovní průvodce Ara.cz')).toBe(
      'Podmořské jeskyně Nereo',
    )
    expect(stripSiteSuffix('Top ze světa - Cestovní inspirace Ara.cz')).toBe('Top ze světa')
    expect(stripSiteSuffix('Victoria: Cestovní průvodce Gozo •vAra.cz')).toBe(
      'Victoria: Cestovní průvodce Gozo',
    )
    expect(stripSiteSuffix('Reklama a spolupráce na Ara.cz')).toBe('Reklama a spolupráce na Ara.cz')
  })

  it('titulek bez přípony nechá být (včetně „Ara.cz" uprostřed)', () => {
    expect(stripSiteSuffix('O webu Ara.cz a jeho autorech')).toBe('O webu Ara.cz a jeho autorech')
  })
})

describe('resolveSeoTitle — SEO titulek z CMS má přednost', () => {
  it('vyplněný meta.title → bez přípony (tu přidá layout šablona `%s | Ara.cz`)', () => {
    expect(
      resolveSeoTitle({ title: 'Vstupní podmínky a víza do Srbska • Ara.cz' }, 'fallback'),
    ).toBe('Vstupní podmínky a víza do Srbska')
    expect(SITE_TITLE_SUFFIX).toBe(SITE_NAME)
  })

  it('prázdný/chybějící meta.title → fallback', () => {
    expect(resolveSeoTitle(null, 'Norsko')).toBe('Norsko')
    expect(resolveSeoTitle({ title: '   ' }, 'Norsko')).toBe('Norsko')
    // Jen přípona bez obsahu = jako prázdný.
    expect(resolveSeoTitle({ title: '• Ara.cz' }, 'Norsko')).toBe('Norsko')
  })
})

describe('truncateDescription — zkrácení na hranici slova', () => {
  it('krátký text nemění, dlouhý usekne na slovo a přidá výpustku', () => {
    expect(truncateDescription('Krátký popis.')).toBe('Krátký popis.')
    const long = Array.from({ length: 40 }, (_, i) => `slovo${i}`).join(' ')
    const out = truncateDescription(long)
    expect(out.length).toBeLessThanOrEqual(DESCRIPTION_MAX)
    expect(out.endsWith('…')).toBe(true)
    // Všechna slova před výpustkou jsou celá (žádné useknuté „slov…").
    expect(
      out
        .slice(0, -1)
        .split(' ')
        .every((w) => /^slovo\d+$/.test(w)),
    ).toBe(true)
  })

  it('sbalí bílé znaky a nenechá před výpustkou čárku', () => {
    expect(truncateDescription('a,   b\n c', 3)).toBe('a…')
  })
})

describe('resolveSeoDescription — CMS popisek, jinak začátek textu', () => {
  it('vyplněný meta.description vrací beze změny (i delší než limit)', () => {
    const custom = 'x'.repeat(200)
    expect(resolveSeoDescription({ description: custom }, lexical(['Text']))).toBe(custom)
  })

  it('bez meta → plain text z rich textu, zkrácený', () => {
    const text = lexical(['Norsko je země fjordů.', 'Druhý odstavec ' + 'dlouhý '.repeat(40)])
    const out = resolveSeoDescription(null, text)!
    expect(out.startsWith('Norsko je země fjordů. Druhý odstavec')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(DESCRIPTION_MAX)
  })

  it('bez meta a bez textu → undefined (uplatní se výchozí z layoutu)', () => {
    expect(resolveSeoDescription(null, lexical([]))).toBeUndefined()
    expect(resolveSeoDescription({ description: ' ' }, null)).toBeUndefined()
    expect(DEFAULT_DESCRIPTION.length).toBeLessThanOrEqual(DESCRIPTION_MAX)
  })
})

describe('buildPageMetadata — canonical + Open Graph', () => {
  it('stránka: absolutní canonical, OG website se siteName/locale, bez fotky výchozí obrázek', () => {
    const m = buildPageMetadata({ title: 'Norsko', description: 'Popis', path: '/norsko' })
    expect(m.alternates?.canonical).toBe(`${getSiteURL()}/norsko`)
    expect(m.openGraph).toMatchObject({
      type: 'website',
      url: `${getSiteURL()}/norsko`,
      siteName: SITE_NAME,
      locale: 'cs_CZ',
      images: [{ url: `${getSiteURL()}/og-default.png` }],
    })
    expect(m.twitter).toEqual({ card: 'summary_large_image' })
  })

  it('článek: OG article s časy a autorem, Cloudinary fotka dostane zmenšení', () => {
    const m = buildPageMetadata({
      title: { absolute: 'Dva týdny v Myanmaru | Ara.cz' },
      path: '/myanmar/dva-tydny-v-myanmaru',
      imageUrl: 'https://res.cloudinary.com/ara/image/upload/v1/foto.jpg',
      type: 'article',
      publishedTime: '2019-03-12T22:00:00.000Z',
      modifiedTime: '2026-08-01T10:00:00.000Z',
      authors: [`${getSiteURL()}/profil/panda`],
    })
    expect(m.openGraph).toMatchObject({
      type: 'article',
      publishedTime: '2019-03-12T22:00:00.000Z',
      modifiedTime: '2026-08-01T10:00:00.000Z',
      authors: [`${getSiteURL()}/profil/panda`],
    })
    const og = m.openGraph as { images: { url: string }[] }
    expect(og.images[0].url).toMatch(/\/upload\/f_auto,q_auto,c_limit,w_1200\/v1\/foto\.jpg$/)
    expect(m.twitter).toEqual({ card: 'summary_large_image' })
  })

  it('relativní Payload upload se stane absolutním', () => {
    const m = buildPageMetadata({ title: 'X', path: '/x', imageUrl: '/api/media/file/a.jpg' })
    const og = m.openGraph as { images: { url: string }[] }
    expect(og.images[0].url).toMatch(/^https?:\/\/.+\/api\/media\/file\/a\.jpg$/)
  })
})

describe('articleJsonLd — schema.org Article', () => {
  it('obsahuje autora, data, vydavatele a kanonickou URL; escapuje „<"', () => {
    const json = articleJsonLd({
      title: 'Za ayahuascou <do> pralesa',
      description: 'Popis',
      path: '/ekvador/za-ayahuascou',
      imageUrl: 'https://res.cloudinary.com/ara/image/upload/v1/x.jpg',
      publishedAt: '2019-03-12T22:00:00.000Z',
      modifiedAt: '2026-08-01T10:00:00.000Z',
      author: { name: 'Maria M.', profilePath: '/profil/Panda' },
    })
    expect(json).not.toContain('<')
    const data = JSON.parse(json)
    expect(data).toMatchObject({
      '@type': 'Article',
      headline: 'Za ayahuascou <do> pralesa',
      datePublished: '2019-03-12T22:00:00.000Z',
      dateModified: '2026-08-01T10:00:00.000Z',
      author: { '@type': 'Person', name: 'Maria M.', url: `${getSiteURL()}/profil/Panda` },
      publisher: { '@type': 'Organization', name: SITE_NAME },
      mainEntityOfPage: `${getSiteURL()}/ekvador/za-ayahuascou`,
      inLanguage: 'cs',
    })
    expect(data.image[0]).toContain('w_1200')
  })

  it('bez autora je autorem web (Organization)', () => {
    const data = JSON.parse(articleJsonLd({ title: 'T', path: '/a/b' }))
    expect(data.author).toEqual({ '@type': 'Organization', name: SITE_NAME, url: getSiteURL() })
    expect(data).not.toHaveProperty('image')
    expect(data).not.toHaveProperty('datePublished')
  })
})
