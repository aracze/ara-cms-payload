import { PageCategory, type Page } from '@/types/payload'

/**
 * Kategorie, které mohou „vlastnit" sekundární menu. Turistický cíl tu ZÁMĚRNĚ
 * není — menu vždy deleguje na nadřazené Místo. Stejně tak článek: visí pod
 * místem a přebírá jeho menu (jen se v něm zvýrazní položka „Články").
 */
export const menuOwnerCategories: PageCategory[] = [PageCategory.Misto_k_navstiveni]

/** Jeden drobeček — název a odkaz na stránku předka. */
export type Breadcrumb = {
  title: string
  href: string
}

/**
 * Drobečková navigace z HIERARCHIE v CMS — ne z URL.
 *
 * Zdrojem je uložené pole `breadcrumbs` (plugin nested-docs), které drží celý
 * řetězec od nejvyšší úrovně po stránku samotnou včetně názvů a funkčních
 * odkazů. Proti skládání z URL má dvě výhody:
 *   1. `includeInChildUrlPaths: false` na drobečky nemá vliv — stránky vynechané
 *      z adresy (např. „Kalifornie" v /usa/san-francisco) v řetězci zůstanou.
 *   2. Je to jedno čtení bez dotazů na každý segment cesty.
 * Plugin řetězec potomkům přepisuje sám (afterChange → resaveChildren), takže se
 * názvy po přejmenování předka nerozjedou.
 *
 * Pravidla řetězce (odsouhlasená s uživatelem):
 *   - začíná ZEMÍ — nejvyšší úroveň (kontinent, rubrika) se vynechává,
 *   - končí PŘÍMÝM RODIČEM: aktuální stránka v drobečcích není, je v `<h1>`,
 *   - `includeSelf: true` použije článek — jeho „aktuální stránkou" je článek
 *     sám, takže místo, pod kterým visí, je v řetězci poslední (stejně jako
 *     u turistického cíle).
 */
export function buildBreadcrumbs(
  page: Pick<Page, 'breadcrumbs'> | null | undefined,
  { includeSelf = false }: { includeSelf?: boolean } = {},
): Breadcrumb[] {
  const chain = page?.breadcrumbs ?? []
  const end = includeSelf ? chain.length : chain.length - 1

  return chain
    .slice(1, Math.max(end, 0))
    .filter((item): item is { label: string; url: string } => !!item?.label && !!item?.url)
    .map((item) => ({ title: item.label, href: item.url }))
}

/**
 * Slugy předků od NEJBLIŽŠÍHO po nejvyšší — vstup pro dědění hodnot po
 * hierarchii (měna, časové pásmo, akční nabídky).
 *
 * Zdrojem je uložený řetězec `breadcrumbs` z CMS, NE prefixy adresy: předci
 * s `includeInChildUrlPaths: false` (kontinenty, skryté regiony jako Karelie
 * nad Kiži) v adrese nejsou, a přitom právě u takového předka může být
 * výjimka — třeba region s jinou měnou než zbytek země.
 *
 * Aktuální stránka je v `breadcrumbs` poslední, proto se odfiltruje.
 */
export function ancestorSlugsNearestFirst(page: Pick<Page, 'breadcrumbs' | 'fullSlug'>): string[] {
  return (page.breadcrumbs ?? [])
    .map((item) => item?.url)
    .filter((url): url is string => typeof url === 'string' && !!url && url !== page.fullSlug)
    .reverse()
}

/**
 * Strukturovaná data drobečkové navigace (schema.org BreadcrumbList) pro
 * vyhledávače — Google z nich ve výsledku hledání kreslí cestu místo nahé URL.
 *
 * Řetězec doplňujeme aktuální stránkou jako poslední položkou (v drobečcích na
 * webu není, protože je v `<h1>`) — Google očekává úplnou cestu včetně cíle.
 * `<` escapujeme na unicode sekvenci, aby název stránky nemohl utéct ze
 * script tagu (stejně jako u touristPointJsonLd).
 */
export function breadcrumbListJsonLd(
  breadcrumbs: Breadcrumb[],
  current: { title: string; href: string },
  siteUrl: string,
): string {
  const items = [...breadcrumbs, current].map((item, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: item.title,
    item: `${siteUrl}${item.href}`,
  }))

  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items,
  }).replace(/</g, '\\u003c')
}
