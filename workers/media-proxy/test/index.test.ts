import { describe, expect, it } from 'vitest'
import mediaProxy, { type Env } from '../src/index'
import { robotsTxt } from '../src/media-path'

// /robots.txt se obslouží před parsováním cesty a bez sítě i R2 — prázdný Env stačí.
const env = {} as Env
const call = (method: string, path: string) =>
  mediaProxy.fetch(new Request(`https://media.ara.cz${path}`, { method }), env)

describe('media proxy: /robots.txt', () => {
  it('GET vrátí text robots.txt s hlavičkami a denní keší', async () => {
    const response = await call('GET', '/robots.txt')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('public, max-age=86400')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await response.text()).toBe(robotsTxt())
  })

  it('HEAD vrátí stejné hlavičky a prázdné tělo', async () => {
    const response = await call('HEAD', '/robots.txt')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('public, max-age=86400')
    expect(response.body).toBeNull()
  })

  it('query string ani jiná metoda robots.txt neobslouží jinak než web', async () => {
    // Query se u fotek zahazuje; u robots.txt platí totéž (boti ho nepřidávají).
    expect((await call('GET', '/robots.txt?x=1')).status).toBe(200)
    expect((await call('POST', '/robots.txt')).status).toBe(405)
  })
})
