import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Přepis adres fotek na media proxy (media.ara.cz, viz workers/media-proxy).
 *
 * `toMediaProxy` čte NEXT_PUBLIC_MEDIA_BASE_URL při importu modulu, takže se
 * mezi scénáři resetují moduly a env podvrhává přes `vi.stubEnv`. Hlídá se
 * hlavně: přepis JEN produkčního cloudu `ara`, no-op bez nastavené env
 * (dev) a to, že rich-text zachovává verzi + příponu (bez verze by fotka
 * vyměněná pod stejným public_id zůstala navěky v immutable keši proxy,
 * bez přípony nejde odvodit klíč v R2 záloze).
 */

// Dynamické importy (čerstvý modul po stubEnv) platí studený transform
// isomorphic-dompurify — v paralelním běhu to umí přerůst výchozích 5 s.
vi.setConfig({ testTimeout: 30_000 })

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

const ORIGINAL = 'https://res.cloudinary.com/ara/image/upload/v123/abc.jpg'
const PROXIED = 'https://media.ara.cz/image/upload/v123/abc.jpg'

describe('toMediaProxy', () => {
  it('bez NEXT_PUBLIC_MEDIA_BASE_URL nic nepřepisuje (dev režim)', async () => {
    vi.stubEnv('NEXT_PUBLIC_MEDIA_BASE_URL', '')
    const { toMediaProxy } = await import('@/lib/cloudinary-loader')
    expect(toMediaProxy(ORIGINAL)).toBe(ORIGINAL)
  })

  it('přepíše produkční cloud ara na media proxy', async () => {
    vi.stubEnv('NEXT_PUBLIC_MEDIA_BASE_URL', 'https://media.ara.cz')
    const { toMediaProxy } = await import('@/lib/cloudinary-loader')
    expect(toMediaProxy(ORIGINAL)).toBe('https://media.ara.cz/image/upload/v123/abc.jpg')
  })

  it('cizí cloud a ne-Cloudinary adresy nechává být', async () => {
    vi.stubEnv('NEXT_PUBLIC_MEDIA_BASE_URL', 'https://media.ara.cz')
    const { toMediaProxy } = await import('@/lib/cloudinary-loader')
    expect(toMediaProxy('https://res.cloudinary.com/dev-cloud/image/upload/v1/x.jpg')).toBe(
      'https://res.cloudinary.com/dev-cloud/image/upload/v1/x.jpg',
    )
    expect(toMediaProxy('/assets/logo.svg')).toBe('/assets/logo.svg')
    expect(toMediaProxy('https://inviacdn.net/foto.jpg')).toBe('https://inviacdn.net/foto.jpg')
  })

  it('cloudinaryVariant složí transformaci a až pak přepíše host', async () => {
    vi.stubEnv('NEXT_PUBLIC_MEDIA_BASE_URL', 'https://media.ara.cz')
    const { cloudinaryVariant } = await import('@/lib/cloudinary-loader')
    expect(cloudinaryVariant(ORIGINAL, 'f_auto,q_auto,c_limit,w_640')).toBe(
      'https://media.ara.cz/image/upload/f_auto,q_auto,c_limit,w_640/v123/abc.jpg',
    )
  })

  it('isCloudinary kontroluje hostitele, ne podřetězec (CodeQL)', async () => {
    vi.stubEnv('NEXT_PUBLIC_MEDIA_BASE_URL', 'https://media.ara.cz')
    const { isCloudinary } = await import('@/lib/cloudinary-loader')
    expect(isCloudinary(ORIGINAL)).toBe(true)
    expect(isCloudinary('https://res.cloudinary.com.utocnik.cz/image/upload/x.jpg')).toBe(false)
    expect(isCloudinary('https://utocnik.cz/res.cloudinary.com/image/upload/x.jpg')).toBe(false)
    expect(isCloudinary('/assets/upload/logo.svg')).toBe(false)
  })

  it('adresa už přepsaná na proxy (data z CMS) projde variantou i loaderem', async () => {
    vi.stubEnv('NEXT_PUBLIC_MEDIA_BASE_URL', 'https://media.ara.cz')
    const { cloudinaryVariant, isCloudinary, toMediaProxy } =
      await import('@/lib/cloudinary-loader')
    expect(isCloudinary(PROXIED)).toBe(true)
    expect(toMediaProxy(PROXIED)).toBe(PROXIED) // idempotentní
    expect(cloudinaryVariant(PROXIED, 'f_auto,q_auto,c_limit,w_640')).toBe(
      'https://media.ara.cz/image/upload/f_auto,q_auto,c_limit,w_640/v123/abc.jpg',
    )
  })
})

describe('fromMediaProxy', () => {
  it('převede proxy adresu zpět na kanonickou Cloudinary podobu', async () => {
    vi.stubEnv('NEXT_PUBLIC_MEDIA_BASE_URL', 'https://media.ara.cz')
    const { fromMediaProxy } = await import('@/lib/cloudinary-loader')
    expect(fromMediaProxy(PROXIED)).toBe(ORIGINAL)
    expect(fromMediaProxy(ORIGINAL)).toBe(ORIGINAL)
    expect(fromMediaProxy('/assets/logo.svg')).toBe('/assets/logo.svg')
  })

  it('bez env (dev) nechává všechno být', async () => {
    vi.stubEnv('NEXT_PUBLIC_MEDIA_BASE_URL', '')
    const { fromMediaProxy } = await import('@/lib/cloudinary-loader')
    expect(fromMediaProxy(PROXIED)).toBe(PROXIED)
  })
})

describe('hooky kolekcí médií (media-proxy.ts)', () => {
  it('afterRead přepíše url i thumbnailURL na proxy', async () => {
    vi.stubEnv('NEXT_PUBLIC_MEDIA_BASE_URL', 'https://media.ara.cz')
    const { rewriteUploadUrlsToMediaProxy } = await import('@/hooks/media-proxy')
    const doc = {
      url: ORIGINAL,
      thumbnailURL: 'https://res.cloudinary.com/ara/image/upload/c_fit,w_300/v123/abc.jpg',
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = (rewriteUploadUrlsToMediaProxy as any)({ doc })
    expect(out.url).toBe(PROXIED)
    expect(out.thumbnailURL).toBe('https://media.ara.cz/image/upload/c_fit,w_300/v123/abc.jpg')
  })

  it('beforeChange normalizuje url zpět na Cloudinary (DB zůstává kanonická)', async () => {
    vi.stubEnv('NEXT_PUBLIC_MEDIA_BASE_URL', 'https://media.ara.cz')
    const { normalizeUploadUrlsToCloudinary } = await import('@/hooks/media-proxy')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = (normalizeUploadUrlsToCloudinary as any)({ data: { url: PROXIED } })
    expect(out.url).toBe(ORIGINAL)
  })
})

describe('richTextToHtml — contentImage', () => {
  const contentImageDoc = {
    root: {
      children: [
        {
          type: 'block',
          fields: {
            blockType: 'contentImage',
            image: { url: ORIGINAL, alt: 'Popisek', width: 1580, height: 1000 },
            caption: '',
          },
        },
      ],
    },
  }

  it('zachová verzi i příponu a použije media proxy', async () => {
    vi.stubEnv('NEXT_PUBLIC_MEDIA_BASE_URL', 'https://media.ara.cz')
    const { richTextToHtml } = await import('@/lib/rich-text-html')
    const html = richTextToHtml(contentImageDoc)
    expect(html).toContain('src="https://media.ara.cz/image/upload/c_fit,w_790/v123/abc.jpg"')
    expect(html).toContain('https://media.ara.cz/image/upload/c_fit,w_420/v123/abc.jpg 420w')
    expect(html).toContain(
      'href="https://media.ara.cz/image/upload/c_limit,w_1600,f_auto,q_auto/v123/abc.jpg"',
    )
  })

  it('bez env zůstává na Cloudinary (dev), verze + přípona nově taky', async () => {
    vi.stubEnv('NEXT_PUBLIC_MEDIA_BASE_URL', '')
    const { richTextToHtml } = await import('@/lib/rich-text-html')
    const html = richTextToHtml(contentImageDoc)
    expect(html).toContain(
      'src="https://res.cloudinary.com/ara/image/upload/c_fit,w_790/v123/abc.jpg"',
    )
  })

  it('upload node (prostý <img>) se přepisuje taky', async () => {
    vi.stubEnv('NEXT_PUBLIC_MEDIA_BASE_URL', 'https://media.ara.cz')
    const { richTextToHtml } = await import('@/lib/rich-text-html')
    const html = richTextToHtml({
      root: { children: [{ type: 'upload', value: { url: ORIGINAL, alt: 'Foto' } }] },
    })
    expect(html).toContain('src="https://media.ara.cz/image/upload/v123/abc.jpg"')
  })

  it('vstup už na proxy (data z CMS po afterRead hooku) → varianty i lightbox fungují', async () => {
    vi.stubEnv('NEXT_PUBLIC_MEDIA_BASE_URL', 'https://media.ara.cz')
    const { richTextToHtml } = await import('@/lib/rich-text-html')
    const html = richTextToHtml({
      root: {
        children: [
          {
            type: 'block',
            fields: {
              blockType: 'contentImage',
              image: { url: PROXIED, alt: 'Popisek', width: 1580, height: 1000 },
              caption: '',
            },
          },
        ],
      },
    })
    expect(html).toContain('src="https://media.ara.cz/image/upload/c_fit,w_790/v123/abc.jpg"')
    expect(html).toContain(
      'href="https://media.ara.cz/image/upload/c_limit,w_1600,f_auto,q_auto/v123/abc.jpg"',
    )
  })
})
