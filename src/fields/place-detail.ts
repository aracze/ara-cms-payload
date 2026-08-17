import type { TextField } from 'payload'

/**
 * Políčka „Kód měny" a „Název čas. pásma" ze skupiny Detail.
 *
 * Obě se DĚDÍ od nejbližšího nadřazeného místa, které je má vyplněné (viz
 * `fetchInheritedPlaceDetail`), takže u potomků mají zůstat prázdná a hodnota
 * patří jen na zemi a na skutečné výjimky. Prázdná políčka jsou tím ale
 * NORMÁLNÍ stav a jediná ochrana obsahu je validace při ukládání: překlep na
 * stránce země se propíše do všech jejích potomků, kde ho nic nenahlásí —
 * `LocalTime` špatné pásmo spolkne a vykreslí prázdné místo pod nadpisem, který
 * dál slibuje „Aktuální čas". Do zavedení dědění stál takový překlep jednu
 * stránku, dnes celou zemi.
 */

/** Prázdná hodnota = „zděď od předka", to je v pořádku vždy. */
const isEmpty = (value: unknown): boolean =>
  value === null || value === undefined || String(value).trim() === ''

/**
 * Kontinenty a rubriky (stránky bez rodiče) musí zůstat prázdné — hodnota by se
 * propsala do VŠECH zemí pod nimi (Česko by třeba začalo hlásit euro).
 * U nové stránky se ještě rodič vybírat nemusel, proto se hlídají jen uložené.
 */
const rootPageMustStayEmpty = (data: { id?: unknown; parent?: unknown } | undefined): boolean =>
  Boolean(data?.id) && !data?.parent

/**
 * Platné IANA jméno pásma. Záměrně přes `Intl` a ne přes
 * `Intl.supportedValuesOf('timeZone')`: ten nevrací zastaralé aliasy, které
 * v datech legitimně jsou (`US/Alaska`), takže by uložení existující stránky
 * začalo padat.
 */
function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('cs-CZ', { timeZone: value })
    return true
  } catch {
    return false
  }
}

export const timezoneField: TextField = {
  name: 'timezone',
  label: 'Název čas. pásma (např. Europe/London)',
  type: 'text',
  admin: {
    width: '50%',
    description:
      'Prázdné = zdědí se od nadřazeného místa. Vyplňuj u země — a u regionu/místa, kde je pásmo jiné.',
  },
  hooks: {
    // Kopie stránky (akce Duplicate v adminu) by jinak vzala hodnotu s sebou
    // a vyrobila přesně tu nadbytečnou kopii, kterou dědění ruší. Prázdné
    // políčko si správnou hodnotu zdědí samo; skutečnou výjimku dopíše editor.
    beforeDuplicate: [() => null],
  },
  validate: (value: string | null | undefined, { data }: { data?: Record<string, unknown> }) => {
    if (isEmpty(value)) return true
    if (rootPageMustStayEmpty(data))
      return 'Kontinenty a rubriky nechávej prázdné — pásmo by zdědily všechny země pod nimi.'
    const trimmed = String(value).trim()
    if (!isValidTimezone(trimmed))
      return `„${trimmed}" není platné časové pásmo. Použij jméno z databáze IANA, např. Europe/London nebo America/Phoenix.`
    return true
  },
}

export const currencyCodeField: TextField = {
  name: 'currencyCode',
  label: 'Kód měny (např. GBP)',
  type: 'text',
  admin: {
    width: '50%',
    description:
      'Prázdné = zdědí se od nadřazeného místa. Vyplňuj u země — a u regionu s jinou měnou. U kontinentů nechávej prázdné.',
  },
  hooks: {
    // Velká písmena jsou povinná pro kurzové API i pro srovnávání s předkem;
    // překlepnuté „eur" by jinak prošlo a chovalo se jako jiná měna.
    beforeChange: [({ value }) => (isEmpty(value) ? null : String(value).trim().toUpperCase())],
    beforeDuplicate: [() => null],
  },
  validate: (value: string | null | undefined, { data }: { data?: Record<string, unknown> }) => {
    if (isEmpty(value)) return true
    if (rootPageMustStayEmpty(data))
      return 'Kontinenty a rubriky nechávej prázdné — měnu by zdědily všechny země pod nimi.'
    const trimmed = String(value).trim()
    if (!/^[A-Za-z]{3}$/.test(trimmed))
      return `„${trimmed}" není kód měny. Čekají se tři písmena podle ISO 4217, např. EUR, GBP nebo NOK.`
    return true
  },
}
