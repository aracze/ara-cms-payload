import { fetchPageLightByFullSlug } from '@/lib/payload'
import type { Breadcrumb } from '@/lib/page-hierarchy'
import type { Page as PayloadPage } from '@/types/payload'

/** Předek, který v CMS chybí — dopočítaný ze slugu, ať se řetězec neutrhne. */
type AncestorPlaceholder = {
  title: string
  fullSlug: string
  category?: never
  isPlaceholder: true
}

export type Ancestor = PayloadPage | AncestorPlaceholder

/**
 * Předci odvození z ADRESY (postupné prefixy `fullSlug`).
 *
 * Používá se pro menu kontext, kořenovou stránku a jako POJISTKA drobečků, když
 * stránce chybí uložený řetězec `breadcrumbs` (starý import bez resave). Hlavní
 * cesta drobečků jde po hierarchii v CMS — viz `buildBreadcrumbs`; z adresy se
 * skryté stránky (např. „Kalifornie") dopočítat nedají.
 *
 * Když předek v CMS chybí, vrací se zástupný záznam ze slugu, aby řetězec
 * zůstal celý.
 */
export async function fetchAncestorChain(fullSlug: string): Promise<Ancestor[]> {
  const normalizedSlug = fullSlug.replace(/^\/+|\/+$/g, '')
  if (!normalizedSlug) return []

  const parts = normalizedSlug.split('/')
  const chain: Ancestor[] = []

  // We walk through all segments except the last one (which is the page itself)
  for (let i = 1; i < parts.length; i++) {
    const parentSlug = parts.slice(0, i).join('/')
    // Předky stačí lehce (title/fullSlug/category + děti pro menu), ne celý
    // detail stránky — šetří opakované těžké dotazy při generování.
    const { data } = await fetchPageLightByFullSlug(parentSlug)
    const parentPage = data?.pages?.[0]

    if (parentPage) {
      chain.push(parentPage)
    } else {
      const segment = parts[i - 1]
      const title = segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ')
      chain.push({
        title,
        fullSlug: `/${parentSlug}`,
        isPlaceholder: true,
      })
      console.warn(`[Page] Missing parent page in CMS for slug: ${parentSlug}`)
    }
  }

  return chain
}

/**
 * Drobečky odvozené z adresy — nouzová varianta `buildBreadcrumbs` pro stránky
 * bez uloženého řetězce. Vrací POUZE předky; aktuální stránku (u článku místo,
 * pod kterým visí) si přidává volající.
 */
export async function breadcrumbsFromSlug(fullSlug: string): Promise<Breadcrumb[]> {
  const ancestors = await fetchAncestorChain(fullSlug)
  return ancestors.map((ancestor) => ({
    title: ancestor.title,
    href: ancestor.fullSlug,
  }))
}
