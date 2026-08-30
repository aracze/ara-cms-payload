/**
 * Generátory SEO polí pro admin (plugin-seo, tlačítka „Vygenerovat" u titulku
 * a popisku). Dávají návrh podle kategorie stránky ve znění starého webu —
 * stejné šablony (src/lib/seo-templates.ts), jaké web použije, když pole
 * zůstane prázdné. Editor tak vidí, co by web dal sám, a může to jen doladit.
 */
import type { PayloadRequest } from 'payload'
import { PageCategory } from '@/types/payload'
import { richTextToPlainText } from '@/lib/utils'
import { SITE_NAME, truncateDescription } from '@/lib/seo'
import {
  leadSentence,
  seoDescriptionTemplate,
  seoTitleTemplate,
  type SeoPageLike,
  type SeoPlaceLike,
} from '@/lib/seo-templates'

/** Surový dokument z adminu (stránka i článek) — jen pole, která generátory čtou. */
export type SeoAdminDoc = SeoPageLike & {
  text?: unknown
  parent?: number | string | { id: number | string } | null
}

/** Hloubka hierarchie, po kterou hledáme nadřazené místo (kontinent → země → region → město → cíl). */
const MAX_PARENT_DEPTH = 6

/**
 * Místo, ke kterému stránka patří: sama (je-li místem), jinak nejbližší
 * nadřazené „Místo k navštívení" po řetězci `parent`. Bez nalezeného místa
 * první rodič (aspoň název), úplně bez rodiče stránka sama. U místa navíc
 * říká, zda leží v jiném místě (město v zemi → legacy šablona „Město").
 */
async function resolvePlaceForAdmin(
  doc: SeoAdminDoc,
  req: PayloadRequest,
): Promise<{ place: SeoPlaceLike; placeHasParentPlace: boolean }> {
  const isPlace = doc.category === PageCategory.Misto_k_navstiveni

  let parentId = relationIdOf(doc.parent)
  let firstParent: SeoPlaceLike | null = null
  for (let depth = 0; parentId != null && depth < MAX_PARENT_DEPTH; depth++) {
    const parent = (await req.payload.findByID({
      collection: 'pages',
      id: parentId,
      depth: 0,
      select: { title: true, category: true, detail: true, parent: true },
      req,
      // Práva přihlášeného editora, ne admin obejití (pravidlo Local API).
      overrideAccess: false,
    })) as unknown as SeoAdminDoc | null
    if (!parent) break
    firstParent ??= parent
    if (parent.category === PageCategory.Misto_k_navstiveni) {
      // Kontinent je taky „Místo k navštívení", ale bez rodiče a v URL skrytý —
      // země pod ním je „Stát", ne „Město" (stejně to vidí web z URL předků).
      const parentIsContinent = relationIdOf(parent.parent) == null
      return isPlace
        ? { place: doc, placeHasParentPlace: !parentIsContinent }
        : { place: parent, placeHasParentPlace: false }
    }
    parentId = relationIdOf(parent.parent)
  }
  return { place: isPlace ? doc : (firstParent ?? doc), placeHasParentPlace: false }
}

function relationIdOf(value: SeoAdminDoc['parent']): number | string | null {
  if (value == null) return null
  return typeof value === 'object' ? value.id : value
}

export async function generateSeoTitle(
  doc: SeoAdminDoc,
  collectionSlug: string | undefined,
  req: PayloadRequest,
): Promise<string> {
  const base =
    collectionSlug === 'pages'
      ? (seoTitleTemplate(doc, (await resolvePlaceForAdmin(doc, req)).place) ?? doc.title)
      : doc.title
  return `${base || ''} | ${SITE_NAME}`.trim()
}

export async function generateSeoDescription(
  doc: SeoAdminDoc,
  collectionSlug: string | undefined,
  req: PayloadRequest,
): Promise<string> {
  const plain = richTextToPlainText(doc.text)
  if (collectionSlug === 'pages') {
    const { place, placeHasParentPlace } = await resolvePlaceForAdmin(doc, req)
    const templated = seoDescriptionTemplate(doc, place, leadSentence(plain), {
      placeHasParentPlace,
    })
    if (templated) return templated
  }
  return plain ? truncateDescription(plain) : ''
}
