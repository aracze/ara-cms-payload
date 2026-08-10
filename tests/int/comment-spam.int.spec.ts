import { describe, it, expect } from 'vitest'
import { BUCKET_MAX_KEYS, isRateLimited, underCooldown } from '@/lib/comment-spam'

/**
 * Regresní testy vyhazování z map limitů (viz review PR #60):
 * `Map.set()` existující klíč NEPŘESOUVÁ na konec pořadí vložení, takže bez
 * delete→set by aktivní klíče ležely na začátku mapy a přetečení stropu by
 * je vyhodilo dřív než dávno nepoužité — právě běžící limit by ztratil stav.
 */

const T0 = 1_000_000_000_000 // pevný čas, ať testy nezávisí na hodinách

describe('isRateLimited — vyhazování při přetečení stropu', () => {
  it('šestý komentář v okně je přes limit', () => {
    for (let i = 0; i < 5; i++) {
      expect(isRateLimited('zakladni-limit', T0 + i)).toBe(false)
    }
    expect(isRateLimited('zakladni-limit', T0 + 5)).toBe(true)
  })

  it('aktivní klíč přežije záplavu novými klíči (obnova pořadí přes delete→set)', () => {
    // Klíč vstoupí jako první (začátek pořadí mapy)…
    expect(isRateLimited('aktivni', T0)).toBe(false)
    expect(isRateLimited('aktivni', T0 + 1)).toBe(false)

    // …mapa se zaplní téměř po strop cizími klíči…
    for (let i = 0; i < BUCKET_MAX_KEYS - 1000; i++) {
      isRateLimited(`zaplava-a-${i}`, T0 + 2)
    }

    // …klíč se znovu použije (musí se přesunout na konec pořadí)…
    expect(isRateLimited('aktivni', T0 + 3)).toBe(false)

    // …a další záplava přeteče strop a vynutí vyhazování od začátku mapy.
    for (let i = 0; i < 2000; i++) {
      isRateLimited(`zaplava-b-${i}`, T0 + 4)
    }

    // Klíč má za sebou 3 zaznamenaná použití; další dvě doplní okno na pět
    // a ŠESTÉ volání narazí na limit. Kdyby klíč vyhazování zahodilo (stará
    // chyba), počítal by se od nuly a šesté volání by prošlo.
    expect(isRateLimited('aktivni', T0 + 5)).toBe(false)
    expect(isRateLimited('aktivni', T0 + 6)).toBe(false)
    expect(isRateLimited('aktivni', T0 + 7)).toBe(true)
  })
})

describe('underCooldown — základní chování a obnova po vypršení', () => {
  it('druhé volání v okně je pod cooldownem, po vypršení se klíč obnoví', () => {
    expect(underCooldown('adresa@example.com', T0)).toBe(false)
    expect(underCooldown('adresa@example.com', T0 + 1000)).toBe(true)
    // Po hodině cooldown vyprší a další akce projde (a založí nové okno).
    expect(underCooldown('adresa@example.com', T0 + 61 * 60 * 1000)).toBe(false)
    expect(underCooldown('adresa@example.com', T0 + 62 * 60 * 1000)).toBe(true)
  })

  it('čerstvě obnovený klíč přežije záplavu (zápis přes prošlý klíč nesmí zdědit staré pořadí)', () => {
    // Klíč vstoupí jako první a nechá se VYPRŠET…
    underCooldown('obnoveny', T0)
    // …mezitím mapa nabobtná cizími klíči…
    for (let i = 0; i < BUCKET_MAX_KEYS - 1000; i++) {
      underCooldown(`zaplava-c-${i}`, T0 + 1)
    }
    // …prošlý klíč se obnoví (zápis MUSÍ klíč přesunout na konec pořadí)…
    const poVyprseni = T0 + 61 * 60 * 1000
    expect(underCooldown('obnoveny', poVyprseni)).toBe(false)
    // …a záplava přeteče strop. Vyhazování bere od začátku mapy — tam teď
    // leží prošlé klíče záplavy, ne čerstvě obnovený cooldown.
    for (let i = 0; i < 2000; i++) {
      underCooldown(`zaplava-d-${i}`, poVyprseni + 1)
    }
    // Čerstvý cooldown pořád platí — nesmí ho odnést vyhazování.
    expect(underCooldown('obnoveny', poVyprseni + 2)).toBe(true)
  })
})
