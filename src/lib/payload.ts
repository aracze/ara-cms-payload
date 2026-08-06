import {
  Page,
  PageChild,
  PageCategory,
  PagesResponse,
  Article,
  GlobalHeader,
  Homepage,
  GlobalFooter,
  CommentPublic,
  CommentThread,
  ReviewPublic,
  UserProfileData,
  ProfileArticleItem,
  ProfilePlaceItem,
  ProfileReviewItem,
  ProfileCommentItem,
  ProfileMapPin,
  ActivityItem,
  HomepageInspiration,
  HomepageHeroPlace,
  InspirationLink,
  PracticalInfoSection,
  TeamSectionData,
  TeamMemberPublic,
  ContributorFace,
} from '@/types/payload'
import { CONTRIBUTOR_FACES_LIMIT, NON_PERSON_USERNAMES, TEAM_USERNAMES } from './team'
import { practicalInfoSectionCategories } from './practical-info'
import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import type { Payload } from 'payload'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { and, asc, count, eq, inArray, isNotNull } from '@payloadcms/db-postgres/drizzle'
import { getDb } from './db'
import {
  getArticleImageUrl,
  isProduction,
  richTextToPlainText,
  stripLeadingContinent,
} from './utils'

/**
 * Datová vrstva webu nad Payload LOCAL API.
 *
 * Dřív si web tahal data z CMS přes HTTP REST (~0,3–0,4 s režie na dotaz na
 * slabém CPU). Po sloučení frontendu do Payload aplikace voláme databázi přímo
 * v procesu — bez HTTP, bez serializace přes síť.
 *
 * Cache: Local API neprochází fetch-cache Nextu, proto těžší čtení balíme do
 * `unstable_cache` se STEJNÝMI tagy jako dřív. Publikace v adminu je
 * invaliduje okamžitě přes revalidateTag v afterChange hoocích (viz
 * src/hooks/revalidation.ts). Ve vývoji se cache obchází (čerstvá data).
 *
 * Payload instance se sdílí přes singleton getDb (viz src/lib/db.ts).
 *
 * Pozn.: media dokumenty se NIKDY neořezávají přes select/populate — cloudinary
 * plugin počítá `url` v afterRead hooku z ostatních polí; s ořezanými poli by
 * vracel url: null a obrázky by zmizely (ověřeno dřív na REST).
 */

/** Obal: v produkci cache s tagy (revalidace hooky), ve vývoji přímé volání. */
function cached<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  keyPrefix: string,
  tags: (args: A) => string[],
): (...args: A) => Promise<R> {
  if (!isProduction()) return fn
  return (...args: A) =>
    unstable_cache(fn, [keyPrefix], {
      tags: tags(args),
      revalidate: 300, // pojistka; primárně invalidují hooky
    })(...args)
}

const DEFAULT_LIMIT = 200

// Pole potřebná pro hlavní menu (header): jen názvy/odkazy stránek a jejich
// dětí — bez selectu by se tahaly i texty, články a média (~3 MB místo ~8 KB).
// DŮLEŽITÉ: web NIKDY nečte JOIN pole (subPages, primaryArticles, comments…)
// přes joiny — Payload je vyhodnocuje za KAŽDÝ vrácený dokument i když nejsou
// v selectu, což stojí stovky ms za dokument (v dev režimu ještě řádově víc).
// Všechny webové dotazy proto mají `joins: false` a děti/články tahají
// samostatné přímé dotazy přes `parent`/`mainPage`. Joiny zůstávají jen
// pro admin rozhraní.
const MENU_SELECT = {
  title: true,
  slug: true,
  fullSlug: true,
  category: true,
} as const

// Děti pro menu — hromadný dotaz přes `parent`; parent v selectu kvůli
// seskupení dětí ke správnému rodiči.
const MENU_CHILD_SELECT = {
  ...MENU_SELECT,
  parent: true,
} as const

// Drobečková navigace — uložený řetězec předků z pluginu nested-docs. Bereme
// jen `label` + `url`; `doc` ZÁMĚRNĚ ne, protože při depth > 0 by ho Payload
// populoval celým dokumentem předka (jedno čtení stránky by tahalo celý řetězec
// stránek navíc). Vnořený select to spolehlivě vypne.
const BREADCRUMBS_SELECT = {
  label: true,
  url: true,
} as const

// Pro předky (menu kontext, kořen): navíc detail + featuredImage — podstránky
// z kořene berou hero obrázek a fallback měny/časové zóny. Drobečky navíc čte
// z `breadcrumbs` stránka článku (kontextové místo).
const ANCESTOR_SELECT = {
  ...MENU_SELECT,
  detail: true,
  featuredImage: true,
  breadcrumbs: BREADCRUMBS_SELECT,
} as const

// Detail stránky = 3 paralelní dotazy (stránka ∥ děti ∥ články), každý jen
// s poli, která web kreslí (bez SEO meta a profilů uživatelů). `breadcrumbs`
// tu být MUSÍ — drobečky se počítají z hierarchie v CMS, ne z URL.
const PAGE_SCALAR_SELECT = {
  title: true,
  slug: true,
  fullSlug: true,
  category: true,
  text: true,
  detail: true,
  featuredImage: true,
  breadcrumbs: BREADCRUMBS_SELECT,
  createdBy: true,
  // Bezpečný veřejný autor přes VIRTUÁLNÍ pole (afterRead hook čte uživatele s
  // overrideAccess: true). Stejný vzor jako u článků. Ruční dohled přes
  // findByID by tu selhal — web čte anonymně a Users.read = isAdminOrSelf.
  createdByPublic: true,
  // Bez rodiče = kontinent (root „Místo k navštívení") → resolvePlacesToVisit
  // pro něj ukáže jen přímé děti, nesestupuje do hloubky (viz níže).
  parent: true,
} as const

const PAGE_CHILDREN_SELECT = {
  title: true,
  slug: true,
  fullSlug: true,
  category: true,
  text: true,
  detail: true,
  featuredImage: true,
  // Autor cíle pro výpis „Co vidět…" (avatar + jméno u rozbaleného textu).
  // Virtuální createdByPublic potřebuje createdBy v datech, jinak vrací null.
  createdBy: true,
  createdByPublic: true,
  // Ostrov apod. — nerozbalovat vlastní podřazená místa u rodiče (resolvePlacesToVisit).
  stopChildPlacesHere: true,
  // Řazení v sekci „Co vidět" (resolvePlacesToVisit) — sync z GA4, viz endpoints/syncAnalytics.ts.
  analyticsPageViews: true,
  // Potřeba jen v resolvePlacesToVisit (dávkové BFS) pro seskupení dětí podle rodiče.
  parent: true,
} as const

const PAGE_ARTICLES_SELECT = {
  title: true,
  slug: true,
  documentId: true,
  text: true,
  featuredImage: true,
  mainPage: true,
} as const

type PayloadDocsResponse<T> = {
  docs: T[]
  totalDocs?: number
}

type RawPayloadPage = Omit<Page, 'children' | 'articles'> & {
  children?: {
    docs: PageChild[]
  }
  subPages?: {
    docs: PageChild[]
  }
  articles?: Article[]
  primaryArticles?: {
    docs: Article[]
  }
  secondaryArticles?: {
    docs: Article[]
  }
}

function normalizePage(page: RawPayloadPage): Page {
  const normalizedChildren = page.children?.docs ?? page.subPages?.docs ?? []

  const primary = page.articles ?? page.primaryArticles?.docs ?? []
  const secondary = page.secondaryArticles?.docs ?? []
  // Merge primary + secondary, deduplicate by documentId/slug
  const seen = new Set<string>()
  const normalizedArticles: Article[] = []
  for (const a of [...primary, ...secondary]) {
    const key = a.documentId || a.slug
    if (!seen.has(key)) {
      seen.add(key)
      normalizedArticles.push(a)
    }
  }

  return {
    ...page,
    children: {
      docs: normalizedChildren,
    },
    articles: normalizedArticles,
  }
}

function normalizePages(pages: RawPayloadPage[]): Page[] {
  return pages.map(normalizePage)
}

// DŮLEŽITÉ: uvnitř cached() funkcí se selhání DB NESMÍ polykat — unstable_cache
// by prázdný výsledek uložil (při buildu bez DB by se zapekl přímo do buildu
// a runtime by ho pak servíroval). Chyba musí propadnout VEN z cache (neuloží
// se nic) a fallback řeší až exportovaná obálka.
async function fetchRootPagesUncached(): Promise<PagesResponse> {
  const payload = await getDb()

  const [rootRes, headerRes, homepageRes] = await Promise.all([
    payload
      .find({
        overrideAccess: false,
        collection: 'pages',
        where: { parent: { exists: false } },
        limit: DEFAULT_LIMIT,
        depth: 0,
        select: MENU_SELECT,
        joins: false,
      })
      .then((r) => r.docs as unknown as RawPayloadPage[]),
    // Bez .catch — případná chyba DB musí propadnout ven z cache (viz komentář
    // výše), jinak by se do cache zapekl null header/homepage.
    payload.findGlobal({ slug: 'header', overrideAccess: false }),
    payload.findGlobal({ slug: 'homepage', overrideAccess: false }),
  ])

  // Děti kořenových stránek (rozbalovací menu) jedním hromadným dotazem —
  // dřív je nosil subPages join, který stál sekundy za každý kořen.
  const childrenByParent = new Map<number | string, PageChild[]>()
  const rootIds = rootRes.map((p) => p.id).filter((id) => id != null)
  if (rootIds.length > 0) {
    const kids = await payload.find({
      overrideAccess: false,
      collection: 'pages',
      where: { parent: { in: rootIds } },
      limit: 0,
      pagination: false,
      depth: 0,
      select: MENU_CHILD_SELECT,
      joins: false,
    })
    for (const doc of kids.docs as unknown as Array<PageChild & { parent?: unknown }>) {
      const pid = relationId(doc.parent)
      if (pid == null) continue
      const list = childrenByParent.get(pid) ?? []
      list.push(doc)
      childrenByParent.set(pid, list)
    }
  }

  const rootsWithChildren = rootRes.map((p) => ({
    ...p,
    subPages: { docs: childrenByParent.get(p.id) ?? [] },
  }))

  const header = headerRes as unknown as Record<string, unknown> | null
  const homepage = homepageRes as unknown as Record<string, unknown> | null

  return {
    data: {
      pages: normalizePages(rootsWithChildren),
      global: header
        ? {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            header: ((header as any).header || header) as GlobalHeader,
          }
        : null,
      homepage: homepage
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (((homepage as any).homepage || homepage) as Homepage)
        : null,
    },
  }
}

const fetchRootPagesCached = cached(fetchRootPagesUncached, 'root-pages', () => [
  'root_pages',
  'pages',
])

export const fetchRootPages = cache(async (): Promise<PagesResponse> => {
  try {
    return await fetchRootPagesCached()
  } catch {
    // DB nedostupná (typicky při buildu obrazu v CI, kde neběží žádná DB).
    // Nespadneme — vrátíme prázdno; nic se necachuje, za běhu se data doplní.
    return { data: { pages: [], global: null, homepage: null } }
  }
})

/**
 * Karty (články i podstránky) se tahají s depth 0, takže `featuredImage.image`
 * je číselné id. Tady se ids hromadně přeloží na URL jedním dotazem — populace
 * přes depth 1 by stála stovky ms za KAŽDÝ dokument (v dev ještě víc).
 */
async function enrichFeaturedImages<T extends { featuredImage?: { image?: unknown } | null }>(
  docs: T[],
): Promise<T[]> {
  if (!docs?.length) return docs ?? []

  const ids = docs
    .map((d) => d.featuredImage?.image)
    .filter((img): img is number => typeof img === 'number')

  if (ids.length === 0) return docs

  const urlMap = await fetchMediaUrlsByIds([...new Set(ids)])

  return docs.map((d) => {
    const img = d.featuredImage?.image
    if (d.featuredImage && typeof img === 'number' && urlMap.has(img)) {
      return {
        ...d,
        featuredImage: {
          ...d.featuredImage,
          image: { url: urlMap.get(img)!, alternativeText: null },
        },
      }
    }
    return d
  })
}

/**
 * Dopopuluje obrázky v `contentImage` blocích rich-textu. Detail se tahá s
 * `depth: 0` (kvůli výkonu), takže upload relace UVNITŘ textu zůstávají jako
 * pouhá ID a `richTextToHtml` je zahodí (`if (!image?.url) return ''`). Stejně
 * jako u featuredImage je tedy dohledáme hromadně jedním dotazem a vložíme zpět
 * celý media dokument (kvůli url + alt + atribuci; media se NESMÍ ořezávat
 * selectem, jinak cloudinary plugin vrátí url: null).
 */
async function enrichRichTextImages<T>(text: T): Promise<T> {
  if (!text || typeof text !== 'object') return text

  const ids = new Set<number>()
  const collect = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(collect)
      return
    }
    if (node && typeof node === 'object') {
      const fields = (node as Record<string, unknown>).fields as Record<string, unknown> | undefined
      if (fields?.blockType === 'contentImage' && typeof fields.image === 'number') {
        ids.add(fields.image)
      }
      for (const value of Object.values(node as Record<string, unknown>)) collect(value)
    }
  }
  collect(text)
  if (ids.size === 0) return text

  const mediaMap = await fetchMediaByIds([...ids])
  if (mediaMap.size === 0) return text

  const rebuild = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(rebuild)
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        out[key] = rebuild(value)
      }
      const fields = out.fields as Record<string, unknown> | undefined
      if (
        fields?.blockType === 'contentImage' &&
        typeof fields.image === 'number' &&
        mediaMap.has(fields.image)
      ) {
        out.fields = { ...fields, image: mediaMap.get(fields.image) }
      }
      return out
    }
    return node
  }
  return rebuild(text) as T
}

/** Id z relace, která může být číslo nebo populovaný objekt. */
function relationId(value: unknown): number | string | null {
  if (typeof value === 'number' || typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) {
    return (value as { id: number | string }).id
  }
  return null
}

const isTouristPointCategory = (category: string | undefined) =>
  category?.trim() === PageCategory.Turisticky_cil

const isPlaceListingCategory = (category: string | undefined) => {
  const trimmed = category?.trim()
  return trimmed === PageCategory.Misto_k_navstiveni || trimmed === PageCategory.Mista
}

// Pojistka proti chybě v datech (např. rodičovský cyklus) — v praxi nejhlubší
// zjištěná hierarchie „Místo k navštívení" má ~6 úrovní.
const MAX_PLACES_TO_VISIT_DEPTH = 10

/**
 * Sekce „Co vidět" nezobrazuje jen přímé děti stránky, ale rekurzivně sestupuje
 * až k nejbližším místům, která už sama nemají další podřazená místa (San
 * Francisco pod USA, ne Kalifornie) — legacy `PageService.findDestinationPages`.
 * Turistické cíle přiřazené přímo pod „průchozí" místo (má vlastní podřazená
 * místa) se do stejného seznamu přimíchají (bublají).
 *
 * Dávkové BFS po úrovních (ne dotaz na stránku jako legacy rekurze) — každá
 * úroveň stromu = jeden dotaz `parent IN [...]`.
 *
 * `page` samo o sobě se v seznamu nikdy neobjeví: jeho vlastní turistické cíle
 * bublají VŽDY (bez ohledu na to, jestli má i další místa), jeho vlastní místa
 * jsou startovní frontier k rozbalení — přesně jako u kterékoli jiné „průchozí"
 * úrovně o patro níž.
 *
 * Kontinent (`!page.parent`, root „Místo k navštívení") je výjimka: zobrazí jen
 * přímé děti, bez sestupu do hloubky (u kontinentu nedává smysl skákat na města).
 */
async function resolvePlacesToVisitUncached(
  payload: Payload,
  page: { id: RawPayloadPage['id']; parent?: unknown },
  directChildren: PageChild[],
): Promise<PageChild[]> {
  if (!page.parent) {
    return directChildren.filter(
      (c) => isPlaceListingCategory(c.category) || isTouristPointCategory(c.category),
    )
  }

  const result: PageChild[] = []
  result.push(...directChildren.filter((c) => isTouristPointCategory(c.category)))
  let frontier: PageChild[] = directChildren.filter((c) => isPlaceListingCategory(c.category))

  for (let depth = 0; frontier.length > 0 && depth < MAX_PLACES_TO_VISIT_DEPTH; depth++) {
    const res = (await payload.find({
      overrideAccess: false,
      collection: 'pages',
      where: { parent: { in: frontier.map((n) => n.id) } },
      limit: 1000,
      depth: 0,
      select: PAGE_CHILDREN_SELECT,
      joins: false,
    })) as unknown as PayloadDocsResponse<PageChild & { parent?: unknown }>

    const childrenByParentId = new Map<string, PageChild[]>()
    for (const child of res.docs || []) {
      const parentId = String(relationId(child.parent))
      const list = childrenByParentId.get(parentId) ?? []
      list.push(child)
      childrenByParentId.set(parentId, list)
    }

    const nextFrontier: PageChild[] = []
    for (const node of frontier) {
      const children = childrenByParentId.get(String(node.id)) ?? []
      const placeChildren = children.filter((c) => isPlaceListingCategory(c.category))

      if (node.stopChildPlacesHere) {
        result.push(node)
        continue
      }
      if (placeChildren.length === 0) {
        result.push(node)
        continue
      }
      nextFrontier.push(...placeChildren)
      result.push(...children.filter((c) => isTouristPointCategory(c.category)))
    }
    frontier = nextFrontier
  }

  // Řazení podle návštěvnosti (GA4, klouzavých 12 měsíců) — sync viz
  // endpoints/syncAnalytics.ts. Stránky bez dat (nové/neaktualizované) na konec,
  // mezi sebou abecedně.
  return result.sort((a, b) => {
    const viewsDiff = (b.analyticsPageViews ?? 0) - (a.analyticsPageViews ?? 0)
    if (viewsDiff !== 0) return viewsDiff
    return a.title.localeCompare(b.title, 'cs')
  })
}

async function fetchPageByFullSlugUncached(fullSlug: string): Promise<{ data: { pages: Page[] } }> {
  const payload = await getDb()

  // Nejdřív načteme stránku + děti. Články dotahujeme až po nalezení stránky
  // a filtrujeme přes id relace (`mainPage`/`pages`) místo `*.fullSlug`.
  // Dotaz přes `mainPage.fullSlug` byl na některých stránkách výrazně pomalý.
  const pagePromise = payload
    .find({
      overrideAccess: false,
      collection: 'pages',
      where: { fullSlug: { equals: fullSlug } },
      limit: 1,
      depth: 0,
      select: PAGE_SCALAR_SELECT,
      joins: false,
    })
    .then((res) => res as unknown as PayloadDocsResponse<RawPayloadPage>)

  const childrenPromise = payload
    .find({
      overrideAccess: false,
      collection: 'pages',
      where: { 'parent.fullSlug': { equals: fullSlug } },
      limit: 100,
      // depth 0: obrázky karet dořeší enrichFeaturedImages hromadně — depth 1
      // by populoval media dokument za KAŽDÉ dítě zvlášť (v dev ~0,35 s/kus).
      depth: 0,
      select: PAGE_CHILDREN_SELECT,
      joins: false,
    })
    .then((res) => res as unknown as PayloadDocsResponse<PageChild>)

  const [pageRes, childrenRes] = (await Promise.all([pagePromise, childrenPromise])) as [
    PayloadDocsResponse<RawPayloadPage>,
    PayloadDocsResponse<PageChild>,
  ]

  const raw = pageRes.docs?.[0]
  if (!raw) {
    return { data: { pages: [] } }
  }

  const [articlesRes, placesToVisit] = await Promise.all([
    payload.find({
      overrideAccess: false,
      collection: 'articles',
      where: {
        or: [{ mainPage: { equals: raw.id } }, { pages: { in: [raw.id] } }],
      },
      limit: 100,
      // depth 0: mainPage stačí jako id (třídění přes relationId) a obrázky
      // karet dořeší enrichFeaturedImages. depth 1 by populoval mainPage jako
      // celé pages dokumenty VČETNĚ vyhodnocení jejich joinů (sekundy navíc).
      depth: 0,
      select: PAGE_ARTICLES_SELECT,
      joins: false,
    }) as unknown as Promise<PayloadDocsResponse<Article>>,
    // Sekce „Co vidět" — rekurzivně vyřešený seznam (místa i cíle), NE prosté
    // přímé děti. Viz resolvePlacesToVisitUncached výše.
    resolvePlacesToVisitUncached(payload, raw, childrenRes.docs || []),
  ])

  // Roztřídění článků: primární (mainPage = tato stránka) první — stejné
  // pořadí jako primaryArticles/secondaryArticles joiny.
  const allArticles = articlesRes.docs || []
  const primary = allArticles.filter(
    (a) => relationId((a as { mainPage?: unknown }).mainPage) === raw.id,
  )
  const secondary = allArticles.filter(
    (a) => relationId((a as { mainPage?: unknown }).mainPage) !== raw.id,
  )

  const match = normalizePage({
    ...raw,
    subPages: { docs: childrenRes.docs || [] },
    primaryArticles: { docs: primary },
    secondaryArticles: { docs: secondary },
  })

  const [enrichedPageArr, enrichedArticles, enrichedChildren, enrichedPlacesToVisit, enrichedText] =
    await Promise.all([
      enrichFeaturedImages([match]),
      enrichFeaturedImages(match.articles),
      enrichFeaturedImages(match.children.docs),
      // Místa/cíle „přibublaná" ze zanoření nejsou přímé děti — vlastní enrichment.
      enrichFeaturedImages(placesToVisit),
      // Obrázky v těle stránky (contentImage bloky) — depth 0 je nepopuluje.
      enrichRichTextImages((match as { text?: unknown }).text),
    ])

  // createdByPublic teče přímo z virtuálního pole (viz PAGE_SCALAR_SELECT) skrz
  // normalizePage → enrichFeaturedImages (obojí pole zachovává spreadem).
  const enrichedPage = enrichedPageArr[0] as Page
  enrichedPage.articles = enrichedArticles
  enrichedPage.children = { docs: enrichedChildren }
  enrichedPage.resolvedPlacesToVisit = enrichedPlacesToVisit
  ;(enrichedPage as { text?: unknown }).text = enrichedText

  return {
    data: {
      pages: [enrichedPage],
    },
  }
}

// Detail článku — jen pole, která článek kreslí (titulek, text, hero obrázek,
// autor, atribuce); mainPage jako id, rodič se dohledá zvlášť.
const ARTICLE_DETAIL_SELECT = {
  title: true,
  slug: true,
  documentId: true,
  text: true,
  attribution: true,
  featuredImage: true,
  mainPage: true,
  // #21: `pages` (vedlejší stránky, kam článek patří) potřebujeme kvůli validaci
  // rodiče v URL — článek smí žít jen pod mainPage NEBO některou z pages.
  pages: true,
  createdBy: true,
  createdByPublic: true,
} as const

// Fullslug bez vodicích/koncových lomítek — pro porovnání s cestou z URL, která
// je taky bez lomítek (`slug.slice(0, -1).join('/')`).
const stripSlashes = (s: string) => s.replace(/^\/+|\/+$/g, '')

type ArticleCandidate = { article: Article; validParentSlugs: string[] }

async function fetchArticlesBySlugUncached(
  slug: string,
): Promise<{ data: { candidates: ArticleCandidate[] } }> {
  const payload = await getDb()
  // depth 0 + select + joins:false: dřívější depth 2 bez selectu populoval
  // mainPage/pages jako celé pages dokumenty včetně vyhodnocení JEJICH joinů
  // (v dev ~24 s na dotaz). fullSlug rodičů a URL obrázku doplní mini-dotazy.
  //
  // slug NENÍ v kolekci articles unikátní (jen `index: true`) → dva různé články
  // mohou sdílet slug. Tahá­me proto VŠECHNY kandidáty (limit = pojistka) a výběr
  // toho správného podle rodiče z URL řeší volající (fetchArticleBySlug). Cache
  // klíčujeme jen slugem, takže „duch" URL nenafoukne počet cache záznamů.
  const res = await payload.find({
    overrideAccess: false,
    collection: 'articles',
    where: { slug: { equals: slug } },
    limit: 25,
    depth: 0,
    select: ARTICLE_DETAIL_SELECT,
    joins: false,
  })
  const raws = (res.docs ?? []) as unknown as Array<
    Article & { mainPage?: unknown; pages?: unknown }
  >
  if (raws.length === 0) return { data: { candidates: [] } }

  // Rodiče (mainPage + vedlejší pages) všech kandidátů dohledáme JEDNÍM dotazem
  // přes sjednocenou množinu id (obvykle 1 kandidát → stejná cena jako dřív).
  const parentIdsOf = (raw: Article & { mainPage?: unknown; pages?: unknown }) => {
    const mainPageId = relationId(raw.mainPage)
    const secondaryIds = Array.isArray(raw.pages)
      ? (raw.pages as unknown[]).map(relationId).filter((id): id is number | string => id != null)
      : []
    return [
      ...new Set([mainPageId, ...secondaryIds].filter((id): id is number | string => id != null)),
    ]
  }
  const allParentIds = [...new Set(raws.flatMap(parentIdsOf))]

  // Jedním dotazem fullSlug + title všech rodičů. overrideAccess false →
  // nepublikovaný rodič se veřejně nepočítá jako platná cesta. Chybu NEPOLYKÁME
  // (viz #22/#23): bez rodičů bychom nemohli validovat URL a omylem bychom
  // vracely 404 na platný článek → radši propadne do error boundary.
  const parentDocs =
    allParentIds.length > 0
      ? ((
          await payload.find({
            overrideAccess: false,
            collection: 'pages',
            where: { id: { in: allParentIds } },
            limit: allParentIds.length,
            depth: 0,
            select: { title: true, fullSlug: true },
            joins: false,
          })
        ).docs as unknown as Array<{
          id: number | string
          title?: string | null
          fullSlug?: string | null
        }>)
      : []
  const parentById = new Map(parentDocs.map((d) => [d.id, d]))

  // Obrázky (featured + v těle) dopiny per kandidát — depth 0 je nepopuluje.
  const candidates = await Promise.all(
    raws.map(async (raw): Promise<ArticleCandidate> => {
      const mainPageId = relationId(raw.mainPage)
      const [enriched, enrichedText] = await Promise.all([
        enrichFeaturedImages([raw]),
        enrichRichTextImages(raw.text),
      ])
      const validParentSlugs = parentIdsOf(raw)
        .map((id) => parentById.get(id)?.fullSlug)
        .filter((s): s is string => typeof s === 'string' && !!s)
        .map(stripSlashes)
      const mainPageDoc = mainPageId != null ? (parentById.get(mainPageId) ?? null) : null
      const article = {
        ...enriched[0],
        text: enrichedText,
        mainPage: mainPageDoc ?? null,
      } as unknown as Article
      return { article, validParentSlugs }
    }),
  )

  return { data: { candidates } }
}

const ensureCorrectFullSlug = (fullSlug: string) => {
  return fullSlug.startsWith('/') ? fullSlug : `/${fullSlug}`
}

const fetchArticlesBySlugCached = cached(fetchArticlesBySlugUncached, 'article', ([slug]) => [
  'article_' + slug,
])

export const fetchArticleBySlug = cache(
  async (
    slug: string,
    parentSlug?: string,
  ): Promise<{ data: { articles: Article[]; validParentSlugs: string[] } }> => {
    // #23: chybu DB ZÁMĚRNĚ nepolykáme. „Článek neexistuje" vrací prázdné pole
    // (uvnitř fetchArticlesBySlugUncached, když find nic nevrátí) → route zavolá
    // notFound() (404). Ale výpadek DB musí propadnout do error boundary (500,
    // viditelná + zalogovaná chyba), ne se maskovat jako 404 „nenalezeno".
    let candidates: ArticleCandidate[]
    try {
      candidates = (await fetchArticlesBySlugCached(slug)).data.candidates
    } catch (err) {
      console.error(`[article] načtení detailu selhalo pro "${slug}":`, err)
      throw err
    }
    if (candidates.length === 0) return { data: { articles: [], validParentSlugs: [] } }

    // Kolize slugů: slug NENÍ unikátní, takže může existovat víc článků se
    // stejným slugem. Vybereme toho, který legitimně žije pod cestou z URL
    // (mainPage nebo některá z pages). Když ani jeden nesedí (nebo parentSlug
    // není), vrátíme prvního → route přes isValidArticleParent vyhodnotí 404.
    const normalized = parentSlug ? parentSlug.replace(/^\/+|\/+$/g, '') : undefined
    const chosen =
      (normalized ? candidates.find((c) => c.validParentSlugs.includes(normalized)) : undefined) ??
      candidates[0]
    return { data: { articles: [chosen.article], validParentSlugs: chosen.validParentSlugs } }
  },
)

// ————————————————————————————————————————————————————————————————
// Komentáře k článku (veřejný výpis)
// ————————————————————————————————————————————————————————————————

// Surový tvar komentáře z Local API (depth 0) — jen pole, která web kreslí.
// `authorPublic` je virtuální (afterRead hook běží bez ohledu na depth/select).
type RawComment = {
  id: number
  authorName: string
  body: string
  rating?: number | null
  createdAt?: string | null
  author?: number | { id: number } | null
  parentComment?: number | { id: number } | null
  authorPublic?: { username?: string | null; avatar?: { url?: string | null } | null } | null
}

const relationIdOf = (v: number | { id: number } | null | undefined): number | null =>
  typeof v === 'number' ? v : v && typeof v === 'object' ? Number(v.id) : null

async function fetchArticleCommentsUncached(
  articleId: number,
): Promise<{ threads: CommentThread[]; count: number }> {
  const payload = await getDb()

  // Autor článku (pro štítek „autor" u jeho odpovědí). depth:0 → createdBy je id.
  let articleAuthorId: number | null = null
  try {
    const art = await payload.findByID({
      collection: 'articles',
      id: articleId,
      depth: 0,
      overrideAccess: true,
      select: { createdBy: true },
    })
    articleAuthorId = relationIdOf(
      (art as { createdBy?: number | { id: number } | null }).createdBy,
    )
  } catch {
    articleAuthorId = null
  }

  // overrideAccess: true → filtr si držíme sami (tento článek, typ komentář, bez
  // spamu). Načítáme CHRONOLOGICKY (nejstarší první) — kvůli správnému sestavení
  // vláken a pořadí odpovědí. Kořeny pak otočíme na nejnovější nahoře (viz níže),
  // ale odpovědi UVNITŘ vlákna zůstanou chronologicky pod dotazem.
  const res = await payload.find({
    collection: 'comments',
    overrideAccess: true,
    where: {
      and: [
        { 'relatedTo.relationTo': { equals: 'articles' } },
        { 'relatedTo.value': { equals: articleId } },
        { type: { equals: 'comment' } },
        { status: { not_equals: 'spam' } },
      ],
    },
    depth: 0,
    limit: 1000,
    pagination: false,
  })

  // Řadíme podle createdAt (u migrovaných = původní datum ze staré DB, doplněné
  // jednorázovým SQL, dnes odstraněným) s `id` jako rozhodčím — chronologie nese
  // sestavení vláken níže.
  const effectiveTime = (c: RawComment) => new Date(c.createdAt ?? 0).getTime()
  const docs = (res.docs as unknown as RawComment[]).slice().sort((a, b) => {
    const diff = effectiveTime(a) - effectiveTime(b)
    return diff !== 0 ? diff : a.id - b.id
  })

  const byId = new Map<number, CommentPublic>()
  const parentOf = new Map<number, number | null>()
  for (const c of docs) {
    const authorId = relationIdOf(c.author)
    byId.set(c.id, {
      id: c.id,
      authorName: c.authorName,
      body: c.body,
      commentedAt: c.createdAt ?? null,
      authorUsername: c.authorPublic?.username ?? null,
      avatarUrl: c.authorPublic?.avatar?.url ?? null,
      isAuthor: authorId != null && authorId === articleAuthorId,
      parentId: relationIdOf(c.parentComment),
    })
    parentOf.set(c.id, relationIdOf(c.parentComment))
  }

  // Kořen komentáře = projdeme řetěz `parentComment` nahoru (chybějící/smazaný
  // rodič nebo cyklus → bereme jako kořen). Vlákna zplošťujeme na jednu úroveň:
  // odpověď na odpověď se zobrazí také pod kořenem.
  const rootOf = (id: number): number => {
    let cur = id
    for (let guard = 0; guard < 50; guard++) {
      const p = parentOf.get(cur)
      if (p == null || p === cur || !byId.has(p)) return cur
      cur = p
    }
    return cur
  }

  // docs jsou chronologicky → kořen se vždy objeví před svými odpověďmi.
  const threadsById = new Map<number, CommentThread>()
  const rootOrder: number[] = []
  const ensureThread = (rootId: number): CommentThread => {
    let t = threadsById.get(rootId)
    if (!t) {
      t = { comment: byId.get(rootId)!, replies: [] }
      threadsById.set(rootId, t)
      rootOrder.push(rootId)
    }
    return t
  }
  for (const c of docs) {
    const root = rootOf(c.id)
    if (root === c.id) ensureThread(c.id)
    else ensureThread(root).replies.push(byId.get(c.id)!)
  }

  // Kořeny otočíme na NEJNOVĚJŠÍ NAHOŘE (nejstarší dole). Odpovědi uvnitř vlákna
  // zůstávají chronologicky (byly plněny v pořadí `docs`), aby odpověď navazovala
  // na dotaz.
  const threads = rootOrder.map((id) => threadsById.get(id)!).reverse()
  return { threads, count: docs.length }
}

const fetchArticleCommentsCached = cached(
  fetchArticleCommentsUncached,
  'article-comments',
  ([articleId]) => ['article_comments_' + articleId, 'comments'],
)

/** Veřejný výpis komentářů článku ve vláknech (chronologicky) + celkový počet. */
export const fetchArticleComments = cache(
  (articleId: number): Promise<{ threads: CommentThread[]; count: number }> =>
    fetchArticleCommentsCached(articleId),
)

// ————————————————————————————————————————————————————————————————
// Recenze turistického cíle (veřejný výpis)
// ————————————————————————————————————————————————————————————————

async function fetchPageReviewsUncached(pageId: number): Promise<{ reviews: ReviewPublic[] }> {
  const payload = await getDb()

  // overrideAccess: true → filtr si držíme sami (tato stránka, typ recenze, bez
  // spamu) — stejný vzor jako komentáře článku. Recenze nemají vlákna, stačí
  // plochý seznam.
  const res = await payload.find({
    collection: 'comments',
    overrideAccess: true,
    where: {
      and: [
        { 'relatedTo.relationTo': { equals: 'pages' } },
        { 'relatedTo.value': { equals: pageId } },
        { type: { equals: 'review' } },
        { status: { not_equals: 'spam' } },
      ],
    },
    depth: 0,
    limit: 1000,
    pagination: false,
  })

  // Nejnovější nahoře (legacy: comments.reverse()). Řadíme v JS podle efektivního
  // času `createdAt` (u migrovaných = původní datum) s `id` jako rozhodčím.
  // Záznam bez hodnocení (nemělo by nastat — kolekce ho u recenze vynucuje) se
  // VYŘADÍ; fallback na číslo by tiše ukazoval falešné hvězdičky. Stejně
  // přeskakuje null rating i souhrn fetchPageReviewStats níže.
  const effectiveTime = (c: RawComment) => new Date(c.createdAt ?? 0).getTime()
  const docs = (res.docs as unknown as RawComment[])
    .filter((c) => c.rating != null)
    .sort((a, b) => {
      const diff = effectiveTime(b) - effectiveTime(a)
      return diff !== 0 ? diff : b.id - a.id
    })

  const reviews: ReviewPublic[] = docs.map((c) => ({
    id: c.id,
    authorName: c.authorName,
    body: c.body,
    rating: c.rating!,
    reviewedAt: c.createdAt ?? null,
    authorUsername: c.authorPublic?.username ?? null,
    avatarUrl: c.authorPublic?.avatar?.url ?? null,
  }))

  return { reviews }
}

const fetchPageReviewsCached = cached(
  fetchPageReviewsUncached,
  'page-reviews',
  // Tag `page_reviews_<id>` invaliduje afterChange/afterDelete hook kolekce
  // comments (viz src/hooks/revalidation.ts) — nová recenze se projeví okamžitě.
  ([pageId]) => ['page_reviews_' + pageId, 'comments'],
)

/** Veřejný výpis recenzí turistického cíle (nejnovější nahoře). */
export const fetchPageReviews = cache((pageId: number): Promise<{ reviews: ReviewPublic[] }> =>
  fetchPageReviewsCached(pageId),
)

/** Souhrn recenzí jedné stránky: počet + průměrné hodnocení (pro výpisy cílů). */
export type PageReviewStats = { count: number; avg: number }

async function fetchPageReviewStatsUncached(
  pageIds: number[],
): Promise<Record<number, PageReviewStats>> {
  if (pageIds.length === 0) return {}
  const payload = await getDb()

  // Jeden hromadný dotaz pro všechny cíle ve výpisu (žádný dotaz per dítě).
  // Vrací se plain objekt (ne Map) — unstable_cache výsledek serializuje.
  const res = await payload.find({
    collection: 'comments',
    overrideAccess: true,
    where: {
      and: [
        { 'relatedTo.relationTo': { equals: 'pages' } },
        { 'relatedTo.value': { in: pageIds } },
        { type: { equals: 'review' } },
        { status: { not_equals: 'spam' } },
      ],
    },
    depth: 0,
    limit: 0,
    pagination: false,
    select: { rating: true, relatedTo: true },
  })

  const sums = new Map<number, { count: number; total: number }>()
  for (const doc of res.docs as unknown as Array<{
    rating?: number | null
    relatedTo?: { relationTo?: string; value?: number | { id: number } | null } | null
  }>) {
    const pageId = relationIdOf(doc.relatedTo?.value ?? null)
    if (pageId == null || doc.rating == null) continue
    const s = sums.get(pageId) ?? { count: 0, total: 0 }
    s.count += 1
    s.total += doc.rating
    sums.set(pageId, s)
  }

  const stats: Record<number, PageReviewStats> = {}
  for (const [pageId, s] of sums) {
    stats[pageId] = { count: s.count, avg: s.total / s.count }
  }
  return stats
}

const fetchPageReviewStatsCached = cached(
  fetchPageReviewStatsUncached,
  'page-review-stats',
  // Nová recenze cíle invaliduje hookem tag page_reviews_<id> → souhrn se přepočítá.
  ([pageIds]) => ['comments', ...pageIds.map((id) => 'page_reviews_' + id)],
)

/** Souhrny recenzí pro sadu stránek (hvězdičky + počet ve výpisu cílů). */
export const fetchPageReviewStats = cache(
  (pageIds: number[]): Promise<Record<number, PageReviewStats>> =>
    fetchPageReviewStatsCached(pageIds),
)

// ————————————————————————————————————————————————————————————————
// Sousední turistické cíle (pás „Další vyhledávaná Místa…" na detailu cíle)
// ————————————————————————————————————————————————————————————————

/** Sourozenec cíle pro doporučující pás — jen pole, která karta kreslí. */
export type RelatedTouristPoint = {
  id: number
  title: string
  fullSlug: string
  /** ID media obrázku (URL doplní fetchMediaUrlsByIds), null = bez fotky. */
  imageId: number | null
}

async function fetchTouristPointSiblingsUncached(
  parentFullSlug: string,
  excludeId: number,
): Promise<RelatedTouristPoint[]> {
  const payload = await getDb()

  const res = await payload.find({
    collection: 'pages',
    overrideAccess: false,
    where: {
      and: [
        { 'parent.fullSlug': { equals: '/' + parentFullSlug.replace(/^\/+/, '') } },
        { category: { equals: 'Turistický cíl' } },
        { id: { not_equals: excludeId } },
      ],
    },
    depth: 0,
    // Legacy zobrazoval max 4 karty; pár navíc jako rezerva, kdyby některé
    // neměly fotku a UI chtělo vybírat.
    limit: 8,
    select: { title: true, fullSlug: true, featuredImage: true },
    joins: false,
  })

  return (
    res.docs as unknown as Array<{
      id: number
      title: string
      fullSlug: string
      featuredImage?: { image?: number | { id: number } | null } | null
    }>
  ).map((doc) => ({
    id: doc.id,
    title: doc.title,
    fullSlug: doc.fullSlug,
    imageId: relationIdOf(doc.featuredImage?.image ?? null),
  }))
}

const fetchTouristPointSiblingsCached = cached(
  fetchTouristPointSiblingsUncached,
  'tourist-siblings',
  () => ['pages'],
)

/** Sousední cíle stejného místa (bez aktuálního) pro pás doporučení. */
export const fetchTouristPointSiblings = cache(
  (parentFullSlug: string, excludeId: number): Promise<RelatedTouristPoint[]> =>
    fetchTouristPointSiblingsCached(parentFullSlug, excludeId),
)

// ————————————————————————————————————————————————————————————————
// Veřejný profil uživatele (/profil/<username>)
// ————————————————————————————————————————————————————————————————

type RawProfileUser = {
  id: number
  username?: string | null
  name?: string | null
  description?: string | null
  myWebUrl?: string | null
  avatar?: { url?: string | null } | number | null
}

type RawProfileArticle = {
  id: number
  title: string
  slug?: string | null
  documentId?: string | null
  text?: unknown
  featuredImage?: { image?: unknown } | null
  mainPage?: number | { id: number } | null
  publishedAt?: string | null
  createdAt?: string | null
}

type RawProfilePage = {
  id: number
  title: string
  fullSlug: string
  category?: string
  featuredImage?: { image?: unknown } | null
  breadcrumbs?: { label?: string | null }[] | null
  createdAt?: string | null
  /** Souřadnice pro mapu profilu; v CMS jsou uložené jako text. */
  detail?: { latitude?: string | null; longitude?: string | null } | null
}

type RawProfileComment = RawComment & {
  type?: string | null
  relatedTo?: {
    relationTo?: string | null
    value?: number | { id: number } | null
  } | null
}

/** Rodičovská/komentovaná stránka dohledaná kvůli názvu, adrese a cestě v hierarchii. */
type ResolvedParentPage = {
  id: number
  title: string
  fullSlug: string
  breadcrumbs?: { label?: string | null }[] | null
}

/**
 * Cesta v hierarchii z drobečků, např. „Asie / Myanmar".
 *
 * `dropLast` = vynechat poslední položku. U KARTY MÍSTA je poslední drobeček to
 * místo samo (jeho název je titulek karty), takže se vynechává. U KARTY ČLÁNKU
 * je cesta odvozená z jeho rodičovské stránky, a ta do popisku patří celá —
 * říká, o jakém místě článek je.
 */
function breadcrumbPath(
  breadcrumbs: { label?: string | null }[] | null | undefined,
  { dropLast }: { dropLast: boolean },
): string | null {
  if (!Array.isArray(breadcrumbs)) return null
  const items = dropLast ? breadcrumbs.slice(0, -1) : breadcrumbs
  // Kontextový popisek nese informaci od ZEMĚ — kontinent se vynechává
  // (viz stripLeadingContinent; plná cesta zůstává jen v navigaci na stránce).
  const labels = stripLeadingContinent(
    items.map((b) => b?.label).filter((l): l is string => typeof l === 'string' && l.length > 0),
  )
  return labels.length ? labels.join(' / ') : null
}

async function fetchUserProfileUncached(username: string): Promise<UserProfileData | null> {
  const payload = await getDb()

  // Uživatel podle username. Users.read = isAdminOrSelf a web čte anonymně,
  // proto overrideAccess: true + PŘÍSNÝ select jen veřejných polí (nikdy e-mail,
  // role ani hash hesla) — stejný princip jako virtuální createdByPublic.
  const userRes = (await payload.find({
    collection: 'users',
    overrideAccess: true,
    where: { username: { equals: username } },
    limit: 1,
    // depth 1 populuje avatar; media dokument se NEOŘEZÁVÁ (viz hlavička souboru).
    depth: 1,
    select: {
      username: true,
      name: true,
      description: true,
      myWebUrl: true,
      avatar: true,
    },
  })) as unknown as PayloadDocsResponse<RawProfileUser>

  const user = userRes.docs?.[0]
  if (!user) return null

  // Obsah uživatele — tři nezávislé dotazy souběžně. Stránky a články čteme s
  // overrideAccess: false (anonymní přístupová práva → jen publikované),
  // komentáře s overrideAccess: true + ručním filtrem spamu (vzor recenzí výše).
  const [articlesRes, pagesRes, commentsRes] = (await Promise.all([
    payload.find({
      collection: 'articles',
      overrideAccess: false,
      where: { createdBy: { equals: user.id } },
      depth: 0,
      limit: 500,
      pagination: false,
      select: {
        title: true,
        slug: true,
        documentId: true,
        // `text` tu ZÁMĚRNĚ není: karta článku na profilu ho nezobrazuje, ale
        // načítal by celé rich texty až 500 článků a ukládal je do cache.
        featuredImage: true,
        mainPage: true,
        publishedAt: true,
        createdAt: true,
      },
      joins: false,
    }),
    payload.find({
      collection: 'pages',
      overrideAccess: false,
      where: {
        and: [
          { createdBy: { equals: user.id } },
          {
            category: {
              in: [PageCategory.Turisticky_cil, PageCategory.Misto_k_navstiveni],
            },
          },
        ],
      },
      depth: 0,
      limit: 500,
      pagination: false,
      select: {
        title: true,
        fullSlug: true,
        category: true,
        featuredImage: true,
        breadcrumbs: BREADCRUMBS_SELECT,
        createdAt: true,
        // Jen souřadnice pro mapu — ne celá skupina `detail` (adresa, web,
        // skloňování… by se tahaly zbytečně).
        detail: { latitude: true, longitude: true },
      },
      joins: false,
    }),
    payload.find({
      collection: 'comments',
      overrideAccess: true,
      where: {
        and: [{ author: { equals: user.id } }, { status: { not_equals: 'spam' } }],
      },
      depth: 0,
      limit: 1000,
      pagination: false,
      // Select vynechává virtuální authorPublic — autora známe (vlastník profilu)
      // a hook by jinak zbytečně dohledával uživatele pro každé čtení.
      select: {
        type: true,
        rating: true,
        body: true,
        createdAt: true,
        relatedTo: true,
      },
    }),
  ])) as unknown as [
    PayloadDocsResponse<RawProfileArticle>,
    PayloadDocsResponse<RawProfilePage>,
    PayloadDocsResponse<RawProfileComment>,
  ]

  const rawArticles = articlesRes.docs ?? []
  const rawPages = pagesRes.docs ?? []
  const rawComments = commentsRes.docs ?? []

  // Cíle komentářů/recenzí (článek / stránka), na které se bude odkazovat.
  const articleTargetIds = new Set<number>()
  const pageTargetIds = new Set<number>()
  for (const c of rawComments) {
    const id = relationIdOf(c.relatedTo?.value ?? null)
    if (id == null) continue
    if (c.relatedTo?.relationTo === 'articles') articleTargetIds.add(id)
    else if (c.relatedTo?.relationTo === 'pages') pageTargetIds.add(id)
  }

  // Komentované články (kvůli titulku + adrese přes jejich mainPage).
  const targetArticlesRes = articleTargetIds.size
    ? ((await payload.find({
        collection: 'articles',
        overrideAccess: false,
        where: { id: { in: [...articleTargetIds] } },
        depth: 0,
        limit: articleTargetIds.size,
        pagination: false,
        select: { title: true, slug: true, mainPage: true },
        joins: false,
      })) as unknown as PayloadDocsResponse<RawProfileArticle>)
    : { docs: [] as RawProfileArticle[] }
  const targetArticleById = new Map((targetArticlesRes.docs ?? []).map((a) => [a.id, a]))

  // Rodičovské stránky (fullSlug/titulek/drobečky) jedním hromadným dotazem:
  // mainPage autorových článků + mainPage komentovaných článků + komentované
  // stránky. `breadcrumbs` slouží k popisku „Asie / Myanmar" na kartě článku.
  // overrideAccess: false → nepublikovaný cíl se nedohledá a položka se vynechá
  // (odkaz na 404 je horší než chybějící řádek).
  const pageIdsToResolve = new Set<number>()
  for (const a of rawArticles) {
    const id = relationIdOf(a.mainPage ?? null)
    if (id != null) pageIdsToResolve.add(id)
  }
  for (const a of targetArticlesRes.docs ?? []) {
    const id = relationIdOf(a.mainPage ?? null)
    if (id != null) pageIdsToResolve.add(id)
  }
  for (const id of pageTargetIds) pageIdsToResolve.add(id)

  const resolvedPagesRes = pageIdsToResolve.size
    ? ((await payload.find({
        collection: 'pages',
        overrideAccess: false,
        where: { id: { in: [...pageIdsToResolve] } },
        depth: 0,
        limit: pageIdsToResolve.size,
        pagination: false,
        select: { title: true, fullSlug: true, breadcrumbs: BREADCRUMBS_SELECT },
        joins: false,
      })) as unknown as PayloadDocsResponse<ResolvedParentPage>)
    : { docs: [] as ResolvedParentPage[] }
  const pageById = new Map((resolvedPagesRes.docs ?? []).map((p) => [p.id, p]))

  // Obrázky karet hromadně (depth 0 nechává featuredImage.image jako id).
  const [enrichedArticles, enrichedPages] = await Promise.all([
    enrichFeaturedImages(rawArticles),
    enrichFeaturedImages(rawPages),
  ])

  const articleParent = (a: RawProfileArticle): ResolvedParentPage | undefined => {
    const mainPageId = relationIdOf(a.mainPage ?? null)
    return mainPageId != null ? pageById.get(mainPageId) : undefined
  }

  const articleHref = (a: RawProfileArticle): string | null => {
    const parent = articleParent(a)
    if (!parent || !a.slug) return null
    return `${parent.fullSlug.replace(/\/$/, '')}/${a.slug}`
  }

  // Nejnovější nahoře; publishedAt může být null → fallback createdAt, id jako rozhodčí.
  const articleTime = (a: RawProfileArticle) =>
    new Date(a.publishedAt ?? a.createdAt ?? 0).getTime()
  const articles: ProfileArticleItem[] = enrichedArticles
    .slice()
    .sort((x, y) => articleTime(y) - articleTime(x) || y.id - x.id)
    .flatMap((a) => {
      const parent = articleParent(a)
      const href = articleHref(a)
      // Článek bez dosažitelné adresy (bez mainPage / bez publikovaného rodiče)
      // vynecháme — nemá kam vést.
      if (!href) return []
      return [
        {
          key: a.documentId || a.slug || String(a.id),
          title: a.title,
          href,
          imageUrl: getArticleImageUrl(a as unknown as Article),
          // Kde článek „žije" — celá cesta rodičovské stránky („Asie / Myanmar"),
          // stejný popisek jako u karet míst. Bez drobečků aspoň název rodiče.
          path: breadcrumbPath(parent?.breadcrumbs, { dropLast: false }) ?? parent?.title ?? null,
        },
      ]
    })

  const pageTime = (p: RawProfilePage) => new Date(p.createdAt ?? 0).getTime()
  const toPlaceItem = (p: RawProfilePage): ProfilePlaceItem => ({
    id: p.id,
    title: p.title,
    fullSlug: p.fullSlug,
    // featuredImage má stejný tvar jako u článků → sdílený helper.
    imageUrl: getArticleImageUrl(p as unknown as Article),
    // Poslední drobeček je místo samo (= titulek karty), proto se vynechává.
    path: breadcrumbPath(p.breadcrumbs, { dropLast: true }),
  })
  const sortedPages = enrichedPages.slice().sort((x, y) => pageTime(y) - pageTime(x) || y.id - x.id)
  const touristPoints = sortedPages
    .filter((p) => p.category === PageCategory.Turisticky_cil)
    .map(toPlaceItem)
  const places = sortedPages
    .filter((p) => p.category === PageCategory.Misto_k_navstiveni)
    .map(toPlaceItem)

  // Body na mapu = místa i cíle, které mají v CMS souřadnice. Bereme je ze
  // STEJNÝCH dat jako karty (žádný dotaz navíc). Články na mapu nepatří —
  // nemají vlastní souřadnice, jen souřadnice svého místa, takže by se piny
  // jen zdvojily přes sebe.
  const mapPins: ProfileMapPin[] = sortedPages.flatMap((p) => {
    const lat = parseFloat(p.detail?.latitude ?? '')
    const lng = parseFloat(p.detail?.longitude ?? '')
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return []
    return [
      {
        id: p.id,
        title: p.title,
        fullSlug: p.fullSlug,
        lat,
        lng,
        // Fotku bereme z už obohacených stránek (stejná jako na kartě) — mapa
        // pak kreslí kulaté piny s fotkou a v bublině ukáže náhled místo
        // nápisu „Bez náhledu".
        imageUrl: getArticleImageUrl(p as unknown as Article),
      },
    ]
  })

  // Cíl komentáře/recenze → titulek + odkaz; nedohledaný (nepublikovaný) → null.
  const targetOf = (c: RawProfileComment): { title: string; href: string } | null => {
    const id = relationIdOf(c.relatedTo?.value ?? null)
    if (id == null) return null
    if (c.relatedTo?.relationTo === 'pages') {
      const p = pageById.get(id)
      return p ? { title: p.title, href: p.fullSlug } : null
    }
    if (c.relatedTo?.relationTo === 'articles') {
      const a = targetArticleById.get(id)
      if (!a) return null
      const href = articleHref(a)
      return href ? { title: a.title, href } : null
    }
    return null
  }

  const commentTime = (c: RawProfileComment) => new Date(c.createdAt ?? 0).getTime()
  const sortedComments = rawComments
    .slice()
    .sort((x, y) => commentTime(y) - commentTime(x) || y.id - x.id)

  // Profil je PŘEHLED — dlouhá těla zkracujeme (legacy komentáře občas obsahují
  // i kilobajty vloženého balastu z Wordu; plné znění je na stránce cíle/článku).
  const PROFILE_BODY_LIMIT = 400
  const trimBody = (body: string): string => {
    const compact = body.replace(/\s+/g, ' ').trim()
    return compact.length > PROFILE_BODY_LIMIT
      ? compact.slice(0, PROFILE_BODY_LIMIT).trimEnd() + '…'
      : compact
  }

  const reviews: ProfileReviewItem[] = []
  const comments: ProfileCommentItem[] = []
  for (const c of sortedComments) {
    const target = targetOf(c)
    if (!target) continue
    if (c.type === 'review' && c.rating != null) {
      reviews.push({
        id: c.id,
        targetTitle: target.title,
        targetHref: target.href,
        rating: c.rating,
        body: trimBody(c.body),
        reviewedAt: c.createdAt ?? null,
      })
    } else if (c.type === 'comment') {
      comments.push({
        id: c.id,
        targetTitle: target.title,
        targetHref: target.href,
        body: trimBody(c.body),
        commentedAt: c.createdAt ?? null,
      })
    }
  }

  return {
    id: Number(user.id),
    username: user.username ?? username,
    name: user.name?.trim() || null,
    description: user.description ?? null,
    myWebUrl: user.myWebUrl ?? null,
    avatarUrl: user.avatar && typeof user.avatar === 'object' ? (user.avatar.url ?? null) : null,
    articles,
    touristPoints,
    places,
    reviews,
    comments,
    mapPins,
  }
}

const fetchUserProfileCached = cached(
  fetchUserProfileUncached,
  'user-profile',
  // user_profile_<username> invaliduje hook kolekce users (změna profilu v
  // adminu); široké tagy pokrývají nový/upravený obsah (publikace článku,
  // stránky, nový komentář) — všechny je revalidují stávající hooky.
  ([username]) => ['user_profile_' + username, 'users', 'pages', 'articles', 'comments'],
)

/** Veřejný profil uživatele podle username; null = uživatel neexistuje. */
export const fetchUserProfile = cache((username: string): Promise<UserProfileData | null> =>
  fetchUserProfileCached(username),
)

// ————————————————————————————————————————————————————————————————
// Sekce „Náš tým" na stránce O nás
// ————————————————————————————————————————————————————————————————

/** URL avataru z populovaného (depth 1) pole `avatar`; číslo = nepopulováno. */
function avatarUrlOf(avatar: RawProfileUser['avatar']): string | null {
  return avatar && typeof avatar === 'object' ? (avatar.url ?? null) : null
}

/**
 * Tváře dřívějších přispěvatelů pod týmem + kolik dalších se do řady nevešlo.
 *
 * Řazení podle objemu příspěvků zjišťuje ZÁMĚRNĚ přímý SQL dotaz přes drizzle
 * (dvě agregace GROUP BY), ne payload.find: Local API žene každý vrácený
 * dokument přes afterRead pipeline, takže „posbírej autory 2 400 stránek" stálo
 * v dev serveru ~0,8 s na request (viz fetchPlaceCandidateIds). Tady stačí
 * dvojice (autor, počet).
 *
 * Práva se tím neobcházejí: `_status = published` odpovídá anonymnímu pravidlu
 * čtení stránek a jména s avatary se stejně dotahují běžným payload.find
 * s přísným selectem veřejných polí.
 */
async function fetchContributorFaces(
  payload: Payload,
  teamUserIds: number[],
): Promise<{ faces: ContributorFace[]; remainingContributors: number }> {
  const db = payload.db as unknown as PostgresAdapter
  const pagesTable = db.tables.pages
  const articlesTable = db.tables.articles

  const [pageRows, articleRows] = await Promise.all([
    db.drizzle
      .select({ userId: pagesTable.createdBy, total: count() })
      .from(pagesTable)
      .where(and(eq(pagesTable._status, 'published'), isNotNull(pagesTable.createdBy)))
      .groupBy(pagesTable.createdBy),
    // Články nemají koncept (v tabulce není `_status`), takže se nefiltrují.
    db.drizzle
      .select({ userId: articlesTable.createdBy, total: count() })
      .from(articlesTable)
      .where(isNotNull(articlesTable.createdBy))
      .groupBy(articlesTable.createdBy),
  ])

  // Součet je jen VÁHA pro řazení („kdo přispěl nejvíc"), ne číslo na obrazovku
  // — počítá i podstránky míst (Počasí, Doprava…), které se nikde nevypisují.
  const weights = new Map<number, number>()
  for (const row of [...pageRows, ...articleRows]) {
    const id = Number(row.userId)
    if (!Number.isInteger(id) || teamUserIds.includes(id)) continue
    weights.set(id, (weights.get(id) ?? 0) + Number(row.total))
  }
  if (weights.size === 0) return { faces: [], remainingContributors: 0 }

  const candidateIds = [...weights.keys()].sort(
    (a, b) => (weights.get(b) ?? 0) - (weights.get(a) ?? 0),
  )

  // Jména a avatary přispěvatelů — stejný přísný select jako u profilu
  // (nikdy e-mail, role ani hash hesla).
  const usersRes = (await payload.find({
    collection: 'users',
    overrideAccess: true,
    where: { id: { in: candidateIds } },
    limit: candidateIds.length,
    depth: 1,
    select: { username: true, name: true, avatar: true },
  })) as unknown as PayloadDocsResponse<RawProfileUser>

  const byId = new Map((usersRes.docs ?? []).map((u) => [u.id, u]))
  // Skuteční lidé v pořadí podle objemu příspěvků; technické účty ven.
  const people = candidateIds.flatMap((id) => {
    const user = byId.get(id)
    if (!user?.username) return []
    if (NON_PERSON_USERNAMES.includes(user.username)) return []
    return [user]
  })

  // Do řady jdou jen ti s fotkou — mezi tvářemi by zastupující papoušci
  // vypadali jako chybějící obrázky, ne jako lidé bez avataru.
  const faces: ContributorFace[] = []
  for (const user of people) {
    if (faces.length >= CONTRIBUTOR_FACES_LIMIT) break
    const avatarUrl = avatarUrlOf(user.avatar)
    if (!avatarUrl) continue
    faces.push({ username: user.username!, name: user.name ?? null, avatarUrl })
  }

  return { faces, remainingContributors: Math.max(0, people.length - faces.length) }
}

async function fetchTeamSectionUncached(usernames: string[]): Promise<TeamSectionData> {
  const payload = await getDb()

  // Členové týmu. Users.read = isAdminOrSelf a web čte anonymně, proto
  // overrideAccess: true + PŘÍSNÝ select jen veřejných polí — stejný princip
  // jako u fetchUserProfile a virtuálního createdByPublic.
  const usersRes = (await payload.find({
    collection: 'users',
    overrideAccess: true,
    where: { username: { in: usernames } },
    limit: usernames.length,
    // depth 1 populuje avatar; media dokument se NEOŘEZÁVÁ (viz hlavička souboru).
    depth: 1,
    // `description` tu ZÁMĚRNĚ není — karta medailonek nezobrazuje.
    select: { username: true, name: true, avatar: true },
  })) as unknown as PayloadDocsResponse<RawProfileUser>

  const found = usersRes.docs ?? []
  // Pořadí drží TEAM_USERNAMES, ne databáze. Účet, který neexistuje (překlep
  // v seznamu, smazaný profil), se vynechá — sekce se nesmí kvůli tomu rozbít.
  const team = usernames.flatMap((username) => {
    const doc = found.find((d) => d.username === username)
    return doc?.username ? [doc] : []
  })
  if (team.length === 0) return { members: [], faces: [], remainingContributors: 0 }

  const countPagesOf = (userId: number, category: PageCategory) =>
    payload
      .count({
        collection: 'pages',
        // overrideAccess: false → anonymní práva, tedy jen publikované stránky
        // (stejné číslo, jaké autor vidí na svém profilu).
        overrideAccess: false,
        where: { and: [{ createdBy: { equals: userId } }, { category: { equals: category } }] },
      })
      .then((res) => res.totalDocs ?? 0)

  const [members, contributors] = await Promise.all([
    Promise.all(
      team.map(async (user) => {
        // Čtyři levné COUNTy souběžně — čísla do medailonku, žádný obsah.
        const [places, touristPoints, articles, reviews] = await Promise.all([
          countPagesOf(user.id, PageCategory.Misto_k_navstiveni),
          countPagesOf(user.id, PageCategory.Turisticky_cil),
          payload
            .count({
              collection: 'articles',
              overrideAccess: false,
              where: { createdBy: { equals: user.id } },
            })
            .then((res) => res.totalDocs ?? 0),
          // Recenze: jako u profilu overrideAccess: true + ruční odfiltrování spamu.
          payload
            .count({
              collection: 'comments',
              overrideAccess: true,
              where: {
                and: [
                  { author: { equals: user.id } },
                  { type: { equals: 'review' } },
                  { status: { not_equals: 'spam' } },
                ],
              },
            })
            .then((res) => res.totalDocs ?? 0),
        ])

        return {
          username: user.username!,
          name: user.name ?? null,
          avatarUrl: avatarUrlOf(user.avatar),
          counts: { places, touristPoints, articles, reviews },
        } satisfies TeamMemberPublic
      }),
    ),
    fetchContributorFaces(
      payload,
      team.map((u) => u.id),
    ),
  ])

  return { members, ...contributors }
}

const fetchTeamSectionCached = cached(
  fetchTeamSectionUncached,
  'team-section',
  // Změna profilu (users), nová stránka/článek i nová recenze mění čísla
  // v medailonku — všechny tři tagy revalidují stávající hooky.
  () => ['users', 'pages', 'articles', 'comments'],
)

/** Data sekce „Náš tým" na stránce O nás — medailonky a tváře přispěvatelů. */
export const fetchTeamSection = cache((): Promise<TeamSectionData> =>
  fetchTeamSectionCached([...TEAM_USERNAMES]),
)

const fetchPageByFullSlugCached = cached(
  fetchPageByFullSlugUncached,
  'page-detail',
  ([fullSlug]) => ['page_' + fullSlug, 'pages'],
)

export const fetchPageByFullSlug = cache(async (slug: string) => {
  // #22: chybu DB ZÁMĚRNĚ nepolykáme. „Stránka neexistuje" vrací prázdné pole
  // (uvnitř fetchPageByFullSlugUncached, když find nic nevrátí) → route zavolá
  // notFound() (404). Ale výpadek DB musí propadnout do error boundary (500,
  // viditelná + zalogovaná chyba), ne se maskovat jako 404 „stránka nenalezena".
  try {
    return await fetchPageByFullSlugCached(ensureCorrectFullSlug(slug))
  } catch (err) {
    console.error(`[page] načtení detailu selhalo pro "${slug}":`, err)
    throw err
  }
})

/**
 * Lehká varianta fetchPageByFullSlug — jen pole pro menu a drobečky
 * (title, slug, fullSlug, category, detail, featuredImage + děti).
 * Používá se pro předky v řetězci (breadcrumbs, menu kontext).
 */
async function fetchPageLightByFullSlugUncached(
  fullSlug: string,
): Promise<{ data: { pages: Page[] } }> {
  const payload = await getDb()
  // Předek + jeho děti (menu sekce) paralelně — obojí bez joinů.
  const [res, childrenRes] = await Promise.all([
    payload.find({
      overrideAccess: false,
      collection: 'pages',
      where: { fullSlug: { equals: fullSlug } },
      limit: 1,
      depth: 1,
      select: ANCESTOR_SELECT,
      joins: false,
    }),
    payload.find({
      overrideAccess: false,
      collection: 'pages',
      where: { 'parent.fullSlug': { equals: fullSlug } },
      limit: 100,
      depth: 0,
      select: MENU_SELECT,
      joins: false,
    }),
  ])
  const raw = res.docs?.[0] as unknown as RawPayloadPage | undefined
  const match = raw
    ? normalizePage({
        ...raw,
        subPages: { docs: (childrenRes.docs ?? []) as unknown as PageChild[] },
      })
    : undefined
  return { data: { pages: match ? [match] : [] } }
}

const fetchPageLightCached = cached(
  fetchPageLightByFullSlugUncached,
  'page-light',
  ([fullSlug]) => ['page_' + fullSlug, 'pages'],
)

export const fetchPageLightByFullSlug = cache(async (slug: string) => {
  try {
    return await fetchPageLightCached(ensureCorrectFullSlug(slug))
  } catch {
    return { data: { pages: [] as Page[] } }
  }
})

/**
 * Sekce pro složenou stránku „Praktické informace": sousední podstránky místa
 * (děti stejného rodiče) v kategoriích, ze kterých se stránka skládá.
 * Jen pole potřebná pro skládání (title, fullSlug, category, text) — řazení
 * a nadpisy sekcí řeší composePracticalInfoHtml.
 */
async function fetchPracticalInfoSectionsUncached(
  parentFullSlug: string,
): Promise<PracticalInfoSection[]> {
  const payload = await getDb()
  const res = await payload.find({
    overrideAccess: false,
    collection: 'pages',
    where: {
      'parent.fullSlug': { equals: parentFullSlug },
      category: { in: practicalInfoSectionCategories },
    },
    limit: 20,
    // depth 1: texty obsahují obrázky (upload uzly) a interní odkazy — bez
    // populace by zůstaly jen jako ID a z poskládané stránky by vypadly.
    depth: 1,
    select: { title: true, fullSlug: true, category: true, text: true },
    joins: false,
  })
  return (res.docs ?? []) as unknown as PracticalInfoSection[]
}

const fetchPracticalInfoSectionsCached = cached(
  fetchPracticalInfoSectionsUncached,
  'practical-info-sections',
  // Široký tag 'pages' — složená stránka závisí na textech VÍCE podstránek,
  // takže se musí invalidovat při publikaci kterékoli z nich.
  ([parentFullSlug]) => ['page_' + parentFullSlug + '_practical-sections', 'pages'],
)

export const fetchPracticalInfoSections = cache(
  async (parentFullSlug: string): Promise<PracticalInfoSection[]> => {
    try {
      return await fetchPracticalInfoSectionsCached(ensureCorrectFullSlug(parentFullSlug))
    } catch (err) {
      console.error(`[page] načtení sekcí praktických informací selhalo:`, err)
      return []
    }
  },
)

/**
 * Levné zjištění, zda má stránka (podle fullSlug) nějaké články — jen počet,
 * bez stahování obsahu. Rozhoduje o záložce „Články" v podnavigaci.
 */
async function pageHasArticlesBySlugUncached(fullSlug: string): Promise<boolean> {
  const payload = await getDb()
  const res = await payload.count({
    overrideAccess: false,
    collection: 'articles',
    // Stejné pokrytí jako detail stránky (fetchPageByFullSlugUncached): článek
    // připojený přes `mainPage` NEBO přes sekundární `pages`.
    where: {
      or: [
        { 'mainPage.fullSlug': { equals: fullSlug } },
        { 'pages.fullSlug': { equals: fullSlug } },
      ],
    },
  })
  return (res.totalDocs ?? 0) > 0
}

const pageHasArticlesBySlugCached = cached(
  pageHasArticlesBySlugUncached,
  'page-has-articles',
  ([fullSlug]) => ['page_' + fullSlug + '_articles', 'articles'],
)

export const pageHasArticlesBySlug = cache(async (fullSlug: string): Promise<boolean> => {
  try {
    // Normalizace na vedoucí lomítko — cache tag `page_<slug>_articles` musí
    // odpovídat tomu, který invaliduje revalidace (doc.fullSlug s lomítkem).
    return await pageHasArticlesBySlugCached(ensureCorrectFullSlug(fullSlug))
  } catch {
    return false
  }
})

export const pageHasArticles = cache(async (pageId: number | string): Promise<boolean> => {
  try {
    const payload = await getDb()
    const res = await payload.count({
      overrideAccess: false,
      collection: 'articles',
      // Článek připojený přes `mainPage` NEBO sekundární `pages` (stejně jako
      // detail stránky) — jinak by se záložka „Články" u některých stránek
      // nezobrazila, i když články mají.
      where: {
        or: [{ mainPage: { equals: pageId } }, { pages: { in: [pageId] } }],
      },
    })
    return (res.totalDocs ?? 0) > 0
  } catch {
    return false
  }
})

async function fetchFooterUncached(): Promise<GlobalFooter | null> {
  const payload = await getDb()
  const data = (await payload.findGlobal({
    slug: 'footer',
    overrideAccess: false,
  })) as unknown as Record<string, unknown>
  const contact = (data.contact ?? {}) as Record<string, unknown>
  return {
    logo: (data.logo as GlobalFooter['logo']) ?? null,
    lede: (data.lede as string | null) ?? null,
    contact: {
      email: (contact.email as string | null) ?? null,
      personName: (contact.personName as string | null) ?? null,
      personHref: (contact.personHref as string | null) ?? null,
    },
    navItems: (data.navItems as GlobalFooter['navItems']) ?? [],
    copyrightText: (data.copyrightText as GlobalFooter['copyrightText']) ?? null,
  }
}

const fetchFooterCached = cached(fetchFooterUncached, 'footer', () => ['footer'])

export const fetchFooter = cache(async (): Promise<GlobalFooter | null> => {
  try {
    return await fetchFooterCached()
  } catch {
    return null
  }
})

/**
 * Batch-fetch media URLs by IDs for map markers.
 * Returns a Map of mediaId → URL string.
 * (Bez cache — lokální dotaz je ~ms a Map není serializovatelná.)
 */
export async function fetchMediaUrlsByIds(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map()
  const map = new Map<number, string>()
  try {
    const payload = await getDb()
    const res = await payload.find({
      overrideAccess: false,
      collection: 'media',
      where: { id: { in: ids } },
      limit: ids.length,
      depth: 0,
    })
    for (const doc of res.docs || []) {
      const d = doc as unknown as { id: number; url?: string | null }
      if (d.url) map.set(d.id, d.url)
    }
  } catch {
    // bez URL — karty zobrazí placeholder
  }
  return map
}

/**
 * Jako `fetchMediaUrlsByIds`, ale vrací CELÉ media dokumenty (url + alt +
 * atribuce). Používá `enrichRichTextImages` pro obrázky v těle článku, kde
 * `richTextToHtml` potřebuje víc než jen url. Bez `select` (ořez by cloudinary
 * pluginu shodil url na null).
 */
async function fetchMediaByIds(ids: number[]): Promise<Map<number, Record<string, unknown>>> {
  const map = new Map<number, Record<string, unknown>>()
  if (ids.length === 0) return map
  try {
    const payload = await getDb()
    const res = await payload.find({
      overrideAccess: false,
      collection: 'media',
      where: { id: { in: ids } },
      limit: ids.length,
      depth: 0,
    })
    for (const doc of res.docs || []) {
      const d = doc as unknown as { id: number; url?: string | null }
      if (d.url) map.set(d.id, d as Record<string, unknown>)
    }
  } catch {
    // bez médií — obrázky se prostě nevykreslí (jako dosud)
  }
  return map
}

/**
 * All indexable page & article paths for the sitemap. Pages use `fullSlug`,
 * články `mainPage.fullSlug + slug`.
 */
async function fetchSitemapEntriesUncached(): Promise<{
  pages: { path: string; lastModified: string }[]
  articles: { path: string; lastModified: string }[]
}> {
  type SitemapPage = { id: number | string; fullSlug?: string | null; updatedAt?: string | null }
  type SitemapArticle = {
    slug?: string | null
    updatedAt?: string | null
    mainPage?: unknown
  }

  const payload = await getDb()
  const [p, a] = await Promise.all([
    payload.find({
      overrideAccess: false,
      collection: 'pages',
      limit: 0,
      pagination: false,
      depth: 0,
      select: { fullSlug: true, updatedAt: true },
      joins: false,
    }),
    payload.find({
      overrideAccess: false,
      collection: 'articles',
      limit: 0,
      pagination: false,
      // depth 0: populace mainPage by vyhodnocovala joiny pages dokumentu za
      // každý článek; fullSlug rodiče se bere z mapy už načtených stránek.
      depth: 0,
      select: { slug: true, updatedAt: true, mainPage: true },
      joins: false,
    }),
  ])
  const pagesDocs = p.docs as unknown as SitemapPage[]
  const articlesDocs = a.docs as unknown as SitemapArticle[]

  const now = new Date().toISOString()

  // fullSlug rodičů článků z už načtených stránek (id → fullSlug)
  const slugById = new Map<number | string, string>()
  for (const doc of pagesDocs) {
    if (typeof doc.fullSlug === 'string' && doc.fullSlug) slugById.set(doc.id, doc.fullSlug)
  }

  const pages = pagesDocs
    .filter((p) => typeof p.fullSlug === 'string' && p.fullSlug)
    .map((p) => ({
      path: p.fullSlug as string,
      lastModified: p.updatedAt || now,
    }))

  const articles = articlesDocs
    .map((a) => {
      const parentId = relationId(a.mainPage)
      const parent = parentId != null ? (slugById.get(parentId) ?? null) : null
      if (!parent || !a.slug) return null
      return {
        path: `${parent.replace(/\/$/, '')}/${a.slug}`,
        lastModified: a.updatedAt || now,
      }
    })
    .filter((x): x is { path: string; lastModified: string } => x !== null)

  return { pages, articles }
}

const fetchSitemapEntriesCached = cached(fetchSitemapEntriesUncached, 'sitemap', () => [
  'sitemap',
  'pages',
  'articles',
])

export const fetchSitemapEntries = async () => {
  try {
    return await fetchSitemapEntriesCached()
  } catch (err) {
    console.error('[sitemap] load failed:', err)
    return { pages: [], articles: [] }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Homepage: sekce „Co je nového" — nová místa + recenze + komentáře v jednom
// proudu (nahrazuje záložky starého webu). Klient filtruje/stránkuje lokálně,
// proto se tahá víc položek na druh, než se hned zobrazí.
// ─────────────────────────────────────────────────────────────────────────────

const ACTIVITY_PER_KIND = 12

// Jen pole, která feed opravdu mapuje. POZOR: `author` (syrová relace) tu musí
// být, i když se nezobrazuje — virtuální `authorPublic` z něj v afterRead čte
// (stejná past jako `createdBy` u createdByPublic; bez něj zmizí avatary).
const ACTIVITY_COMMENT_SELECT = {
  type: true,
  rating: true,
  body: true,
  createdAt: true,
  authorName: true,
  relatedTo: true,
  author: true,
  authorPublic: true,
} as const

type RawActivityPage = {
  id: number
  title: string
  fullSlug: string
  text?: unknown
  createdAt?: string | null
  breadcrumbs?: { label?: string | null }[] | null
  featuredImage?: { image?: unknown } | null
  createdByPublic?: {
    username?: string | null
    name?: string | null
    avatar?: { url?: string | null } | null
  } | null
}

type RawActivityComment = {
  id: number
  type?: string
  rating?: number | null
  body: string
  createdAt?: string | null
  authorName?: string | null
  relatedTo?: { relationTo?: string; value?: number | { id: number } | null } | null
  authorPublic?: { username?: string | null; avatar?: { url?: string | null } | null } | null
}

/** Zhuštění na jeden řádek výpisu (legacy texty obsahují i vložený balast). */
function activityExcerpt(text: string, max = 160): string | null {
  const compact = text.replace(/\s+/g, ' ').trim()
  if (!compact) return null
  return compact.length > max ? compact.slice(0, max).trimEnd() + '…' : compact
}

async function fetchLatestActivityUncached(): Promise<ActivityItem[]> {
  const payload = await getDb()

  const [placesRes, reviewsRes, commentsRes] = await Promise.all([
    payload.find({
      collection: 'pages',
      overrideAccess: false,
      where: {
        and: [
          { _status: { equals: 'published' } },
          {
            category: {
              in: [
                PageCategory.Misto_k_navstiveni,
                PageCategory.Turisticky_cil,
                PageCategory.Mista,
              ],
            },
          },
        ],
      },
      // createdAt = původní datum vzniku místa (u migrovaných doplněno ze staré
      // DB skriptem backfill-page-created-dates).
      sort: '-createdAt',
      limit: ACTIVITY_PER_KIND,
      depth: 0,
      joins: false,
      select: {
        title: true,
        fullSlug: true,
        text: true,
        createdAt: true,
        breadcrumbs: BREADCRUMBS_SELECT,
        featuredImage: true,
        // createdByPublic (virtuální) čte data.createdBy — bez něj v selectu
        // vrací null a autor by ve výpisu chyběl.
        createdBy: true,
        createdByPublic: true,
      },
    }),
    // overrideAccess: false → anonymní pravidlo kolekce skryje spam i recenze
    // na nepublikovaných stránkách. createdAt = datum vložení (u migrovaných
    // doplněno ze staré DB), takže DB sort je bezpečný.
    payload.find({
      collection: 'comments',
      overrideAccess: false,
      where: { type: { equals: 'review' } },
      sort: '-createdAt',
      limit: ACTIVITY_PER_KIND,
      depth: 0,
      // `joins: false` tu na rozdíl od pages není (ani nejde) — komentáře
      // žádná join pole nemají, typ ho proto nepovoluje.
      select: ACTIVITY_COMMENT_SELECT,
    }),
    payload.find({
      collection: 'comments',
      overrideAccess: false,
      where: { type: { equals: 'comment' } },
      sort: '-createdAt',
      limit: ACTIVITY_PER_KIND,
      depth: 0,
      select: ACTIVITY_COMMENT_SELECT,
    }),
  ])

  // Cíle recenzí/komentářů hromadně (stejný vzor jako profil) — populace přes
  // depth by stála dotaz za každou položku.
  const rawComments = [...reviewsRes.docs, ...commentsRes.docs] as unknown as RawActivityComment[]
  const pageTargetIds = new Set<number>()
  const articleTargetIds = new Set<number>()
  for (const c of rawComments) {
    const id = relationIdOf(c.relatedTo?.value ?? null)
    if (id == null) continue
    if (c.relatedTo?.relationTo === 'pages') pageTargetIds.add(id)
    else if (c.relatedTo?.relationTo === 'articles') articleTargetIds.add(id)
  }

  type TargetPage = {
    id: number
    title: string
    fullSlug: string
    breadcrumbs?: { label?: string | null }[] | null
  }
  type TargetArticle = {
    id: number
    title: string
    slug?: string | null
    mainPage?: number | { id: number } | null
  }
  const [targetPagesRes, targetArticlesRes] = await Promise.all([
    pageTargetIds.size
      ? payload.find({
          collection: 'pages',
          overrideAccess: false,
          where: { id: { in: [...pageTargetIds] } },
          depth: 0,
          joins: false,
          limit: pageTargetIds.size,
          pagination: false,
          select: { title: true, fullSlug: true, breadcrumbs: BREADCRUMBS_SELECT },
        })
      : { docs: [] },
    articleTargetIds.size
      ? payload.find({
          collection: 'articles',
          overrideAccess: false,
          where: { id: { in: [...articleTargetIds] } },
          depth: 0,
          joins: false,
          limit: articleTargetIds.size,
          pagination: false,
          select: { title: true, slug: true, mainPage: true },
        })
      : { docs: [] },
  ])
  const targetPageById = new Map(
    (targetPagesRes.docs as unknown as TargetPage[]).map((p) => [p.id, p]),
  )
  const targetArticleById = new Map(
    (targetArticlesRes.docs as unknown as TargetArticle[]).map((a) => [a.id, a]),
  )

  // Adresa článku = fullSlug hlavní stránky + slug článku (viz articleHref
  // v profilu) — hlavní stránky dohledáme jedním dotazem.
  const mainPageIds = new Set<number>()
  for (const a of targetArticleById.values()) {
    const id = relationIdOf(a.mainPage ?? null)
    if (id != null) mainPageIds.add(id)
  }
  const mainPagesRes = mainPageIds.size
    ? await payload.find({
        collection: 'pages',
        overrideAccess: false,
        where: { id: { in: [...mainPageIds] } },
        depth: 0,
        joins: false,
        limit: mainPageIds.size,
        pagination: false,
        select: { fullSlug: true, breadcrumbs: BREADCRUMBS_SELECT },
      })
    : { docs: [] }
  const mainPageById = new Map((mainPagesRes.docs as unknown as TargetPage[]).map((p) => [p.id, p]))

  const targetOf = (
    c: RawActivityComment,
  ): { title: string; href: string; context: string | null } | null => {
    const id = relationIdOf(c.relatedTo?.value ?? null)
    if (id == null) return null
    if (c.relatedTo?.relationTo === 'pages') {
      const p = targetPageById.get(id)
      // Poslední drobeček je místo samo (= titulek řádku), proto se vynechává.
      return p
        ? {
            title: p.title,
            href: p.fullSlug,
            context: breadcrumbPath(p.breadcrumbs, { dropLast: true }),
          }
        : null
    }
    if (c.relatedTo?.relationTo === 'articles') {
      const a = targetArticleById.get(id)
      if (!a?.slug) return null
      const mainId = relationIdOf(a.mainPage ?? null)
      const main = mainId != null ? mainPageById.get(mainId) : undefined
      if (!main) return null
      return {
        title: a.title,
        href: `${main.fullSlug.replace(/\/$/, '')}/${a.slug}`,
        // U článku celá cesta jeho místa („Evropa / Anglie") — titulek řádku je
        // název článku, takže se nic neduplikuje.
        context: breadcrumbPath(main.breadcrumbs, { dropLast: false }),
      }
    }
    return null
  }

  const enrichedPlaces = await enrichFeaturedImages(placesRes.docs as unknown as RawActivityPage[])
  const placeItems: ActivityItem[] = enrichedPlaces.map((p) => {
    const img = p.featuredImage?.image
    const author = p.createdByPublic
    return {
      kind: 'place',
      key: `place-${p.id}`,
      title: p.title,
      href: p.fullSlug,
      date: p.createdAt ?? null,
      authorName: author?.name?.trim() || author?.username || null,
      authorUsername: author?.username ?? null,
      avatarUrl: author?.avatar?.url ?? null,
      text: activityExcerpt(richTextToPlainText(p.text)),
      context: breadcrumbPath(p.breadcrumbs, { dropLast: true }),
      image: img && typeof img === 'object' ? ((img as { url?: string | null }).url ?? null) : null,
      rating: null,
    }
  })

  const commentItems: ActivityItem[] = rawComments.flatMap((c) => {
    const target = targetOf(c)
    // Bez dohledatelného cíle (nepublikovaná stránka apod.) položku vynecháme —
    // odkaz na 404 je horší než chybějící řádek.
    if (!target) return []
    return [
      {
        kind: c.type === 'review' ? ('review' as const) : ('comment' as const),
        key: `comment-${c.id}`,
        title: target.title,
        href: target.href,
        date: c.createdAt ?? null,
        authorName: c.authorName?.trim() || c.authorPublic?.username || null,
        authorUsername: c.authorPublic?.username ?? null,
        avatarUrl: c.authorPublic?.avatar?.url ?? null,
        text: activityExcerpt(c.body),
        context: target.context,
        image: null,
        rating: c.type === 'review' ? (c.rating ?? null) : null,
      },
    ]
  })

  // Jeden proud, nejnovější nahoře; klíč jako rozhodčí pro stabilní pořadí.
  return [...placeItems, ...commentItems].sort((a, b) => {
    const diff = new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime()
    return diff !== 0 ? diff : a.key.localeCompare(b.key)
  })
}

const fetchLatestActivityCached = cached(fetchLatestActivityUncached, 'latest-activity', () => [
  'latest-activity',
  'pages',
  'articles',
  'comments',
  // Položky nesou jména/avatary autorů (createdByPublic/authorPublic) — změna
  // profilu musí feed invalidovat hned, ne až časovou pojistkou.
  'users',
])

export const fetchLatestActivity = async (): Promise<{
  items: ActivityItem[]
  /**
   * Čas načtení — referenční „teď" pro relativní časy ve feedu. Počítá se
   * ZÁMĚRNĚ tady (mimo unstable_cache i mimo render komponenty): v cache by
   * zamrzl a v komponentě ho zakazuje react-compiler (impure during render).
   */
  fetchedAt: number
}> => {
  try {
    return { items: await fetchLatestActivityCached(), fetchedAt: Date.now() }
  } catch (err) {
    // Homepage nesmí spadnout kvůli sekci novinek — bez dat se prostě nevykreslí.
    console.error('[whats-new] load failed:', err)
    return { items: [], fetchedAt: Date.now() }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Homepage: data pro tři sekce (schválená varianta D, 8/2026) — „Rady na
// cestu" (denní výběr 4 rad jako dlaždice + boční seznam nejnovějších článků
// „Nejnovější články"), dlaždicová „Inspirace na cestu" (denní výběr míst) a mozaika
// rubrik „Témata ke čtení" na konci stránky.
// ─────────────────────────────────────────────────────────────────────────────

const RADY_NA_CESTU_SLUG = 'rady-na-cestu'
const INSPIRATION_RADY_LIMIT = 4
const INSPIRATION_ARTICLES_LIMIT = 4
const INSPIRATION_PLACES_LIMIT = 4

/**
 * Deterministický generátor náhody (mulberry32). Denní výběry (rady, místa)
 * se odvozují ze seedu = dnešního data, takže jsou STEJNÉ pro všechny
 * návštěvníky celý den — jen tak fungují s produkční cache (skutečná náhoda
 * per request by stejně zamrzla na tom, co se zrovna nacachovalo).
 */
function mulberry32(seed: number): () => number {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Dnešek v pražském čase jako číslo (20260803) — seed denních výběrů. */
function todaySeed(): number {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' }).format(new Date())
  return Number(day.replaceAll('-', ''))
}

/** Vybere až `count` položek deterministicky (částečný Fisher–Yates). */
function seededPick<T>(items: T[], count: number, rand: () => number): T[] {
  const arr = [...items]
  const n = Math.min(count, arr.length)
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rand() * (arr.length - i))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr.slice(0, n)
}

type RawInspirationArticle = {
  id: number
  title: string
  slug?: string | null
  mainPage?: number | { id: number } | null
  featuredImage?: { image?: unknown } | null
}

const featuredImageUrl = (doc: { featuredImage?: { image?: unknown } | null }): string | null => {
  const img = doc.featuredImage?.image
  return img && typeof img === 'object' ? ((img as { url?: string | null }).url ?? null) : null
}

/**
 * ID kandidátů pro denní výběr míst — ZÁMĚRNĚ přímý SQL dotaz přes drizzle,
 * ne payload.find: Local API žene každý vrácený dokument přes afterRead
 * pipeline (field hooky, sanitizace), což při ~660 kandidátech stálo v dev
 * serveru ~0,8 s na KAŽDÝ request (změřeno 4. 8. 2026; samotné SQL trvá
 * jednotky ms). Potřebujeme ale jen ID.
 *
 * Práva se tím neobcházejí: filtr `_status = published` odpovídá anonymnímu
 * pravidlu čtení stránek a vylosovaná místa stejně dotahuje běžný payload.find
 * s `overrideAccess: false` (plná práva + sanitizace polí). Řazení podle id
 * drží deterministické denní míchání — bez stabilního pořadí by seed nestačil.
 */
async function fetchPlaceCandidateIds(payload: Payload): Promise<number[]> {
  const db = payload.db as unknown as PostgresAdapter
  const pages = db.tables.pages
  const rows = await db.drizzle
    .select({ id: pages.id })
    .from(pages)
    .where(
      and(
        eq(pages._status, 'published'),
        eq(pages.category, PageCategory.Misto_k_navstiveni),
        isNotNull(pages.featuredImage_image),
      ),
    )
    .orderBy(asc(pages.id))
  return rows.map((r) => Number(r.id))
}

async function fetchHomepageInspirationUncached(): Promise<HomepageInspiration> {
  const payload = await getDb()

  // Rubrika „Rady na cestu" — kotva bočního seznamu (id pro dotaz, fullSlug pro
  // odkazy). Bez ní se seznam rad prostě nevykreslí (web nesmí spadnout).
  const rubrikaRes = await payload.find({
    collection: 'pages',
    overrideAccess: false,
    where: {
      and: [
        { slug: { equals: RADY_NA_CESTU_SLUG } },
        { category: { equals: PageCategory.Rubrika } },
      ],
    },
    limit: 1,
    depth: 0,
    joins: false,
    select: { title: true, fullSlug: true },
  })
  const rubrika = (rubrikaRes.docs[0] ?? null) as {
    id: number
    title: string
    fullSlug: string
  } | null

  const [radyAllRes, articlesRes, placeIds, rubrikyRes] = await Promise.all([
    // Kandidáti dlaždic rad: VŠECHNY rady s fotkou (18 malých řádků) — denní
    // výběr 4 z nich dělá seedovaný los níž. sort: 'id' kvůli deterministickému
    // míchání.
    rubrika
      ? payload.find({
          collection: 'articles',
          overrideAccess: false,
          where: {
            and: [
              { mainPage: { equals: rubrika.id } },
              { 'featuredImage.image': { exists: true } },
            ],
          },
          sort: 'id',
          pagination: false,
          limit: 0,
          depth: 0,
          joins: false,
          select: { title: true, slug: true, featuredImage: true },
        })
      : Promise.resolve({ docs: [] } as PayloadDocsResponse<unknown>),
    // Boční seznam „Nejnovější články": nejnovější články MIMO rady (rady mají
    // dlaždice vedle). +2 rezerva na články bez dohledatelné hlavní stránky.
    payload.find({
      collection: 'articles',
      overrideAccess: false,
      where: {
        and: [
          { publishedAt: { exists: true } },
          { mainPage: { exists: true } },
          ...(rubrika ? [{ mainPage: { not_equals: rubrika.id } }] : []),
        ],
      },
      sort: '-publishedAt',
      limit: INSPIRATION_ARTICLES_LIMIT + 2,
      depth: 0,
      joins: false,
      select: { title: true, slug: true, mainPage: true, featuredImage: true },
    }),
    // Kandidáti dlaždic „Inspirace na cestu": jen id všech publikovaných míst
    // s fotkou (~stovky řádků; vybraná dotáhne druhý dotaz níž) — přímé SQL,
    // viz komentář u fetchPlaceCandidateIds.
    fetchPlaceCandidateIds(payload),
    // Rubriky pro „Témata ke čtení" na konci stránky — všechny kromě Rad na
    // cestu (mají vlastní vitrínu nahoře). Řazení podle názvu je jen stabilní
    // základ pro deterministické denní míchání níž (bez pevného pořadí by
    // seed nestačil).
    payload.find({
      collection: 'pages',
      overrideAccess: false,
      where: {
        and: [
          { _status: { equals: 'published' } },
          { category: { equals: PageCategory.Rubrika } },
          { slug: { not_equals: RADY_NA_CESTU_SLUG } },
        ],
      },
      sort: 'title',
      limit: 12,
      depth: 0,
      joins: false,
      select: { title: true, fullSlug: true, featuredImage: true },
    }),
  ])

  // — Dlaždice rad: denní los 4 rad z kandidátů. Vlastní proud náhody (seed+1),
  // aby výběr rad a míst nebyly svázané.
  const radyPicked = seededPick(
    (radyAllRes.docs as RawInspirationArticle[]).filter((a) => !!a.slug),
    INSPIRATION_RADY_LIMIT,
    mulberry32(todaySeed() + 1),
  )
  const enrichedRady = await enrichFeaturedImages(radyPicked)
  const rady: InspirationLink[] = rubrika
    ? enrichedRady.map((a) => ({
        key: `article-${a.id}`,
        title: a.title,
        href: `${rubrika.fullSlug.replace(/\/$/, '')}/${a.slug}`,
        imageUrl: featuredImageUrl(a),
      }))
    : []

  // — Boční seznam „Nejnovější články": href = fullSlug hlavní stránky + slug článku
  // (stejné pravidlo jako všude jinde). Hlavní stránky dohledá jeden hromadný
  // dotaz; článek bez dohledatelné (nepublikované) stránky se vynechá.
  const articleCandidates = (articlesRes.docs as RawInspirationArticle[]).filter((a) => !!a.slug)
  const articleMainIds = [
    ...new Set(
      articleCandidates
        .map((a) => relationId(a.mainPage))
        .filter((id): id is number | string => id != null),
    ),
  ]
  const articleMainPages = articleMainIds.length
    ? ((
        await payload.find({
          collection: 'pages',
          overrideAccess: false,
          where: { id: { in: articleMainIds } },
          limit: articleMainIds.length,
          pagination: false,
          depth: 0,
          joins: false,
          select: { fullSlug: true },
        })
      ).docs as unknown as Array<{ id: number | string; fullSlug?: string | null }>)
    : []
  const articleMainById = new Map(articleMainPages.map((p) => [p.id, p]))
  const articleDocs = articleCandidates
    .filter((a) => {
      const mainId = relationId(a.mainPage)
      return mainId != null && !!articleMainById.get(mainId)?.fullSlug
    })
    .slice(0, INSPIRATION_ARTICLES_LIMIT)
  const enrichedArticles = await enrichFeaturedImages(articleDocs)
  const articles: InspirationLink[] = enrichedArticles.map((a) => {
    const main = articleMainById.get(relationId(a.mainPage)!)!
    return {
      key: `article-${a.id}`,
      title: a.title,
      href: `${main.fullSlug!.replace(/\/$/, '')}/${a.slug}`,
      imageUrl: featuredImageUrl(a),
    }
  })

  // — Denní výběr míst se seedem z data (sdílený seededPick). Vybraná místa
  // (INSPIRATION_PLACES_LIMIT) dotáhne druhý dotaz a vrátí se v pořadí výběru.
  const chosenIds = seededPick(placeIds, INSPIRATION_PLACES_LIMIT, mulberry32(todaySeed()))
  let places: InspirationLink[] = []
  if (chosenIds.length > 0) {
    const placesRes = await payload.find({
      collection: 'pages',
      overrideAccess: false,
      where: { id: { in: chosenIds } },
      limit: chosenIds.length,
      pagination: false,
      depth: 0,
      joins: false,
      select: {
        title: true,
        fullSlug: true,
        featuredImage: true,
        breadcrumbs: BREADCRUMBS_SELECT,
      },
    })
    const enrichedPlaces = await enrichFeaturedImages(
      placesRes.docs as unknown as Array<{
        id: number
        title: string
        fullSlug: string
        featuredImage?: { image?: unknown } | null
        breadcrumbs?: { label?: string | null }[] | null
      }>,
    )
    const byId = new Map(enrichedPlaces.map((p) => [p.id, p]))
    places = chosenIds.flatMap((id) => {
      const p = byId.get(id)
      if (!p) return []
      // Poslední drobeček je místo samo → poloha = předposlední (přímý rodič).
      // U míst na nejvyšší úrovni (Turecko) žádný není → bez podtitulku.
      const parentLabel = p.breadcrumbs?.at(-2)?.label
      return [
        {
          key: `page-${p.id}`,
          title: p.title,
          href: p.fullSlug,
          imageUrl: featuredImageUrl(p),
          sub: typeof parentLabel === 'string' && parentLabel ? parentLabel : null,
        },
      ]
    })
  }

  const enrichedRubriky = await enrichFeaturedImages(
    rubrikyRes.docs as unknown as Array<{
      id: number
      title: string
      fullSlug: string
      featuredImage?: { image?: unknown } | null
    }>,
  )
  // Denní obměna pořadí rubrik — rozložení „Témata ke čtení" dává prvním třem
  // velké dlaždice, takže se v nich rubriky každý den prostřídají. Vlastní
  // proud náhody (seed+2), aby míchání nebylo svázané s losem míst (seed)
  // ani rad (seed+1).
  const rubriky: InspirationLink[] = seededPick(
    enrichedRubriky,
    enrichedRubriky.length,
    mulberry32(todaySeed() + 2),
  ).map((r) => ({
    key: `page-${r.id}`,
    title: r.title,
    href: r.fullSlug,
    imageUrl: featuredImageUrl(r),
  }))

  return {
    rady,
    radyHref: rubrika?.fullSlug ?? `/${RADY_NA_CESTU_SLUG}`,
    articles,
    places,
    rubriky,
  }
}

// Denní rotaci rad a míst zajišťuje revalidate pojistka v cached() (max 5 min
// po půlnoci se přepočítá) — seed je do té doby stejný, takže se nic nemění.
const fetchHomepageInspirationCached = cached(
  fetchHomepageInspirationUncached,
  'homepage-inspiration',
  () => ['homepage-inspiration', 'pages', 'articles'],
)

export const fetchHomepageInspiration = async (): Promise<HomepageInspiration | null> => {
  try {
    return await fetchHomepageInspirationCached()
  } catch (err) {
    // Homepage nesmí spadnout kvůli inspiraci — bez dat se sekce nevykreslí.
    console.error('[inspiration] load failed:', err)
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Homepage: denní výběr místa pro hero fotku v headeru + placeholder
// vyhledávání ("Najdi si svůj cíl — třeba X"). Stejný princip jako denní výběr
// míst v sekci Inspirace (seed = dnešní datum, cached() s revalidate pojistkou
// 300 s), ale VLASTNÍ posun seedu (+3), ať los hero fotky nezávisí na losu
// dlaždic Inspirace.
// ─────────────────────────────────────────────────────────────────────────────

/** ID kandidátů pro denní výběr hero místa — přímý SQL dotaz, viz komentář
 * u fetchPlaceCandidateIds (populace přes payload.find by byla zbytečně
 * drahá, tady stačí ID). Zahrnuje všechny kategorie míst (jako fetchLatestActivity),
 * ne jen „Místo k navštívení" — hero fotka může být z libovolného místa/cíle. */
async function fetchHeroPlaceCandidateIds(payload: Payload): Promise<number[]> {
  const db = payload.db as unknown as PostgresAdapter
  const pages = db.tables.pages
  const rows = await db.drizzle
    .select({ id: pages.id })
    .from(pages)
    .where(
      and(
        eq(pages._status, 'published'),
        inArray(pages.category, [
          PageCategory.Misto_k_navstiveni,
          PageCategory.Turisticky_cil,
          PageCategory.Mista,
        ]),
        isNotNull(pages.featuredImage_image),
      ),
    )
    .orderBy(asc(pages.id))
  return rows.map((r) => Number(r.id))
}

async function fetchHomepageHeroPlaceUncached(): Promise<HomepageHeroPlace | null> {
  const payload = await getDb()
  const candidateIds = await fetchHeroPlaceCandidateIds(payload)
  const [chosenId] = seededPick(candidateIds, 1, mulberry32(todaySeed() + 3))
  if (chosenId == null) return null

  const res = await payload.find({
    collection: 'pages',
    overrideAccess: false,
    where: { id: { equals: chosenId } },
    limit: 1,
    depth: 0,
    joins: false,
    select: { title: true, featuredImage: true },
  })
  const [doc] = await enrichFeaturedImages(
    res.docs as unknown as Array<{
      id: number
      title: string
      featuredImage?: { image?: unknown; featureImageStyleCss?: string | null } | null
    }>,
  )
  if (!doc) return null

  // Kandidát prošel SQL filtrem na `featuredImage_image IS NOT NULL` (id
  // relace na Media existuje), ale samotný Media dokument může být osamocený
  // (smazaný) nebo bez URL — pak by šel fallback obrázek s title/zarovnáním
  // z JINÉHO místa. Bez URL proto vracíme null, ať volající použije fallback
  // pro všechny tři hodnoty najednou, ne jen pro obrázek.
  const imageUrl = featuredImageUrl(doc)
  if (!imageUrl) return null

  return {
    title: doc.title,
    imageUrl,
    styleCss: doc.featuredImage?.featureImageStyleCss ?? null,
  }
}

// Denní rotaci zajišťuje revalidate pojistka v cached() (max 5 min po půlnoci
// se přepočítá) — stejný princip jako u fetchHomepageInspirationCached.
const fetchHomepageHeroPlaceCached = cached(
  fetchHomepageHeroPlaceUncached,
  'homepage-hero-place',
  () => ['homepage-hero-place', 'pages'],
)

export const fetchHomepageHeroPlace = async (): Promise<HomepageHeroPlace | null> => {
  try {
    return await fetchHomepageHeroPlaceCached()
  } catch (err) {
    // Homepage nesmí spadnout kvůli hero fotce — zavolající má statický fallback.
    console.error('[hero-place] load failed:', err)
    return null
  }
}
