import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildPageUrl } from '@/lib/page-url'
import { buildBreadcrumbs } from '@/lib/page-hierarchy'
import { PageCategory } from '@/types/payload'

// Pojistka drobečků (odvození z adresy) sahá do datové vrstvy — mockujeme jen
// ten jeden lehký fetch, žádná databáze se nepotřebuje.
const { lightFetchMock } = vi.hoisted(() => ({ lightFetchMock: vi.fn() }))
vi.mock('@/lib/payload', () => ({ fetchPageLightByFullSlug: lightFetchMock }))

const { breadcrumbsFromSlug } = await import('@/lib/page-ancestors')

// Pravidla navigace jsou popsaná v docs/navigace.md. Testy drží dvě věci, které
// se snadno rozbijí tichou úpravou:
//   1. „Zobrazit v URL" (includeInChildUrlPaths) platí jen pro MÍSTA pod stránkou,
//      ne pro její informační podstránky ani turistické cíle.
//   2. Drobečky jdou po hierarchii CMS: bez nejvyšší úrovně, končí přímým rodičem
//      (u článku místem, pod kterým visí).

const misto = (slug: string, showInUrl = true) => ({
  slug,
  category: PageCategory.Misto_k_navstiveni,
  includeInChildUrlPaths: showInUrl,
})
const cil = (slug: string) => ({ slug, category: PageCategory.Turisticky_cil })
const pocasi = (slug: string) => ({ slug, category: PageCategory.Pocasi })

// Amerika (skrytá) → USA → Wyoming (skrytý) → …
const amerika = misto('amerika', false)
const usa = misto('usa')
const wyoming = misto('wyoming', false)

describe('buildPageUrl: „Zobrazit v URL" platí jen pro místa', () => {
  it('místo pod skrytým státem stát v adrese nemá', () => {
    expect(buildPageUrl([amerika, usa, wyoming, misto('narodni-park-yellowstone')])).toBe(
      '/usa/narodni-park-yellowstone',
    )
  })

  it('vše pod takovým místem dědí zkrácenou cestu', () => {
    expect(
      buildPageUrl([amerika, usa, wyoming, misto('narodni-park-yellowstone'), cil('jezero')]),
    ).toBe('/usa/narodni-park-yellowstone/jezero')
  })

  it('informační podstránka skrytého státu si stát v adrese drží', () => {
    expect(buildPageUrl([amerika, usa, wyoming, pocasi('pocasi')])).toBe('/usa/wyoming/pocasi')
  })

  it('turistický cíl pod skrytým státem si stát drží (parita s legacy)', () => {
    expect(buildPageUrl([amerika, usa, wyoming, cil('devils-tower')])).toBe(
      '/usa/wyoming/devils-tower',
    )
  })

  it('stránka sama je v adrese vždy, i když má „Zobrazit v URL" vypnuté', () => {
    expect(buildPageUrl([amerika, usa, wyoming])).toBe('/usa/wyoming')
    expect(buildPageUrl([amerika])).toBe('/amerika')
  })
})

describe('buildBreadcrumbs: řetězec z hierarchie CMS', () => {
  const chain = [
    { label: 'Amerika', url: '/amerika' },
    { label: 'USA', url: '/usa' },
    { label: 'Kalifornie', url: '/usa/kalifornie' },
    { label: 'San Francisco', url: '/usa/san-francisco' },
  ]

  it('vynechá nejvyšší úroveň a aktuální stránku', () => {
    expect(buildBreadcrumbs({ breadcrumbs: chain })).toEqual([
      { title: 'USA', href: '/usa' },
      { title: 'Kalifornie', href: '/usa/kalifornie' },
    ])
  })

  it('u článku (includeSelf) končí místem, pod kterým visí', () => {
    expect(buildBreadcrumbs({ breadcrumbs: chain }, { includeSelf: true })).toEqual([
      { title: 'USA', href: '/usa' },
      { title: 'Kalifornie', href: '/usa/kalifornie' },
      { title: 'San Francisco', href: '/usa/san-francisco' },
    ])
  })

  it('stránka hned pod nejvyšší úrovní drobečky nemá', () => {
    expect(buildBreadcrumbs({ breadcrumbs: chain.slice(0, 2) })).toEqual([])
  })

  it('chybějící nebo neúplný řetězec nespadne', () => {
    expect(buildBreadcrumbs(null)).toEqual([])
    expect(buildBreadcrumbs({ breadcrumbs: [] })).toEqual([])
    expect(buildBreadcrumbs({ breadcrumbs: [...chain, { label: null, url: null }] })).toEqual([
      { title: 'USA', href: '/usa' },
      { title: 'Kalifornie', href: '/usa/kalifornie' },
      { title: 'San Francisco', href: '/usa/san-francisco' },
    ])
  })
})

// Pojistka pro stránky (a stejně tak články), kterým chybí uložený řetězec
// `breadcrumbs` — jinak by drobečky i BreadcrumbList zmizely úplně.
describe('breadcrumbsFromSlug: pojistka z adresy', () => {
  beforeEach(() => lightFetchMock.mockReset())

  const page = (title: string, fullSlug: string) => ({ data: { pages: [{ title, fullSlug }] } })

  it('složí předky z prefixů adresy', async () => {
    lightFetchMock.mockImplementation(async (slug: string) =>
      slug === 'usa'
        ? page('USA', '/usa')
        : slug === 'usa/san-francisco'
          ? page('San Francisco', '/usa/san-francisco')
          : { data: { pages: [] } },
    )

    await expect(breadcrumbsFromSlug('/usa/san-francisco/alcatraz')).resolves.toEqual([
      { title: 'USA', href: '/usa' },
      { title: 'San Francisco', href: '/usa/san-francisco' },
    ])
  })

  it('předka chybějícího v CMS nahradí zástupným ze slugu (řetězec se neutrhne)', async () => {
    lightFetchMock.mockImplementation(async (slug: string) =>
      slug === 'usa' ? page('USA', '/usa') : { data: { pages: [] } },
    )

    await expect(breadcrumbsFromSlug('/usa/skryte-misto/cil')).resolves.toEqual([
      { title: 'USA', href: '/usa' },
      { title: 'Skryte misto', href: '/usa/skryte-misto' },
    ])
  })

  it('stránka bez rodiče vrací prázdno', async () => {
    await expect(breadcrumbsFromSlug('/usa')).resolves.toEqual([])
    expect(lightFetchMock).not.toHaveBeenCalled()
  })
})
