/**
 * Paměťová cache vyhledávacího indexu (používá se JEN v produkci — v dev se index
 * staví při každém dotazu, viz pravidla cache v AGENTS.md).
 *
 * Proč ne `unstable_cache`: Next.js položky nad 2 MB do datové cache NEULOŽÍ —
 * v produkci jen zapíše varování „items over 2MB can not be cached" a jede dál
 * bez cache. Index hledání má ~3 MB (≈3000 stránek), takže každé napsané písmeno
 * četlo celý web z databáze a stavělo index znovu (1,1–1,8 s na dotaz; nález
 * 5. 9. 2026). Web běží v jednom procesu (jeden kontejner) a hooky z adminu běží
 * ve stejném procesu, takže index můžou zahodit přímo — bez tagů a bez disku.
 *
 * Modul schválně NIC neimportuje: sdílí ho `lib/search.ts` i `hooks/revalidation.ts`
 * (ten se načítá z Payload configu) a import `lib/search.ts` z hooků by uzavřel
 * cyklus payload.config → hooky → search → db → payload.config.
 *
 * Stav drží `globalThis` stejně jako `getDb` — v dev s Turbopackem se moduly
 * izolují a modulová proměnná by se resetovala s každým požadavkem.
 */

type Entry = {
  promise: Promise<unknown>
  createdAt: number
  /** Běžící obnova po vypršení — aby ji nespustil každý souběžný dotaz znovu. */
  refreshing?: Promise<unknown>
}

const store = globalThis as unknown as { __araSearchIndex?: Entry }

/**
 * Vrátí index z paměti, nebo ho postaví (souběžné dotazy čekají na jeden build).
 * Po vypršení `maxAgeMs` dál vrací starý index a nový staví na pozadí
 * (stale-while-revalidate) — návštěvník nikdy nečeká na obnovu.
 * Neúspěšný build se nedrží: příští dotaz to zkusí znovu.
 */
export function getCachedSearchIndex<T>(build: () => Promise<T>, maxAgeMs: number): Promise<T> {
  const entry = store.__araSearchIndex
  if (!entry) {
    const promise = build().catch((err: unknown) => {
      if (store.__araSearchIndex?.promise === promise) delete store.__araSearchIndex
      throw err
    })
    store.__araSearchIndex = { promise, createdAt: Date.now() }
    return promise
  }
  if (Date.now() - entry.createdAt > maxAgeMs && !entry.refreshing) {
    entry.refreshing = build()
      .then((index) => {
        // Mezitím mohl index zahodit hook z adminu — jeho novější stav nepřepisujeme.
        if (store.__araSearchIndex === entry) {
          store.__araSearchIndex = { promise: Promise.resolve(index), createdAt: Date.now() }
        }
      })
      .catch(() => {
        // Starý index zůstává; další pokus až s dalším dotazem po vypršení.
        entry.refreshing = undefined
      })
  }
  return entry.promise as Promise<T>
}

/** Zahodí index — volají hooky po uložení/smazání stránky v adminu. */
export function invalidateSearchIndex(): void {
  delete store.__araSearchIndex
}
