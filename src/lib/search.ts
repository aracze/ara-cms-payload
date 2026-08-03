import Fuse, { type FuseResult, type IFuseOptions } from 'fuse.js'
import { unstable_cache } from 'next/cache'
import { getDb } from './db'
import { isProduction, richTextToPlainText, stripLeadingContinent } from './utils'
import type { SearchItem } from '@/types/search'

/**
 * Vyhledávací index se staví ZA BĚHU z Local API (dřív se generoval při buildu
 * ze souborů, což vyžadovalo běžící CMS při buildu a index zastarával).
 * Data se cachují s tagy — publikace stránky index okamžitě obnoví
 * (revalidateTag v hoocích). Fuse index nad ~200 položkami se staví za ~ms.
 *
 * Payload instance se sdílí přes stejný singleton (getDb) jako datová vrstva —
 * /api/search se volá při psaní často, vlastní init by byl zbytečná režie.
 */
// Selhání DB NESMÍ vracet prázdno uvnitř cache (uložilo by se) — chyba propadá
// ven z unstable_cache a fallback řeší až getFuse.
async function loadSearchDataUncached(): Promise<SearchItem[]> {
  const payload = await getDb()
  const items: SearchItem[] = []
  // Fotky se dotahují hromadně až nakonec (jeden dotaz na media pro všechny
  // stránky) — populace přes depth by znamenala dotaz za KAŽDou stránku.
  const imageIdByItemIndex = new Map<number, number | string>()
  // Stránkujeme přes CELOU kolekci — s pevným limitem 200 by se do indexu
  // dostalo jen prvních 200 stránek a zbytek by nešel vyhledat.
  let page = 1
  for (;;) {
    const res = await payload.find({
      overrideAccess: false,
      collection: 'pages',
      limit: 200,
      page,
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
        text: richTextToPlainText(doc.text).slice(0, 2000),
        slug: doc.slug ?? '',
        fullSlug: doc.fullSlug ?? '',
        path: path || undefined,
        category: doc.category || undefined,
      } satisfies SearchItem)
    }
    if (!res.hasNextPage) break
    page++
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

const loadSearchData = isProduction()
  ? unstable_cache(loadSearchDataUncached, ['search-data'], {
      tags: ['pages', 'search-index'],
      revalidate: 3600,
    })
  : loadSearchDataUncached

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

async function getFuse(): Promise<Fuse<SearchItem>> {
  let data: SearchItem[] = []
  try {
    data = await loadSearchData()
  } catch {
    // DB nedostupná — prázdné vyhledávání, nic se necachuje
  }
  return new Fuse<SearchItem>(data, FUSE_OPTIONS)
}

// Jediný vstup vyhledávání. UI zobrazuje max 10 položek, víc nemá smysl
// posílat — dřív šly klientovi VŠECHNY shody vč. textů (u krátkých dotazů
// i megabajty na každé napsané písmeno).
export async function searchPages(query: string, limit = 10): Promise<FuseResult<SearchItem>[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  const fuse = await getFuse()
  return fuse.search(removeDiacritics(trimmed), { limit })
}
