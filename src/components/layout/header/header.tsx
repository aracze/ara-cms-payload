'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Menu, X, ChevronDown } from 'lucide-react'
import { ImageLink, PageCategory } from '@/types/payload'
import { isCloudinary } from '@/lib/cloudinary-loader'
import Search from '@/components/features/search/search'
import { HeaderAccount } from '@/components/features/auth/header-account'
import type { CurrentUser } from '@/lib/auth'

const CONTINENT_ORDER = ['Evropa', 'Amerika', 'Asie', 'Afrika', 'Austrálie']

// Header je client komponenta → cokoli mu předáme se serializuje do RSC payloadu
// na KAŽDÉ stránce. Proto přijímá jen navigační podmnožinu (bez `text`, `meta`,
// `detail`, `featuredImage`, `articles` a bez vnoření hlouběji než přímé děti),
// jinak by se do HTML zdroje propsala plná těla všech stránek i článků.
export type NavPage = {
  id: number | string
  title: string
  fullSlug: string
  category: PageCategory
  children?: {
    docs: { id: number | string; title: string; fullSlug: string }[]
  }
}

export function Header({
  pages,
  headerLogo,
  logoSvgHtml,
  user,
  turnstileSiteKey,
}: {
  pages: NavPage[]
  headerLogo?: ImageLink | null
  /** Předsanitizované SVG loga (na serveru přes `sanitizeHeaderLogoSvg`). */
  logoSvgHtml?: string | null
  /**
   * Přihlášený uživatel (bezpečná podmnožina polí z `getCurrentUser`), nebo
   * null. Zjišťuje ho SERVER v layoutu — hlavička je klientská komponenta
   * a sama by se na to zeptat nemohla.
   */
  user?: CurrentUser | null
  /** Veřejný klíč Turnstile pro formuláře v přihlašovacím okně. */
  turnstileSiteKey?: string | null
}) {
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null)
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Mobilní menu (do `md` breakpointu). Vlastní stav nezávislý na desktop mega menu.
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobileExpandedId, setMobileExpandedId] = useState<string | null>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const mobilePanelRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  const closeMobileMenu = () => {
    setMobileOpen(false)
    menuButtonRef.current?.focus()
  }

  // Přechod na jinou stránku menu zavře. Použijeme doporučený vzor React „úprava
  // stavu při renderu" (sledování předchozí cesty přes stav) — bez setState v
  // effectu (kaskádové rendery) i bez sahání na ref během renderu.
  const [prevPathname, setPrevPathname] = useState(pathname)
  if (prevPathname !== pathname) {
    setPrevPathname(pathname)
    setMobileOpen(false)
    setMobileExpandedId(null)
  }

  // Otevřené menu: přesun fokusu dovnitř, Escape zavírá + vrací fokus na tlačítko,
  // Tab drží fokus v panelu (focus trap) a scroll pozadí zamkneme.
  useEffect(() => {
    if (!mobileOpen) return

    const focusables = () =>
      Array.from(
        mobilePanelRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ??
          [],
      )

    focusables()[0]?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setMobileOpen(false)
        menuButtonRef.current?.focus()
        return
      }
      if (e.key === 'Tab') {
        const items = focusables()
        if (items.length === 0) return
        const first = items[0]
        const last = items[items.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    // Když se okno dostane na desktop breakpoint (lg = 1024px), menu zavřeme —
    // jinak `lg:hidden` skryje panel i hamburger, ale mobileOpen zůstane true
    // a body by zůstalo zamčené proti scrollování (resize/otočení displeje).
    const desktopMq = window.matchMedia('(min-width: 1024px)')
    const handleBreakpoint = () => {
      if (desktopMq.matches) setMobileOpen(false)
    }
    desktopMq.addEventListener('change', handleBreakpoint)

    document.addEventListener('keydown', onKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      desktopMq.removeEventListener('change', handleBreakpoint)
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [mobileOpen])

  const handleMouseEnter = (pageId: string) => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
    setActiveDropdown(pageId)
  }

  const handleMouseLeave = () => {
    closeTimeoutRef.current = setTimeout(() => {
      setActiveDropdown(null)
    }, 150)
  }

  const logo = headerLogo

  // Najdeme aktuálně aktivní stránku pro mega menu
  const activePage = pages?.find((p) => String(p.id) === activeDropdown)

  // Filtr + řazení navigace závisí jen na `pages` (neměnné mezi rendery při hoveru
  // menu). Memoizujeme, ať se přeskupení nepočítá při každém otevření dropdownu.
  // Kontinenty v pevném pořadí, zbytek abecedně česky. Sdílíme mezi desktopem
  // a mobilním menu.
  const sortedNavPages = useMemo(() => {
    const navPages = (pages || []).filter((p) => p.category === PageCategory.Misto_k_navstiveni)
    return navPages.sort((a, b) => {
      const indexA = CONTINENT_ORDER.indexOf(a.title)
      const indexB = CONTINENT_ORDER.indexOf(b.title)

      if (indexA !== -1 && indexB !== -1) return indexA - indexB
      if (indexA !== -1) return -1
      if (indexB !== -1) return 1

      return a.title.localeCompare(b.title, 'cs')
    })
  }, [pages])

  // Aktivní stránka v mobilním menu (a11y: aria-current + vizuální akcent).
  const normalizePath = (path: string) => path.replace(/\/+$/, '') || '/'
  const currentPath = normalizePath(pathname || '/')
  const isActivePath = (slug: string) => normalizePath(slug) === currentPath
  const isAncestorPath = (slug: string) => {
    const base = normalizePath(slug)
    return currentPath === base || currentPath.startsWith(`${base}/`)
  }

  return (
    <header
      onBlur={(e) => {
        // Zavřeme dropdown jen když fokus opustil celou hlavičku — přesun mezi
        // položkami/submenu uvnitř necháváme otevřený (přístupnost klávesnicí).
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current)
          setActiveDropdown(null)
        }
      }}
      className={`absolute top-0 left-0 w-full z-[200] transition-colors duration-300 ${
        activeDropdown || mobileOpen ? 'bg-[#215491]' : 'bg-transparent'
      } group/header`}
    >
      <div
        className={`absolute inset-0 h-[65px] bg-gradient-to-b from-black/50 to-transparent z-[-1] transition-opacity duration-300 ${
          activeDropdown || mobileOpen ? 'opacity-0' : 'opacity-100'
        }`}
      />

      <nav aria-label="Hlavní navigace" className="h-[65px] flex items-center">
        <div className="max-w-7xl mx-auto px-4 md:px-12 flex items-center w-full gap-8">
          {logo && (
            <Link href="/" className="flex items-center shrink-0">
              {logoSvgHtml ? (
                <div
                  className="h-[26px] w-auto flex items-center [&_svg]:h-[26px] [&_svg]:w-auto"
                  // Už sanitizované na serveru (sanitizeHeaderLogoSvg) — proto se
                  // DOMPurify nemusí bundlovat do klienta.
                  dangerouslySetInnerHTML={{ __html: logoSvgHtml }}
                />
              ) : (
                logo.image?.url && (
                  <Image
                    src={new URL(
                      logo.image.url,
                      process.env.NEXT_PUBLIC_PAYLOAD_BASE_URL || 'http://localhost:3000',
                    ).toString()}
                    alt={logo.image.alternativeText || 'Logo'}
                    width={132}
                    height={26}
                    className="h-[26px] w-auto object-contain"
                    unoptimized={!isCloudinary(String(logo.image.url))}
                  />
                )
              )}
            </Link>
          )}

          {/* Počítačové menu až od lg (1024 px): s lupou, „Rady na cestu" a účtem
              potřebuje ~875+ px, takže na md šířkách (768–1023) přetékalo o ~55 px
              za okraj okna. Pod lg jede mobilní hlavička s hamburgerem, která je
              na dotykových tabletech stejně pohodlnější. Stejnou hranici hlídá
              i matchMedia výš a „Rady na cestu" ji měla už dřív. */}
          <div className="hidden lg:flex items-center gap-0 h-full text-white/90 font-semibold">
            {sortedNavPages.map((page, index) => {
              const hasChildren = (page.children?.docs?.length ?? 0) > 0
              const pageId = page.id || `temp-id-${index}`
              return (
                <div
                  key={pageId}
                  className="h-[65px] flex items-center"
                  onMouseEnter={() => hasChildren && handleMouseEnter(String(pageId))}
                  onMouseLeave={handleMouseLeave}
                  onFocus={() => hasChildren && handleMouseEnter(String(pageId))}
                >
                  <Link
                    href={page.fullSlug}
                    onClick={() => setActiveDropdown(null)}
                    aria-haspopup={hasChildren || undefined}
                    aria-expanded={hasChildren ? activeDropdown === String(pageId) : undefined}
                    className="px-5 text-white hover:text-gray-100 transition-colors tracking-wide text-[15px] font-semibold font-heading flex items-center gap-1 whitespace-nowrap"
                  >
                    {page.title}
                    {hasChildren && (
                      <span className="inline-block border-white hover:border-gray-100 border-t-4 border-l-4 border-r-4 border-l-transparent border-r-transparent border-white/60" />
                    )}
                  </Link>
                </div>
              )
            })}
          </div>

          <div className="ml-auto flex items-center gap-4">
            <Search />
            <Link
              href="/rady-na-cestu"
              className="hidden lg:block px-5 py-1.5 border-2 border-white/50 rounded-full text-white text-[13px] font-bold hover:bg-white hover:text-[#215491] transition-all uppercase tracking-wider font-heading whitespace-nowrap"
            >
              Rady na cestu
            </Link>
            {/* Účet: papoušek (nepřihlášen) / avatar s menu (přihlášen). */}
            <HeaderAccount user={user ?? null} turnstileSiteKey={turnstileSiteKey ?? null} />
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? 'Zavřít menu' : 'Otevřít menu'}
              aria-expanded={mobileOpen}
              aria-controls="mobile-menu"
              className="lg:hidden -mr-2 inline-flex h-11 w-11 items-center justify-center rounded-md text-white [touch-action:manipulation] [-webkit-tap-highlight-color:transparent] hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            >
              {mobileOpen ? (
                <X className="h-6 w-6" aria-hidden="true" />
              ) : (
                <Menu className="h-6 w-6" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* Mega Menu - Vykresleno pouze jednou mimo loop pro čistší DOM a lepší pozicování */}
      {activePage && (activePage.children?.docs?.length ?? 0) > 0 && (
        <div
          // `hidden lg:block`: dropdown se otevírá jen z počítačového menu, ale
          // stav `activeDropdown` může přežít zmenšení okna pod lg — panel by
          // pak visel nad mobilní hlavičkou bez menu, které ho otevřelo.
          className="hidden lg:block absolute left-0 right-0 w-full bg-[#215490] border-b-2 border-[#1A4579] shadow-2xl transition-all duration-300 top-[65px] z-[150] pointer-events-auto animate-in fade-in slide-in-from-top-1 duration-200"
          onMouseEnter={() => handleMouseEnter(String(activePage.id))}
          onMouseLeave={handleMouseLeave}
        >
          <div className="bg-white py-2">
            <div className="max-w-7xl mx-auto px-4 md:px-12 py-4">
              <div className="grid grid-cols-6 gap-y-1 gap-x-8">
                {[...(activePage.children?.docs || [])]
                  .sort((a, b) => a.title.localeCompare(b.title, 'cs'))
                  .map((child, index) => (
                    <Link
                      key={child.id || `child-${index}`}
                      href={child.fullSlug}
                      onClick={() => setActiveDropdown(null)}
                      className="text-[14px] text-gray-800 py-1 px-3 -mx-3 transition-all inline-block w-full [text-shadow:1px_2px_3px_rgb(255,255,255)] hover:text-white hover:bg-[#3C6EAA] hover:rounded-sm hover:no-underline hover:shadow-none hover:[text-shadow:none]"
                    >
                      {child.title}
                    </Link>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobilní menu (do `md`) — backdrop + rozbalovací panel s accordionem. */}
      {mobileOpen && (
        <div className="lg:hidden">
          <button
            type="button"
            aria-label="Zavřít menu"
            tabIndex={-1}
            onClick={closeMobileMenu}
            className="fixed top-[65px] right-0 bottom-0 left-0 z-[140] bg-black/50 animate-in fade-in duration-200 motion-reduce:animate-none"
          />
          {/* Vysouvací panel zprava (drawer) – omezená šířka, ať nepůsobí prázdně
              na širších mobilech; safe-area insety kvůli výřezům/„home" liště. */}
          <div
            id="mobile-menu"
            ref={mobilePanelRef}
            className="fixed top-[65px] right-0 bottom-0 z-[150] w-[85%] max-w-sm overflow-y-auto overscroll-contain bg-[#215491] text-white shadow-2xl animate-in slide-in-from-right duration-200 motion-reduce:animate-none [padding-bottom:env(safe-area-inset-bottom)] [padding-right:env(safe-area-inset-right)]"
          >
            <nav aria-label="Mobilní navigace" className="py-2">
              <ul className="flex flex-col divide-y divide-white/10">
                {sortedNavPages.map((page, index) => {
                  const hasChildren = (page.children?.docs?.length ?? 0) > 0
                  const pageId = String(page.id || `temp-id-${index}`)
                  const expanded = mobileExpandedId === pageId
                  const active = isActivePath(page.fullSlug)
                  const inSection = isAncestorPath(page.fullSlug)
                  return (
                    <li key={pageId}>
                      <div
                        className={`relative flex items-center transition-colors duration-150 motion-reduce:transition-none hover:bg-white/5 active:bg-white/10 ${
                          expanded ? 'sticky top-0 z-10 bg-[#215491] shadow-md' : ''
                        }`}
                      >
                        {/* Vizuální akcent pro aktivní stránku / aktivní sekci. */}
                        {(active || inSection) && (
                          <span
                            aria-hidden="true"
                            className="absolute top-1/2 left-0 h-6 w-1 -translate-y-1/2 rounded-r bg-white"
                          />
                        )}
                        <Link
                          href={page.fullSlug}
                          onClick={() => setMobileOpen(false)}
                          aria-current={active ? 'page' : undefined}
                          className={`flex-1 px-4 py-3.5 font-heading text-[16px] font-semibold [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:outline-none focus-visible:ring-inset ${
                            active ? 'text-white' : 'text-white/90'
                          }`}
                        >
                          {page.title}
                        </Link>
                        {hasChildren && (
                          <button
                            type="button"
                            onClick={() => setMobileExpandedId(expanded ? null : pageId)}
                            aria-expanded={expanded}
                            aria-controls={`mobile-submenu-${pageId}`}
                            aria-label={
                              expanded ? `Sbalit ${page.title}` : `Rozbalit ${page.title}`
                            }
                            className="mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-white [touch-action:manipulation] [-webkit-tap-highlight-color:transparent] hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:outline-none"
                          >
                            <ChevronDown
                              className={`h-5 w-5 transition-transform duration-200 motion-reduce:transition-none ${
                                expanded ? 'rotate-180' : ''
                              }`}
                              aria-hidden="true"
                            />
                          </button>
                        )}
                      </div>
                      {hasChildren && expanded && (
                        <ul
                          id={`mobile-submenu-${pageId}`}
                          className="mt-1 mb-2 ml-6 border-l border-white/15"
                        >
                          {[...(page.children?.docs || [])]
                            .sort((a, b) => a.title.localeCompare(b.title, 'cs'))
                            .map((child, ci) => {
                              const childActive = isActivePath(child.fullSlug)
                              return (
                                <li key={child.id || `child-${ci}`}>
                                  <Link
                                    href={child.fullSlug}
                                    onClick={() => setMobileOpen(false)}
                                    aria-current={childActive ? 'page' : undefined}
                                    className={`block py-2.5 pr-4 pl-4 text-[15px] transition-colors duration-150 [-webkit-tap-highlight-color:transparent] hover:bg-white/5 active:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:outline-none focus-visible:ring-inset motion-reduce:transition-none ${
                                      childActive
                                        ? 'font-semibold text-white'
                                        : 'text-white/85 hover:text-white'
                                    }`}
                                  >
                                    {child.title}
                                  </Link>
                                </li>
                              )
                            })}
                        </ul>
                      )}
                    </li>
                  )
                })}
                <li className="px-4 pt-3 pb-2">
                  <Link
                    href="/rady-na-cestu"
                    onClick={() => setMobileOpen(false)}
                    aria-current={isActivePath('/rady-na-cestu') ? 'page' : undefined}
                    className="block rounded-full border-2 border-white/50 py-2.5 text-center font-heading text-[13px] font-bold tracking-wider text-white uppercase transition-colors duration-150 [-webkit-tap-highlight-color:transparent] hover:bg-white hover:text-[#215491] focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:outline-none motion-reduce:transition-none"
                  >
                    Rady na cestu
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
        </div>
      )}
    </header>
  )
}
