import { describe, it, expect } from 'vitest'
import { currencyCodeField, timezoneField } from '@/fields/place-detail'

// Měna a pásmo se dědí od nejbližšího předka, takže hodnota na stránce ZEMĚ
// platí pro všechny její potomky. Překlep proto nestojí jednu stránku, ale celou
// zemi — a na webu se neprojeví chybou, jen prázdným místem pod nadpisem, který
// dál slibuje „Aktuální čas". Validace je jediné místo, kde se to dá zachytit.

type Validator = (
  value: unknown,
  args: { data?: Record<string, unknown> },
) => true | string | Promise<true | string>
type Normalizer = (args: { value: unknown }) => unknown

const validateTimezone = (timezoneField as { validate?: Validator }).validate!
const validateCurrency = (currencyCodeField as { validate?: Validator }).validate!
const normalizeCurrency = (currencyCodeField.hooks?.beforeChange as unknown as Normalizer[])[0]
const duplicateTimezone = (timezoneField.hooks?.beforeDuplicate as unknown as Normalizer[])[0]
const duplicateCurrency = (currencyCodeField.hooks?.beforeDuplicate as unknown as Normalizer[])[0]

// Uložená podstránka města: má rodiče, takže vyplněná hodnota je legitimní výjimka.
const mistoPodZemi = { id: 42, parent: 7 }
// Uložený kontinent nebo rubrika: bez rodiče, hodnota by se propsala do všech zemí.
const kontinent = { id: 7 }

describe('detail.timezone: validace pásma', () => {
  it('prázdná hodnota je v pořádku — znamená „zděď od předka"', async () => {
    expect(await validateTimezone('', { data: mistoPodZemi })).toBe(true)
    expect(await validateTimezone(null, { data: mistoPodZemi })).toBe(true)
    expect(await validateTimezone(undefined, { data: mistoPodZemi })).toBe(true)
  })

  it('platné pásmo projde, včetně zastaralých aliasů v datech', async () => {
    expect(await validateTimezone('Europe/London', { data: mistoPodZemi })).toBe(true)
    expect(await validateTimezone('America/Phoenix', { data: mistoPodZemi })).toBe(true)
    expect(await validateTimezone('US/Alaska', { data: mistoPodZemi })).toBe(true)
  })

  it('překlep neprojde', async () => {
    expect(await validateTimezone('Europe/Praha', { data: mistoPodZemi })).toContain(
      'není platné časové pásmo',
    )
    expect(await validateTimezone('Europe/Istanbull', { data: mistoPodZemi })).toContain(
      'není platné časové pásmo',
    )
  })

  it('kontinent musí zůstat prázdný', async () => {
    expect(await validateTimezone('Europe/London', { data: kontinent })).toContain(
      'Kontinenty a rubriky nechávej prázdné',
    )
  })

  it('podstránka pod místem projde i před prvním uložením', async () => {
    expect(await validateTimezone('Europe/London', { data: { parent: 7 } })).toBe(true)
  })

  it('hlídá i zakládanou stránku bez rodiče — tudy dřív nový kontinent prošel', async () => {
    expect(await validateTimezone('Europe/London', { data: {} })).toContain('nadřazeným místem')
  })
})

describe('detail.currencyCode: validace a normalizace měny', () => {
  it('prázdná hodnota je v pořádku', async () => {
    expect(await validateCurrency('', { data: mistoPodZemi })).toBe(true)
  })

  it('tři písmena projdou, cokoli jiného ne', async () => {
    expect(await validateCurrency('EUR', { data: mistoPodZemi })).toBe(true)
    expect(await validateCurrency('12', { data: mistoPodZemi })).toContain('není kód měny')
    expect(await validateCurrency('EURO', { data: mistoPodZemi })).toContain('není kód měny')
  })

  it('kontinent musí zůstat prázdný', async () => {
    expect(await validateCurrency('EUR', { data: kontinent })).toContain(
      'Kontinenty a rubriky nechávej prázdné',
    )
  })

  it('neexistující kód neprojde, i když má tři písmena', async () => {
    expect(await validateCurrency('ZZZ', { data: mistoPodZemi })).toContain('neexistuje')
    expect(await validateCurrency('XYZ', { data: mistoPodZemi })).toContain('neexistuje')
  })

  it('zrušená HRK projde — v datech historicky je a ICU ji zná', async () => {
    expect(await validateCurrency('HRK', { data: mistoPodZemi })).toBe(true)
  })

  it('malá písmena projdou, ukládají se velkými', async () => {
    expect(await validateCurrency('eur', { data: mistoPodZemi })).toBe(true)
  })

  it('kód se ukládá velkými písmeny a bez mezer', () => {
    expect(normalizeCurrency({ value: ' eur ' })).toBe('EUR')
    expect(normalizeCurrency({ value: 'gbp' })).toBe('GBP')
    expect(normalizeCurrency({ value: '   ' })).toBeNull()
  })
})

describe('kopie stránky nedědí vlastní hodnoty', () => {
  it('duplikát začíná s prázdnými políčky, ať si hodnotu zdědí', () => {
    expect(duplicateTimezone({ value: 'Europe/London' })).toBeNull()
    expect(duplicateCurrency({ value: 'GBP' })).toBeNull()
  })
})
