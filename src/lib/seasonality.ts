import type { ClimateNormals } from '@/types/payload'
import { suitability } from '@/lib/climate'

/**
 * Sezónnost místa pro pruh v pravém panelu („Kdy jet do…").
 *
 * Zdroje jsou DVA a nejsou zaměnitelné — plyne to z rešerše referenčních webů
 * (Lonely Planet, Rough Guides, World Travel Guide, weather2travel):
 *
 *  · ZEMĚ → jedině ruční blok z adminu. Celozemní „kdy jet" je redaktorský
 *    úsudek, ne aritmetika: žádný z těch webů zemi neprůměruje, protože
 *    u protáhlých zemí se protichůdné sezóny vyruší (Vietnam: sever v létě
 *    vedro a vlhko, jih zrovna sucho). Automat by navíc počítal ze souřadnic
 *    země, a to je její geometrický střed — u Chorvatska vnitrozemí u Plitvic.
 *  · MĚSTO → klimatická data z Meteostatu. Střed města je opravdu to místo,
 *    kam se jede, takže výpočet dává smysl a je k dispozici všude po syncu.
 *
 * Když zdroj chybí, vrací se null a panel sezónu prostě vynechá — radši nic
 * než pruh, který ukazuje jiné místo, než o kterém stránka je.
 */

/** Tři stavy pruhu, shodné s `seasonalityBlock` v adminu. */
export type SeasonStatus = 'peak' | 'mid' | 'off'

export interface SeasonMonths {
  /** 12 stavů od ledna, vždy kompletní. */
  months: SeasonStatus[]
  /** Popisek pod pruhem („Květen – Září"), když ho zdroj nese. */
  idealText: string | null
}

function toStatus(value: unknown): SeasonStatus {
  return value === 'peak' || value === 'mid' ? value : 'off'
}

/**
 * Ruční blok sezónnosti z Lexical textu stránky. Blok leží na PODSTRÁNCE
 * počasí, ne na stránce místa — panel se přitom vykresluje na místě, takže
 * se text musí načíst odjinud (viz fetchPlaceSeason v payload.ts).
 */
export function extractSeasonalityBlock(text: unknown): SeasonMonths | null {
  let found: SeasonMonths | null = null

  const walk = (node: unknown): void => {
    if (found || !node || typeof node !== 'object') return
    const record = node as Record<string, unknown>

    if ('root' in record) {
      walk(record.root)
      return
    }

    const fields = record.fields as Record<string, unknown> | undefined
    if (record.type === 'block' && fields?.blockType === 'seasonalityBlock') {
      const raw = Array.isArray(fields.months) ? fields.months : []
      // Neúplný blok se zahodí celý — dokreslovat chybějící měsíce jako „mimo
      // sezónu" by tiše vyrobilo tvrzení, které redaktor nenapsal.
      if (raw.length !== 12) return
      const months = raw.map((m) => toStatus((m as Record<string, unknown>)?.status))
      const idealRaw = fields.idealMonthsText
      found = {
        months,
        idealText: typeof idealRaw === 'string' && idealRaw.trim() ? idealRaw.trim() : null,
      }
      return
    }

    const children = record.children
    if (Array.isArray(children)) for (const child of children) walk(child)
  }

  walk(text)
  return found
}

/**
 * Sezóna spočítaná z dlouhodobých průměrů — pro města. Používá tutéž funkci
 * `suitability()` jako velký graf na stránce počasí, takže pruh v panelu je
 * jeho věrná zmenšenina: první stupeň = špička, druhý = sezóna, zbytek mimo.
 */
export function seasonFromClimate(normals: ClimateNormals): SeasonMonths | null {
  const months = normals.months.map((m) => {
    const level = suitability(m)
    return level === 'ideal' ? 'peak' : level === 'good' ? 'mid' : 'off'
  }) as SeasonStatus[]
  if (months.length !== 12) return null
  // Samé „mimo sezónu" (třeba Reykjavík) není doporučení, ale prázdný pruh —
  // v panelu by jen zabíral místo a nic neřekl.
  if (!months.some((s) => s !== 'off')) return null
  return { months, idealText: idealRangeLabel(months) }
}

const MONTH_NAMES = [
  'Leden',
  'Únor',
  'Březen',
  'Duben',
  'Květen',
  'Červen',
  'Červenec',
  'Srpen',
  'Září',
  'Říjen',
  'Listopad',
  'Prosinec',
]

/**
 * Popisek „Květen – Září" z nejdelšího souvislého úseku sezóny. Úsek se hledá
 * i přes přelom roku (Bangkok má sezónu listopad–únor), proto se prochází
 * dvojnásobná řada měsíců.
 */
export function idealRangeLabel(months: SeasonStatus[]): string | null {
  const inSeason = months.map((s) => s !== 'off')
  if (inSeason.every(Boolean)) return 'Celý rok'
  if (!inSeason.some(Boolean)) return null

  let best = { start: -1, length: 0 }
  let start = -1
  for (let i = 0; i < 24; i++) {
    if (inSeason[i % 12]) {
      if (start === -1) start = i
      const length = i - start + 1
      // Delší než rok už jen dokola opakuje totéž.
      if (length <= 12 && length > best.length) best = { start, length }
    } else {
      start = -1
    }
  }
  if (best.length === 0) return null
  const from = MONTH_NAMES[best.start % 12]
  const to = MONTH_NAMES[(best.start + best.length - 1) % 12]
  return from === to ? from : `${from} – ${to}`
}
