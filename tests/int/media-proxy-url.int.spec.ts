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
})
