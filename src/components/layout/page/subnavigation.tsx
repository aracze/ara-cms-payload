import Link from 'next/link'
import { PageChild, PageCategory } from '@/types/payload'

const hiddenCategories: string[] = [PageCategory.Misto_k_navstiveni, PageCategory.Turisticky_cil]

// Categories considered as practical info for active-state highlighting.
const practicalInfoCategories: string[] = [
  PageCategory.Vstupni_podminky,
  PageCategory.Cesta,
  PageCategory.Doprava,
  PageCategory.Mena_a_ceny,
  PageCategory.Zdravi_a_bezpeci,
  PageCategory.Jazyk_a_kultura,
  PageCategory.Jidlo_a_pit,
  PageCategory.Ubytovani,
]

const legacyMenuOrder: PageCategory[] = [
  PageCategory.Mista,
  PageCategory.Vstupni_podminky,
  PageCategory.Cesta,
  PageCategory.Pocasi,
  PageCategory.Doprava,
  PageCategory.Mena_a_ceny,
  PageCategory.Zdravi_a_bezpeci,
  PageCategory.Jazyk_a_kultura,
  PageCategory.Jidlo_a_pit,
  PageCategory.Clanky,
  PageCategory.Prakticke_informace,
  PageCategory.Ubytovani,
]

const getLegacyMenuRank = (pageChild: PageChild): number => {
  if (!pageChild.category) return Number.MAX_SAFE_INTEGER

  const index = legacyMenuOrder.indexOf(pageChild.category as PageCategory)
  return index === -1 ? Number.MAX_SAFE_INTEGER : index
}

export const Subnavigation = ({
  contextTitle,
  contextFullSlug,
  pageChildren,
  rootChildren,
  currentPageFullSlug,
  currentPageCategory,
  isSubPlace,
  hasPlaces,
  hasArticles,
  activeSection,
}: {
  contextTitle: string
  contextFullSlug: string
  pageChildren: PageChild[]
  rootChildren: PageChild[]
  currentPageFullSlug: string
  currentPageCategory?: PageCategory
  isSubPlace: boolean
  hasPlaces?: boolean
  hasArticles?: boolean
  /** Zvýrazní kotevní položku „Místa"/„Články" místo kontextu — použito na stránce článku. */
  activeSection?: 'mista' | 'clanky'
}) => {
  // Když jsme na článku (activeSection nastaveno), nezvýrazňujeme kontext (Chorvatsko),
  // ale příslušnou sekci („Články").
  const isContextActive = !activeSection && currentPageFullSlug === contextFullSlug

  // "Místa"/"Články" scroll to sections that live on the context page. When we're on a
  // sub-page (e.g. Vstupní podmínky), link to the context page + hash so it navigates
  // to the Place (e.g. Chorvatsko) and scrolls to the section.
  const sectionHref = (hash: string) =>
    isContextActive ? `#${hash}` : `${contextFullSlug}#${hash}`
  const itemClass = (active: boolean) =>
    `px-3 py-4 tracking-wide transition-colors border-b-2 ${
      active
        ? 'text-[#287bbb] border-[#287bbb] font-bold'
        : 'text-gray-800 border-transparent hover:text-[#287bbb]'
    }`

  // Filter out hidden categories (Places, Tourist destinations) from menu
  const visibleChildren = pageChildren?.filter((child) => {
    if (child.category && hiddenCategories.includes(child.category)) {
      return false
    }
    // If the context has its own "Praktické informace" child page,
    // we keep it out of the secondary menu.
    if (child.category === PageCategory.Prakticke_informace) {
      return false
    }
    // "Články" se zobrazují jako samostatná kotva (viz hasArticles níže) — dětskou
    // stránku kategorie Články pak z menu skryjeme, ať se položka nezdvojí.
    if (hasArticles && child.category === PageCategory.Clanky) {
      return false
    }
    return true
  })

  const sortedChildren = [...(visibleChildren || [])]
    .map((child, originalIndex) => ({ child, originalIndex }))
    .sort((a, b) => {
      const rankDiff = getLegacyMenuRank(a.child) - getLegacyMenuRank(b.child)
      if (rankDiff !== 0) return rankDiff

      return a.originalIndex - b.originalIndex
    })
    .map(({ child }) => child)

  // If the current menu context already has its own "Praktické informace"
  // child page, we do not need to inject the ancestor/root fallback link.
  const hasOwnPracticalInfoChild = (pageChildren || []).some(
    (child) => child.category === PageCategory.Prakticke_informace,
  )

  // On sub-places (like Dubrovník), find the root's "Praktické informace" page
  // to show as a single collapsed link instead of individual pages.
  const practicalInfoPage =
    isSubPlace && !hasOwnPracticalInfoChild
      ? rootChildren?.find((child) => child.category === PageCategory.Prakticke_informace)
      : null

  // Determine if the current page falls under "practical info" (for highlighting)
  const isCurrentPagePracticalInfo =
    isSubPlace &&
    currentPageCategory &&
    (practicalInfoCategories.includes(currentPageCategory) ||
      currentPageCategory === PageCategory.Prakticke_informace)

  return (
    <nav aria-label="Sekundární navigace" className="bg-white relative z-30">
      {/* Oddělovací linka jen do šířky obsahu (parita se starým webem), ne přes
          celý viewport — proto border na vnitřním kontejneru, ne na <nav>. */}
      <div className="max-w-7xl mx-auto border-b border-gray-100 overflow-x-auto whitespace-nowrap">
        <div className="flex gap-0 justify-center text-xs md:text-base font-semibold font-heading px-4 md:px-12">
          {/* Context page (the Place that owns this menu) */}
          <Link
            href={contextFullSlug}
            aria-current={isContextActive ? 'page' : undefined}
            className={itemClass(isContextActive)}
          >
            {contextTitle}
          </Link>

          {/* Anchor to the context place's "Co vidět" section (on the context page). */}
          {hasPlaces &&
            (isContextActive ? (
              <a
                href="#mista"
                aria-current={activeSection === 'mista' ? true : undefined}
                className={itemClass(activeSection === 'mista')}
              >
                Místa
              </a>
            ) : (
              <Link
                href={sectionHref('mista')}
                aria-current={activeSection === 'mista' ? true : undefined}
                className={itemClass(activeSection === 'mista')}
              >
                Místa
              </Link>
            ))}

          {/* Menu items from the context page's children */}
          {sortedChildren.map((pageChild) => {
            const isActive =
              currentPageFullSlug === pageChild.fullSlug ||
              currentPageFullSlug.startsWith(pageChild.fullSlug + '/')
            return (
              <Link
                key={pageChild.id}
                href={pageChild.fullSlug}
                aria-current={isActive ? 'page' : undefined}
                className={itemClass(isActive)}
              >
                {pageChild.title}
              </Link>
            )
          })}

          {/* On sub-places, show a single "Praktické informace" link from the root */}
          {isSubPlace && practicalInfoPage && (
            <Link
              href={practicalInfoPage.fullSlug}
              aria-current={isCurrentPagePracticalInfo ? 'page' : undefined}
              className={itemClass(!!isCurrentPagePracticalInfo)}
            >
              Praktické informace
            </Link>
          )}

          {/* Anchor to the context place's "Články a cestopisy" section — always last,
              only if the context place has articles. */}
          {hasArticles &&
            (isContextActive ? (
              <a
                href="#clanky"
                aria-current={activeSection === 'clanky' ? true : undefined}
                className={itemClass(activeSection === 'clanky')}
              >
                Články
              </a>
            ) : (
              <Link
                href={sectionHref('clanky')}
                aria-current={activeSection === 'clanky' ? true : undefined}
                className={itemClass(activeSection === 'clanky')}
              >
                Články
              </Link>
            ))}
        </div>
      </div>
    </nav>
  )
}
