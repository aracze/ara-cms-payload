import Fuse, { type FuseResult, type IFuseOptions } from 'fuse.js'
import { getDb } from './db'
import { getCachedSearchIndex } from './search-cache'
import { richTextToPlainText, stripLeadingContinent } from './utils'
import type { SearchItem } from '@/types/search'

/**
 * Vyhledávací index se staví ZA BĚHU z Local API (dřív se generoval při buildu
 * ze souborů, což vyžadovalo běžící CMS při buildu a index zastarával).
 * V produkci se hotový Fuse index drží v paměti procesu — proč ne v Next cache
 * a jak se obnovuje, viz lib/search-cache.ts.
 *
 * Payload instance se sdílí přes stejný singleton (getDb) jako datová vrstva —
 * /api/search se volá při psaní často, vlastní init by byl zbytečná režie.
 */
// Do indexu jde začátek textu stránky. Zkrácení na 1000 znaků bylo změřeno
// (5. 9. 2026) a rychlosti dotazu nepomohlo (79 vs. 82 ms — čas Fuse jde za
// počtem stránek, ne délkou textu); velikost dat by kleslo jen k ~1,5–2 MB, tedy
// těsně k limitu Next cache (viz search-cache.ts). Zůstává 2000, aby se
// neztrácely shody hlouběji v textu.
const SEARCH_TEXT_MAX = 2000

// Dávky po ID místo offsetového stránkování: `page`/`limit` s pagination dělá
// za KAŽDOU dávku COUNT DISTINCT přes celou tabulku a OFFSET, který Postgres
// přečte a zahodí — u ~3000 stránek zbytečných 16 COUNTů a ~24k řádků navíc.
const LOAD_BATCH = 200

async function loadSearchData(): Promise<SearchItem[]> {
  const payload = await getDb()
  const items: SearchItem[] = []
  // Fotky se dotahují hromadně až nakonec (jeden dotaz na media pro všechny
  // stránky) — populace přes depth by znamenala dotaz za KAŽDou stránku.
  const imageIdByItemIndex = new Map<number, number | string>()
  // Procházíme CELOU kolekci — s pevným limitem by se do indexu dostala jen
  // část stránek a zbytek by nešel vyhledat.
  let lastId: number | string | undefined
  for (;;) {
    const res = await payload.find({
      overrideAccess: false,
      collection: 'pages',
      pagination: false,
      limit: LOAD_BATCH,
      sort: 'id',
      where: lastId === undefined ? undefined : { id: { greater_than: lastId } },
      depth: 0,
      select: {
        title: true,
        text: true,
        slug: true,
        fullSlug: true,
        category: true,
        breadcrumbs: true,
        featuredImage: true,
      },
      // Bez joinů — jejich vyhodnocení stojí stovky ms za KAŽDÝ dokument
      // (viz komentář u MENU_SELECT v lib/payload.ts).
      joins: false,
    })
    for (const p of res.docs || []) {
      const doc = p as unknown as {
        id: number | string
        title?: string
        text?: unknown
        slug?: string
        fullSlug?: string
        category?: string
        breadcrumbs?: { label?: string | null }[] | null
        featuredImage?: { image?: number | string | null } | null
      }
      // Drobečky obsahují i stránku samotnou — pro cestu bereme jen předky.
      // Kontinent se vynechává (informaci nese země, viz stripLeadingContinent).
      const path = stripLeadingContinent(
        (doc.breadcrumbs ?? [])
          .slice(0, -1)
          .map((b) => b?.label)
          .filter((l): l is string => typeof l === 'string' && l.length > 0),
      ).join(' › ')
      const imageId = doc.featuredImage?.image
      if (typeof imageId === 'number' || typeof imageId === 'string') {
        imageIdByItemIndex.set(items.length, imageId)
      }
      items.push({
        // Stabilní klíč pro React ve výpisu (jinak by se padalo na index).
        documentId: String(doc.id),
        title: doc.title ?? '',
        text: richTextToPlainText(doc.text).slice(0, SEARCH_TEXT_MAX),
        slug: doc.slug ?? '',
        fullSlug: doc.fullSlug ?? '',
        path: path || undefined,
        category: doc.category || undefined,
      } satisfies SearchItem)
    }
    const docs = res.docs || []
    if (docs.length < LOAD_BATCH) break
    lastId = docs[docs.length - 1].id
  }

  if (imageIdByItemIndex.size > 0) {
    const ids = [...new Set(imageIdByItemIndex.values())]
    const media = await payload.find({
      overrideAccess: false,
      collection: 'media',
      where: { id: { in: ids } },
      // `url` je dopočítávané pole — bez zdrojových cloudinary* polí a filename
      // by vyšlo null (ověřeno), proto se vybírají taky.
      select: {
        url: true,
        cloudinaryUrl: true,
        cloudinaryPublicId: true,
        cloudinaryVersion: true,
        cloudinaryFormat: true,
        cloudinaryResourceType: true,
        filename: true,
      },
      depth: 0,
      pagination: false,
      limit: 0,
    })
    // Klíče přes String() — ID může přijít jako číslo (Postgres) i řetězec.
    const urlById = new Map(
      (media.docs || []).map((m) => {
        const doc = m as { url?: string | null; cloudinaryUrl?: string | null }
        return [String(m.id), doc.url || doc.cloudinaryUrl]
      }),
    )
    for (const [itemIndex, imageId] of imageIdByItemIndex) {
      const url = urlById.get(String(imageId))
      if (url) items[itemIndex].image = url
    }
  }

  return items
}

// Čeští návštěvníci běžně píší bez diakritiky — porovnáváme index i dotaz
// bez háčků a čárek, aby „rim" našlo „Řím" (a „řím" i „Rim Trail").
function removeDiacritics(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

const FUSE_OPTIONS: IFuseOptions<SearchItem> = {
  // Shoda v názvu má vyšší váhu než shoda v textu — „Praha" musí být nad
  // stránkami, které Prahu jen zmiňují.
  keys: [
    { name: 'title', weight: 2 },
    { name: 'text', weight: 1 },
  ],
  // Výchozí threshold 0.6 pouští příliš volné shody („praha" → „Doprava").
  threshold: 0.4,
  // Shoda se hodnotí kdekoli v textu, ne jen poblíž začátku pole.
  ignoreLocation: true,
  getFn: (obj, path) => {
    const value = Fuse.config.getFn(obj, path)
    return Array.isArray(value)
      ? value.map(removeDiacritics)
      : removeDiacritics((value as string) ?? '')
  },
}

async function buildFuse(): Promise<Fuse<SearchItem>> {
  return new Fuse<SearchItem>(await loadSearchData(), FUSE_OPTIONS)
}

// Selhání DB propadá ven (route vrátí 500 a UI ukáže chybu místo „Žádné
// výsledky"); neúspěšná první stavba se nedrží v paměti — viz search-cache.
const getFuse = (): Promise<Fuse<SearchItem>> => getCachedSearchIndex(buildFuse)

// Jediný vstup vyhledávání. UI zobrazuje max 10 položek, víc nemá smysl
// posílat — dřív šly klientovi VŠECHNY shody vč. textů (u krátkých dotazů
// i megabajty na každé napsané písmeno).
export async function searchPages(query: string, limit = 10): Promise<FuseResult<SearchItem>[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  const fuse = await getFuse()
  return fuse.search(removeDiacritics(trimmed), { limit })
}
