import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  GlobalAfterChangeHook,
} from 'payload'

/**
 * Okamžitá invalidace cache webu při změně obsahu v adminu.
 *
 * Web běží ve stejné Next.js aplikaci a čte data přes Local API s
 * `unstable_cache` + tagy (viz src/lib/payload.ts a src/lib/search.ts).
 * Tyto hooky po uložení/smazání dokumentu zavolají `revalidateTag`, takže
 * změna je na webu vidět hned — žádné čekání na vypršení cache, žádné webhooky.
 */

// `next/cache` se importuje LÍNĚ a s explicitní příponou `.js`. Tento modul se
// přes externalizovaný Payload config (serverExternalPackages: ['payload', …] +
// devBundleServerPackages: false) načítá nativním Node ESM loaderem, a ten u
// balíčku bez `exports` mapy (next) neumí dořešit bezpříponový `next/cache`
// → ERR_MODULE_NOT_FOUND. `next/cache.js` je fyzický soubor, který se resolvne
// nativně i přes bundler. Líné načtení navíc znamená, že mimo Next runtime
// (payload CLI, skripty jako generate:types) se `next/cache` vůbec nesáhne.
const safeRevalidate = async (tags: string[]) => {
  try {
    const { revalidateTag } = await import('next/cache.js')
    // expire: 0 → tag se zneplatní okamžitě. (updateTag je v Next 16 jen pro
    // Server Actions; z Payload hooku by vyhodil chybu a invalidace by se ztratila.)
    for (const tag of tags) revalidateTag(tag, { expire: 0 })
  } catch {
    /* mimo Next runtime */
  }
}

type PageLikeDoc = {
  fullSlug?: string | null
  breadcrumbs?: { url?: string | null }[] | null
}

/** Tagy stránky + všech jejích předků (jejich seznamy dětí se mění s ní). */
const pageTags = (doc: PageLikeDoc | undefined | null): string[] => {
  if (!doc) return []
  const tags: string[] = []
  if (typeof doc.fullSlug === 'string' && doc.fullSlug) {
    tags.push('page_' + doc.fullSlug, 'page_' + doc.fullSlug + '_articles')
  }
  if (Array.isArray(doc.breadcrumbs)) {
    for (const crumb of doc.breadcrumbs) {
      if (typeof crumb?.url === 'string' && crumb.url) {
        tags.push('page_' + crumb.url, 'page_' + crumb.url + '_articles')
      }
    }
  }
  return tags
}

export const revalidatePageAfterChange: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
}) => {
  await safeRevalidate([
    'pages',
    'root_pages',
    'sitemap',
    'search-index',
    ...pageTags(doc as PageLikeDoc),
    ...pageTags(previousDoc as PageLikeDoc),
  ])
  return doc
}

export const revalidatePageAfterDelete: CollectionAfterDeleteHook = async ({ doc }) => {
  await safeRevalidate([
    'pages',
    'root_pages',
    'sitemap',
    'search-index',
    ...pageTags(doc as PageLikeDoc),
  ])
  return doc
}

type ArticleLikeDoc = {
  slug?: string | null
  mainPage?: number | string | { fullSlug?: string | null } | null
  pages?: (number | string | { fullSlug?: string | null })[] | null
}

/** Tagy stránek, na kterých se článek zobrazuje (mainPage + pages). */
const articlePageTags = (doc: ArticleLikeDoc | undefined | null): string[] => {
  if (!doc) return []
  const tags: string[] = []
  if (typeof doc.slug === 'string' && doc.slug) tags.push('article_' + doc.slug)
  const related = [doc.mainPage, ...(Array.isArray(doc.pages) ? doc.pages : [])]
  for (const rel of related) {
    if (rel && typeof rel === 'object' && typeof rel.fullSlug === 'string' && rel.fullSlug) {
      tags.push('page_' + rel.fullSlug, 'page_' + rel.fullSlug + '_articles')
    }
  }
  return tags
}

export const revalidateArticleAfterChange: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
}) => {
  await safeRevalidate([
    'articles',
    'sitemap',
    // Relace mohou být jen id (bez fullSlug) — pak spadne invalidace na
    // obecný tag 'pages' (jistota správnosti nad mikro-optimalizací).
    'pages',
    ...articlePageTags(doc as ArticleLikeDoc),
    ...articlePageTags(previousDoc as ArticleLikeDoc),
  ])
  return doc
}

export const revalidateArticleAfterDelete: CollectionAfterDeleteHook = async ({ doc }) => {
  await safeRevalidate(['articles', 'sitemap', 'pages', ...articlePageTags(doc as ArticleLikeDoc)])
  return doc
}

/** Globals (header, homepage, footer) ovlivňují layout všech stránek. */
export const revalidateGlobalsAfterChange: GlobalAfterChangeHook = async ({ doc }) => {
  await safeRevalidate(['root_pages', 'footer'])
  return doc
}

type CommentLikeDoc = {
  relatedTo?: {
    relationTo?: string | null
    value?: number | string | { id?: number | string } | null
  } | null
}

/** Tag výpisu komentářů/recenzí cíle (článek / stránka), na který komentář míří. */
const commentTargetTags = (doc: CommentLikeDoc | undefined | null): string[] => {
  const rel = doc?.relatedTo
  if (!rel || typeof rel !== 'object') return []
  const value = typeof rel.value === 'object' && rel.value ? rel.value.id : rel.value
  if (value == null) return []
  if (rel.relationTo === 'articles') return ['article_comments_' + value]
  if (rel.relationTo === 'pages') return ['page_reviews_' + value]
  return []
}

// Nový/upravený komentář (vč. veřejného vložení přes Local API a označení spam
// v adminu) invaliduje výpis komentářů daného cíle. `previousDoc` pokrývá přesun
// komentáře na jiný cíl.
export const revalidateCommentAfterChange: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
}) => {
  await safeRevalidate([
    'comments',
    ...commentTargetTags(doc as CommentLikeDoc),
    ...commentTargetTags(previousDoc as CommentLikeDoc),
  ])
  return doc
}

export const revalidateCommentAfterDelete: CollectionAfterDeleteHook = async ({ doc }) => {
  await safeRevalidate(['comments', ...commentTargetTags(doc as CommentLikeDoc)])
  return doc
}

type UserLikeDoc = { username?: string | null }

/** Tag veřejného profilu uživatele (/profil/<username>). */
const userProfileTags = (doc: UserLikeDoc | undefined | null): string[] =>
  typeof doc?.username === 'string' && doc.username ? ['user_profile_' + doc.username] : []

// Změna uživatele (popis, avatar, jméno…) invaliduje jeho veřejný profil.
// `previousDoc` pokrývá přejmenování username (starý profil zmizí z cache).
// Pozn.: hook se spouští i při auth operacích (loginAttempts…) — invalidace
// je levná, přesnější filtrování by za tu složitost nestálo.
export const revalidateUserAfterChange: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
}) => {
  await safeRevalidate([
    'users',
    ...userProfileTags(doc as UserLikeDoc),
    ...userProfileTags(previousDoc as UserLikeDoc),
  ])
  return doc
}

export const revalidateUserAfterDelete: CollectionAfterDeleteHook = async ({ doc }) => {
  await safeRevalidate(['users', ...userProfileTags(doc as UserLikeDoc)])
  return doc
}
