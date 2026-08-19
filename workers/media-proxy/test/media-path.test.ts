import { describe, expect, it } from 'vitest'
import {
  cfImageOptions,
  deriveR2Keys,
  isValidTransform,
  negotiateFormat,
  parsePath,
} from '../src/media-path'

describe('parsePath', () => {
  it('rozparsuje URL z next/image loaderu (transformace + verze + přípona)', () => {
    const result = parsePath(
      '/image/upload/f_auto,q_auto,c_limit,w_640/v1753093400/mn4obrhlr3khap1ocrej.jpg',
    )
    expect(result).toEqual({
      ok: true,
      path: {
        resourceType: 'image',
        transform: 'f_auto,q_auto,c_limit,w_640',
        version: 'v1753093400/',
        key: 'mn4obrhlr3khap1ocrej.jpg',
      },
    })
  })

  it('rozparsuje legacy rich-text URL bez verze a přípony', () => {
    const result = parsePath('/image/upload/c_fit,w_790/mn4obrhlr3khap1ocrej')
    expect(result).toEqual({
      ok: true,
      path: {
        resourceType: 'image',
        transform: 'c_fit,w_790',
        version: '',
        key: 'mn4obrhlr3khap1ocrej',
      },
    })
  })

  it('rozparsuje upload node bez transformace a SVG na raw', () => {
    expect(parsePath('/image/upload/v123/abc.png')).toEqual({
      ok: true,
      path: { resourceType: 'image', transform: null, version: 'v123/', key: 'abc.png' },
    })
    expect(parsePath('/raw/upload/v123/ikona.svg')).toEqual({
      ok: true,
      path: { resourceType: 'raw', transform: null, version: 'v123/', key: 'ikona.svg' },
    })
  })

  it('zachová složku avatarů v klíči', () => {
    const result = parsePath('/image/upload/f_avif,q_auto,c_limit,w_96/v5/avatars/avatar-12-99.png')
    expect(result.ok && result.path.key).toBe('avatars/avatar-12-99.png')
  })

  it('projde transformace karet a mapy (celý slovník webu)', () => {
    for (const transform of [
      'f_auto,q_auto,c_fill,g_auto,ar_5:7,w_384',
      'f_auto,q_auto,c_fill,g_auto,ar_21:8,w_828',
      'w_44,h_44,c_fill,g_auto,r_max,bo_3px_solid_white,f_png',
      'w_220,h_126,c_fill,g_auto,f_auto,q_auto',
      'c_limit,w_1600,f_auto,q_auto',
      'f_auto,q_75,c_limit,w_1920',
    ]) {
      expect(parsePath(`/image/upload/${transform}/v1/x.jpg`).ok, transform).toBe(true)
    }
  })

  it('složka s podtržítkem v public_id NENÍ transformace (CodeRabbit)', () => {
    expect(parsePath('/image/upload/foo_bar/photo.jpg')).toEqual({
      ok: true,
      path: { resourceType: 'image', transform: null, version: '', key: 'foo_bar/photo.jpg' },
    })
  })

  it('odmítne /image/fetch/ (proxování cizích URL) → 404', () => {
    expect(parsePath('/image/fetch/https://example.com/x.jpg')).toEqual({ ok: false, status: 404 })
  })

  it('odmítne šířku mimo množinu a cizí transformace → 400', () => {
    expect(parsePath('/image/upload/f_auto,q_auto,c_limit,w_3841/v1/x.jpg')).toEqual({
      ok: false,
      status: 400,
    })
    expect(parsePath('/image/upload/e_blur:300,w_640/v1/x.jpg')).toEqual({ ok: false, status: 400 })
    // Jednosložková transformace bez čárky — web ji nikdy negeneruje.
    expect(parsePath('/image/upload/e_blur:300/v1/x.jpg')).toEqual({ ok: false, status: 400 })
    expect(parsePath('/image/upload/t_named/v1/x.jpg')).toEqual({ ok: false, status: 400 })
  })

  it('odmítne prázdné a podezřelé klíče → 404', () => {
    expect(parsePath('/image/upload/')).toEqual({ ok: false, status: 404 })
    expect(parsePath('/image/upload/c_fit,w_790')).toEqual({ ok: false, status: 404 })
    expect(parsePath('/image/upload/v1/../tajne.jpg')).toEqual({ ok: false, status: 404 })
    expect(parsePath('/image/upload/v1//x.jpg')).toEqual({ ok: false, status: 404 })
    expect(parsePath('/neco/jineho')).toEqual({ ok: false, status: 404 })
  })
})

describe('isValidTransform', () => {
  it('odmítne příliš dlouhý segment a příliš mnoho komponent', () => {
    expect(isValidTransform('f_auto,' + 'q_auto,'.repeat(20) + 'w_640')).toBe(false)
    expect(isValidTransform(`f_auto,q_auto,c_limit,w_640,${'x'.repeat(100)}`)).toBe(false)
  })
})

describe('negotiateFormat', () => {
  const CHROME_ACCEPT = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'

  it('f_auto → f_avif pro moderní prohlížeč', () => {
    expect(negotiateFormat('f_auto,q_auto,c_limit,w_640', CHROME_ACCEPT)).toBe(
      'f_avif,q_auto,c_limit,w_640',
    )
  })

  it('f_auto → f_webp bez AVIF podpory', () => {
    expect(negotiateFormat('f_auto,q_auto,c_limit,w_640', 'image/webp,*/*')).toBe(
      'f_webp,q_auto,c_limit,w_640',
    )
  })

  it('f_auto se bez moderního formátu odebere (ne f_jpg — PNG průhlednost)', () => {
    expect(negotiateFormat('f_auto,q_auto,c_limit,w_640', '*/*')).toBe('q_auto,c_limit,w_640')
  })

  it('respektuje q=0 v Accept (výslovné odmítnutí formátu, CodeRabbit)', () => {
    expect(negotiateFormat('f_auto,q_auto,c_limit,w_640', 'image/avif;q=0,image/webp')).toBe(
      'f_webp,q_auto,c_limit,w_640',
    )
    expect(negotiateFormat('f_auto,q_auto,c_limit,w_640', 'image/avif;q=0.8,image/webp')).toBe(
      'f_avif,q_auto,c_limit,w_640',
    )
    expect(negotiateFormat('f_auto,q_auto,c_limit,w_640', 'image/avif;q=0,image/webp;q=0')).toBe(
      'q_auto,c_limit,w_640',
    )
  })

  it('transformace bez f_auto se nemění (jediný keš záznam)', () => {
    expect(negotiateFormat('c_fit,w_790', CHROME_ACCEPT)).toBe('c_fit,w_790')
    expect(negotiateFormat(null, CHROME_ACCEPT)).toBeNull()
  })
})

describe('deriveR2Keys', () => {
  it('klíč s příponou vrací beze změny, .jpeg normalizuje na .jpg', () => {
    expect(deriveR2Keys('abc.jpg')).toEqual(['abc.jpg'])
    expect(deriveR2Keys('abc.JPEG')).toEqual(['abc.jpg'])
    expect(deriveR2Keys('avatars/avatar-1-2.png')).toEqual(['avatars/avatar-1-2.png'])
  })

  it('bez přípony zkouší kandidáty (legacy rich-text adresy)', () => {
    expect(deriveR2Keys('mn4obrhlr3khap1ocrej')).toEqual([
      'mn4obrhlr3khap1ocrej.jpg',
      'mn4obrhlr3khap1ocrej.png',
      'mn4obrhlr3khap1ocrej.webp',
    ])
  })

  it('dekóduje URL-encoded znaky (klíče v R2 jsou neenkódované)', () => {
    expect(deriveR2Keys('slo%C5%BEka/foto%20a.jpg')).toEqual(['složka/foto a.jpg'])
  })
})

describe('cfImageOptions', () => {
  it('mapuje loader transformaci (c_limit → scale-down)', () => {
    expect(cfImageOptions('f_avif,q_auto,c_limit,w_640')).toEqual({
      width: 640,
      fit: 'scale-down',
      format: 'avif',
    })
  })

  it('dopočítá výšku z ar_X:Y u karet', () => {
    expect(cfImageOptions('f_webp,q_auto,c_fill,g_auto,ar_5:7,w_384')).toEqual({
      width: 384,
      height: Math.round((384 * 7) / 5),
      fit: 'cover',
      gravity: 'auto',
      format: 'webp',
    })
  })

  it('marker mapy: w/h přímo, r_max a bo_* se ignorují', () => {
    expect(cfImageOptions('w_44,h_44,c_fill,g_auto,r_max,bo_3px_solid_white,f_png')).toEqual({
      width: 44,
      height: 44,
      fit: 'cover',
      gravity: 'auto',
    })
  })

  it('bez transformace vrací null (podá se originál)', () => {
    expect(cfImageOptions(null)).toBeNull()
  })
})
