import type Fuse from 'fuse.js'
import type { SearchItem } from '@/types/search'
import { isProduction } from './utils'

/**
 * Paměťová cache vyhledávacího indexu.
 *
 * Proč ne `unstable_cache` / `cached()`: Next.js položky nad 2 MB do datové cache
 * NEULOŽÍ — v produkci jen zapíše varování „items over 2MB can not be cached"
 * a jede dál bez cache. Index hledání má ~3 MB (≈3000 stránek × text), takže
 * každé napsané písmeno četlo celý web z databáze a stavělo index znovu
 * (1,1–1,8 s na dotaz; nález 5. 9. 2026). Zmenšení dat pod 2 MB by nepomohlo
 * trvale: s 1000 znaky textu vyjde ~1,5–2 MB, tj. těsně pod limitem, a web roste.
 *
 * Web běží v jednom procesu (jeden kontejner), hooky z adminu běží ve stejném
 * procesu a index označí jako starý přímo (`invalidateSearchIndex`). Stav je na
 * `globalThis` jako u `getDb` (sdílený singleton napříč moduly bundlu).
 *
 * V dev se index staví při každém dotazu — žádná cache CMS dat (AGENTS.md).
 *
 * Tento modul importuje jen typy a `utils` (bez Payloadu): sdílí ho
 * `lib/search.ts` i `hooks/revalidation.ts`, který se načítá z Payload configu —
 * import `lib/search.ts` z hooků by uzavřel cyklus
 * payload.config → hooky → search → db → payload.config.
 */

type Index = Fuse<SearchItem>
type Build = () => Promise<Index>

type Entry = {
  /** Aktuálně servírovaný index (po první stavbě už nikdy neodmítnutý). */
  promise: Promise<Index>
  /** Čas poslední (spuštěné) stavby; 0 = označeno jako staré. */
  createdAt: number
  /** Právě běžící stavba — nikdy neběží víc než jedna. */
  inFlight?: Promise<void>
}

const store = globalThis as unknown as {
  __araSearchIndex?: Entry
  __araSearchStaleTimer?: NodeJS.Timeout
}

/**
 * Pojistka: stejný interval jako `cached()` v lib/payload.ts. Hooky index označí
 * hned, ale nedosáhnou na zápisy z jiného procesu (skripty přes Local API,
 * ruční SQL, obnova dumpu) ani na změny médií — ty se projeví nejpozději za
 * tuto dobu. Obnova běží na pozadí, návštěvník na ni nečeká.
 */
const MAX_AGE_MS = 5 * 60 * 1000

/**
 * Payload spouští afterChange/afterDelete hooky PŘED potvrzením transakce
 * (i afterOperation). Kdyby se index stavěl přesně v té chvíli, načetl by ještě
 * stará data. Proto se po uložení označí jako starý dvakrát: hned a znovu po
 * této prodlevě, kdy je transakce dávno potvrzená (i kaskáda plugin-nested-docs
 * přes stovky podstránek trvá sekundy, ne desítky).
 */
const POST_COMMIT_GRACE_MS = 5000

function startRefresh(entry: Entry, build: Build): void {
  // createdAt = teď dedupuje souběžné obnovy a při selhání dává přirozený
  // odstup MAX_AGE_MS — žádná bouře opakovaných načítání celého webu.
  entry.createdAt = Date.now()
  entry.inFlight = build()
    .then(
      (index) => {
        entry.promise = Promise.resolve(index)
      },
      (err: unknown) => {
        // Starý index zůstává v provozu; další pokus nejdřív po MAX_AGE_MS.
        console.error('Obnova indexu vyhledávání selhala, zůstává předchozí:', err)
      },
    )
    .finally(() => {
      entry.inFlight = undefined
      // Během stavby přišlo uložení z adminu → ještě jedna stavba, už s novými daty.
      if (entry.createdAt === 0 && store.__araSearchIndex === entry) startRefresh(entry, build)
    })
}

/**
 * Vrátí index z paměti; když chybí, postaví ho (souběžné dotazy čekají na jednu
 * stavbu). Starý index se servíruje dál a nový se staví na pozadí
 * (stale-while-revalidate). Selhání první stavby propadá volajícímu a nedrží se.
 */
export function getCachedSearchIndex(build: Build): Promise<Index> {
  if (!isProduction()) return build()

  const entry = store.__araSearchIndex
  if (!entry) {
    const first = build()
    const fresh: Entry = {
      createdAt: Date.now(),
      promise: first.catch((err: unknown) => {
        if (store.__araSearchIndex === fresh) delete store.__araSearchIndex
        throw err
      }),
    }
    fresh.inFlight = first.then(
      () => {
        fresh.inFlight = undefined
        if (fresh.createdAt === 0 && store.__araSearchIndex === fresh) startRefresh(fresh, build)
      },
      () => {
        fresh.inFlight = undefined
      },
    )
    store.__araSearchIndex = fresh
    return fresh.promise
  }

  if (Date.now() - entry.createdAt > MAX_AGE_MS && !entry.inFlight) startRefresh(entry, build)
  return entry.promise
}

function markStale(): void {
  const entry = store.__araSearchIndex
  if (entry) entry.createdAt = 0
}

/**
 * Označí index jako starý — volá `safeRevalidate` při každé invalidaci štítku
 * `pages` (hooky stránek i endpointy, které zapisují mimo hooky). Index se
 * neodhazuje: další dotaz dostane dosavadní výsledky hned a obnova běží na pozadí.
 */
export function invalidateSearchIndex(): void {
  markStale()
  // Druhé označení až po potvrzení transakce (viz POST_COMMIT_GRACE_MS); kaskáda
  // uložení sdílí jeden časovač. `unref`, aby časovač nedržel naživu CLI skripty.
  if (!store.__araSearchStaleTimer) {
    store.__araSearchStaleTimer = setTimeout(() => {
      store.__araSearchStaleTimer = undefined
      markStale()
    }, POST_COMMIT_GRACE_MS)
    store.__araSearchStaleTimer.unref?.()
  }
}
