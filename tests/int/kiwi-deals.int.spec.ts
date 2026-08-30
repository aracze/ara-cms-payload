import { describe, expect, it } from 'vitest'
import {
  appendPricePoint,
  belowUsualPercent,
  departureCity,
  flightMatchesCode,
  isSuspiciousPrice,
  pickCheapestPerCode,
  referencePrice,
  sanitizePriceHistory,
  usualPrice,
  type KiwiFlight,
} from '@/lib/kiwi-deals'

const flight = (over: Partial<KiwiFlight>): KiwiFlight => ({
  price: 1000,
  deep_link: 'https://www.kiwi.com/deep?affilid=x',
  local_departure: '2026-10-14T05:00:00.000Z',
  nightsInDest: 7,
  flyFrom: 'PRG',
  cityFrom: 'Prague',
  flyTo: 'FCO',
  cityCodeTo: 'ROM',
  countryTo: { code: 'IT' },
  ...over,
})

describe('flightMatchesCode', () => {
  it('dvoupísmenný kód je země', () => {
    expect(flightMatchesCode(flight({}), 'IT')).toBe(true)
    expect(flightMatchesCode(flight({}), 'it')).toBe(true)
    expect(flightMatchesCode(flight({}), 'ES')).toBe(false)
  })

  it('třípísmenný kód sedí na město i letiště', () => {
    expect(flightMatchesCode(flight({}), 'ROM')).toBe(true)
    expect(flightMatchesCode(flight({}), 'FCO')).toBe(true)
    expect(flightMatchesCode(flight({}), 'MIL')).toBe(false)
  })

  it('prázdný kód nesedí na nic', () => {
    expect(flightMatchesCode(flight({}), '  ')).toBe(false)
  })
})

describe('pickCheapestPerCode', () => {
  it('pro každý kód vybere nejlevnější sedící let, bez shody kód vynechá', () => {
    const flights = [
      flight({ price: 1354, cityCodeTo: 'ROM', flyTo: 'FCO' }),
      flight({ price: 1042, cityCodeTo: 'MIL', flyTo: 'BGY' }),
      flight({ price: 986, cityCodeTo: 'LON', flyTo: 'STN', countryTo: { code: 'GB' } }),
      flight({ price: 500, deep_link: 'http://nezabezpečený', cityCodeTo: 'LON' }),
    ]
    const picked = pickCheapestPerCode(flights, ['IT', 'LON', 'ROM', 'TN'])
    expect(picked.get('IT')?.price).toBe(1042)
    expect(picked.get('ROM')?.price).toBe(1354)
    // http odkaz se nepočítá — vyhrává až https let.
    expect(picked.get('LON')?.price).toBe(986)
    expect(picked.has('TN')).toBe(false)
  })

  it('převede let na tvar nabídky včetně odletového města', () => {
    const picked = pickCheapestPerCode(
      [flight({ price: 1042.4, flyFrom: 'BRQ', cityFrom: 'Brno' })],
      ['IT'],
    )
    expect(picked.get('IT')).toEqual({
      price: 1042,
      deepLink: 'https://www.kiwi.com/deep?affilid=x',
      departureDate: '2026-10-14',
      nights: 7,
      departure: 'Brno',
    })
  })
})

describe('departureCity', () => {
  it('česká letiště překládá podle kódu, cizí nechává z odpovědi', () => {
    expect(departureCity(flight({ flyFrom: 'OSR', cityFrom: 'Ostrava' }))).toBe('Ostrava')
    expect(departureCity(flight({ flyFrom: 'VIE', cityFrom: 'Vienna' }))).toBe('Vienna')
    expect(departureCity(flight({ flyFrom: undefined, cityFrom: undefined }))).toBeNull()
  })
})

describe('historie cen', () => {
  it('appendPricePoint přepíše stejný den, seřadí a zahodí body mimo okno', () => {
    const history = [
      { date: '2026-06-01', price: 900 },
      { date: '2026-08-29', price: 1200 },
      { date: '2026-08-30', price: 1500 },
    ]
    const next = appendPricePoint(history, { date: '2026-08-30', price: 986 }, 90)
    expect(next).toEqual([
      { date: '2026-08-29', price: 1200 },
      { date: '2026-08-30', price: 986 },
    ])
  })

  it('okno drží přesně N dní včetně dneška', () => {
    const next = appendPricePoint(
      [
        { date: '2026-06-02', price: 1 },
        { date: '2026-06-01', price: 1 },
      ],
      { date: '2026-08-30', price: 1 },
      90,
    )
    expect(next.map((p) => p.date)).toEqual(['2026-06-02', '2026-08-30'])
  })

  it('sanitizePriceHistory pustí jen platné body', () => {
    expect(
      sanitizePriceHistory([
        { date: '2026-08-30', price: 986 },
        { date: '30. 8. 2026', price: 986 },
        { date: '2026-08-29', price: -5 },
        { date: '2026-08-28', price: '900' },
        null,
        'x',
      ]),
    ).toEqual([{ date: '2026-08-30', price: 986 }])
    expect(sanitizePriceHistory(undefined)).toEqual([])
  })

  it('usualPrice je medián a chce minimum dní', () => {
    const days = (prices: number[]) =>
      prices.map((price, i) => ({ date: `2026-08-${String(i + 1).padStart(2, '0')}`, price }))
    expect(usualPrice(days([1000, 1100, 1200]), 14)).toBeNull()
    expect(usualPrice(days([1000, 1100, 9000]), 3)).toBe(1100)
    expect(usualPrice(days([1000, 1100, 1200, 1300]), 3)).toBe(1150)
  })

  it('belowUsualPercent hlásí jen rozdíl nad prahem', () => {
    expect(belowUsualPercent(986, 1400)).toBe(30)
    expect(belowUsualPercent(1300, 1400)).toBeNull()
    expect(belowUsualPercent(1500, 1400)).toBeNull()
    expect(belowUsualPercent(986, null)).toBeNull()
    expect(belowUsualPercent(986, 0)).toBeNull()
  })
})

describe('pojistka proti výkyvům hromadného hledání', () => {
  const days = (prices: number[]) =>
    prices.map((price, i) => ({ date: `2026-08-${String(i + 1).padStart(2, '0')}`, price }))

  it('referencePrice bere medián od 7 dní, jinak včerejší cenu, jinak nic', () => {
    expect(referencePrice(days([1000, 1100, 1200, 1300, 1400, 1500, 9000]), 500)).toBe(1300)
    expect(referencePrice(days([1000, 1100]), 1250)).toBe(1250)
    expect(referencePrice([], null)).toBeNull()
    expect(referencePrice([], 0)).toBeNull()
  })

  it('isSuspiciousPrice chytí trojnásobek, běžné kolísání pustí', () => {
    expect(isSuspiciousPrice(3046, 1042)).toBe(true)
    expect(isSuspiciousPrice(1354, 1042)).toBe(false)
    expect(isSuspiciousPrice(1667, 1042)).toBe(false) // přesně 1,6× ještě ne
    expect(isSuspiciousPrice(3046, null)).toBe(false)
  })
})
