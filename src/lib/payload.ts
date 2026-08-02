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
} from '@/types/payload'
import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import { getDb } from './db'
import { getArticleImageUrl, isProduction } from './utils'

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

  const articlesRes = (await payload.find({
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
  })) as unknown as PayloadDocsResponse<Article>

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

  const [enrichedPageArr, enrichedArticles, enrichedChildren, enrichedText] = await Promise.all([
    enrichFeaturedImages([match]),
    enrichFeaturedImages(match.articles),
    enrichFeaturedImages(match.children.docs),
    // Obrázky v těle stránky (contentImage bloky) — depth 0 je nepopuluje.
    enrichRichTextImages((match as { text?: unknown }).text),
  ])

  // createdByPublic teče přímo z virtuálního pole (viz PAGE_SCALAR_SELECT) skrz
  // normalizePage → enrichFeaturedImages (obojí pole zachovává spreadem).
  const enrichedPage = enrichedPageArr[0] as Page
  enrichedPage.articles = enrichedArticles
  enrichedPage.children = { docs: enrichedChildren }
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
  commentedAt?: string | null
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

  // Řadíme v JS podle EFEKTIVNÍHO času `commentedAt ?? createdAt` (commentedAt je
  // jen legacy a může být null; nové komentáře ho mají, ale display i tak fallbackuje
  // na createdAt), s `id` jako rozhodčím. DB `sort: 'commentedAt'` by null hodnoty
  // rozházel a rozbil chronologii, na které staví sestavení vláken níže.
  const effectiveTime = (c: RawComment) => new Date(c.commentedAt ?? c.createdAt ?? 0).getTime()
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
      commentedAt: c.commentedAt ?? c.createdAt ?? null,
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
  // času `commentedAt ?? createdAt` (commentedAt může být null) s `id` jako rozhodčím.
  // Záznam bez hodnocení (nemělo by nastat — kolekce ho u recenze vynucuje) se
  // VYŘADÍ; fallback na číslo by tiše ukazoval falešné hvězdičky. Stejně
  // přeskakuje null rating i souhrn fetchPageReviewStats níže.
  const effectiveTime = (c: RawComment) => new Date(c.commentedAt ?? c.createdAt ?? 0).getTime()
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
    reviewedAt: c.commentedAt ?? c.createdAt ?? null,
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
  firstName?: string | null
  lastName?: string | null
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
  const labels = items
    .map((b) => b?.label)
    .filter((l): l is string => typeof l === 'string' && l.length > 0)
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
      firstName: true,
      lastName: true,
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
        commentedAt: true,
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

  const commentTime = (c: RawProfileComment) =>
    new Date(c.commentedAt ?? c.createdAt ?? 0).getTime()
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
        reviewedAt: c.commentedAt ?? c.createdAt ?? null,
      })
    } else if (c.type === 'comment') {
      comments.push({
        id: c.id,
        targetTitle: target.title,
        targetHref: target.href,
        body: trimBody(c.body),
        commentedAt: c.commentedAt ?? c.createdAt ?? null,
      })
    }
  }

  return {
    username: user.username ?? username,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
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
  return {
    logo: (data.logo as GlobalFooter['logo']) ?? null,
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
