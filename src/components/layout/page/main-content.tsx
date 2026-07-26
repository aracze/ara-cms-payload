import React from 'react'
import { PageCategory, PageChild, RichTextRoot } from '@/types/payload'
import Link from 'next/link'
import { Globe, MapPin } from 'lucide-react'
import { LocalTime } from '@/components/features/local-time'
import { GoogleMap } from '@/components/features/google-map'
import { UserAvatar } from '@/components/user-avatar'
import { richTextToHtml } from '@/lib/rich-text-html'
import { websiteHref, websiteLabel } from '@/lib/utils'
import { CollapsiblePageTextWithContributor } from './collapsible-page-text'
import { ArticleAd, AdSenseScript } from '@/components/features/article-ad'

/** Data karty „Praktické informace" v pravém sloupci detailu turistického cíle. */
export interface TouristPointInfo {
  address: string | null
  websiteUrl: string | null
  mapCenter: { lat: number; lng: number } | null
  mapZoom: number
  title: string
  fullSlug: string
}

interface TocItem {
  id: string
  text: string
  level: number
}

function extractHeadings(html: string): TocItem[] {
  const headings: TocItem[] = []
  // Nadpisy mají po renderu atributy (např. id z richTextToHtml) — otevírací
  // tag proto musí povolit i atributy, jinak by TOC zůstalo prázdné.
  // Zachytíme i atributy otevíracího tagu, ať přečteme skutečné `id`, které
  // vygeneroval richTextToHtml (vč. případných -2/-3 u opakovaných nadpisů) —
  // jinak by TOC odkaz nesouhlasil s kotvou v textu.
  const regex = /<(h[23])([^>]*)>(.*?)<\/\1>/gi
  let match
  while ((match = regex.exec(html)) !== null) {
    const level = parseInt(match[1][1], 10)
    const attrs = match[2]
    const text = match[3].replace(/<[^>]+>/g, '').trim()
    const idMatch = attrs.match(/\sid="([^"]*)"/)
    const id =
      idMatch?.[1] ??
      text
        .toLowerCase()
        .replace(/ /g, '-')
        .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\-]/gu, '')
    headings.push({ id, text, level })
  }
  return headings
}

export const MainContent = ({
  text,
  pageChildren = [],
  pageCategory,
  timezone,
  currencyCode,
  exchangeRate,
  pageTitle,
  genitive,
  createdByPublic,
  touristPointInfo = null,
}: {
  text: string | RichTextRoot
  pageChildren: PageChild[]
  pageCategory?: PageCategory
  timezone?: string | null
  currencyCode?: string | null
  exchangeRate?: number | null
  pageTitle?: string | null
  genitive?: string | null
  createdByPublic?: {
    username?: string | null
    firstName?: string | null
    lastName?: string | null
    avatar?: { url?: string | null } | null
  } | null
  /** Karta Praktické informace (jen turistické cíle) — adresa, web, mapa, autor. */
  touristPointInfo?: TouristPointInfo | null
}) => {
  const placeCategories: PageCategory[] = [
    PageCategory.Misto_k_navstiveni,
    PageCategory.Mista,
    PageCategory.Turisticky_cil,
  ]
  const showAktualniInfo = !!pageCategory && placeCategories.includes(pageCategory)
  const textHtml = richTextToHtml(text, { currencyCode, exchangeRate })
  const tocCategories: PageCategory[] = [
    PageCategory.Vstupni_podminky,
    PageCategory.Mena_a_ceny,
    PageCategory.Pocasi,
    PageCategory.Cesta,
    PageCategory.Doprava,
    PageCategory.Zdravi_a_bezpeci,
    PageCategory.Jazyk_a_kultura,
    PageCategory.Jidlo_a_pit,
    PageCategory.Prakticke_informace,
  ]
  const showTableOfContents = !!pageCategory && tocCategories.includes(pageCategory)
  const headings = showTableOfContents ? extractHeadings(textHtml) : []

  const practicalInfoChild = pageChildren.find(
    (c) => c.title === 'Praktické informace' || c.fullSlug.includes('/prakticke-informace'),
  )

  const cleanGenitive = genitive?.replace(/^do\s+/i, '')
  const displayName = cleanGenitive || pageTitle
  // Autora bereme VÝHRADNĚ z veřejného virtuálního pole `createdByPublic` —
  // interní `createdBy` (surová relace na uživatele) se na frontend nevystavuje.
  const author = createdByPublic ?? null
  const authorName =
    author?.username || [author?.firstName, author?.lastName].filter(Boolean).join(' ') || null
  // Surová URL avataru — absolutní i fallback (papoušek) řeší UserAvatar
  // v CollapsiblePageTextWithContributor. Null = bez fotky → papoušek.
  const avatarUrl = author?.avatar?.url ?? null
  const profileHref = author?.username ? `/profil/${author.username}` : null
  const contributor = authorName
    ? {
        name: authorName,
        profileHref,
        avatarUrl,
      }
    : null

  return (
    <main
      id="obsah"
      tabIndex={-1}
      // Turistický cíl: menší spodní odsazení — hned pod obsahem navazuje
      // sekce recenzí a plných 80 px by mezi nimi dělalo zbytečnou díru.
      className={`max-w-7xl mx-auto px-4 pt-12 ${touristPointInfo ? 'pb-6 md:pb-8' : 'pb-12 md:pb-20'} flex flex-col items-stretch lg:flex-row lg:justify-center gap-8 lg:gap-10 focus:outline-none`}
    >
      {/* Main Content — čtecí sloupec jako u článku (viz reading-prose) */}
      <div className="flex-1 min-w-0 lg:max-w-[808px] lg:px-16">
        <CollapsiblePageTextWithContributor
          textHtml={textHtml}
          // Autor se zobrazuje na místech (Místa/Místo k navštívení/Turistický cíl)
          // i na informačních podstránkách (Vstupní podmínky, Měna a ceny, Počasí…)
          // — jako na původním webu. Rubriky a statické stránky autora nemají.
          // Na turistickém cíli se autor přesouvá do karty Praktické informace
          // v pravém sloupci (legacy rozložení), pod textem by byl dvakrát.
          contributor={
            (showAktualniInfo || showTableOfContents) && !touristPointInfo ? contributor : null
          }
          collapsible={pageCategory === PageCategory.Misto_k_navstiveni}
          // Fotky v textu cíle: plná šířka sloupce, ale omezená výška — na výšku
          // orientované fotky by jinak zabraly celou obrazovku.
          proseClassName={touristPointInfo ? 'poi-prose' : undefined}
        />
      </div>

      {/* Sidebar / Info Column */}
      <aside className="w-full lg:w-[340px] shrink-0 flex flex-col gap-12 relative">
        {/* Praktické informace turistického cíle — adresa, web, mapa, autor.
            Vzdušné legacy rozložení: bez rámečku, přes celou šířku sloupce,
            větší modré ikony a velká mapa; autor ve standardní podobě
            (avatar + jméno + „Cestovní průvodce"). */}
        {touristPointInfo &&
          (touristPointInfo.address ||
            touristPointInfo.websiteUrl ||
            touristPointInfo.mapCenter ||
            contributor) && (
            <div className="relative">
              <div className="flex flex-col gap-5">
                {/* Stejná velikost písma jako běžný text stránky (prose 18 px;
                    20 px má jen úvodní „lead" odstavec) — postranní informace
                    jsou plnohodnotný obsah, ne popisek. */}
                {touristPointInfo.address && (
                  <span className="flex items-start gap-3.5 text-[18px] leading-relaxed text-[#4a4a4a]">
                    <MapPin
                      aria-hidden="true"
                      className="mt-[5px] h-[20px] w-[20px] shrink-0 text-[#215491]"
                      strokeWidth={2}
                    />
                    {touristPointInfo.address}
                  </span>
                )}
                {touristPointInfo.websiteUrl && (
                  <a
                    href={websiteHref(touristPointInfo.websiteUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3.5 text-[18px] font-semibold leading-relaxed text-[#215491] hover:underline"
                  >
                    <Globe
                      aria-hidden="true"
                      className="mt-[5px] h-[20px] w-[20px] shrink-0 text-[#215491]"
                      strokeWidth={2}
                    />
                    {websiteLabel(touristPointInfo.websiteUrl)}
                  </a>
                )}

                {touristPointInfo.mapCenter && (
                  <div className="mt-2">
                    <GoogleMap
                      markers={[
                        {
                          id: 'cil',
                          title: touristPointInfo.title,
                          fullSlug: touristPointInfo.fullSlug,
                          lat: touristPointInfo.mapCenter.lat,
                          lng: touristPointInfo.mapCenter.lng,
                        },
                      ]}
                      centerLat={touristPointInfo.mapCenter.lat}
                      centerLng={touristPointInfo.mapCenter.lng}
                      zoom={touristPointInfo.mapZoom}
                      height="420px"
                    />
                  </div>
                )}

                {contributor && (
                  <div className="mt-1 flex items-start">
                    <div className="mr-[15px] shrink-0">
                      {contributor.profileHref ? (
                        <Link href={contributor.profileHref} className="block">
                          <UserAvatar
                            name={contributor.name}
                            avatarUrl={contributor.avatarUrl}
                            size={40}
                          />
                        </Link>
                      ) : (
                        <UserAvatar
                          name={contributor.name}
                          avatarUrl={contributor.avatarUrl}
                          size={40}
                        />
                      )}
                    </div>
                    <div className="inline-block pt-[3px]">
                      <div className="block text-[12px] leading-[20.4px] text-[#565656]">
                        {contributor.profileHref ? (
                          <Link
                            href={contributor.profileHref}
                            className="font-semibold text-[#565656] no-underline hover:underline"
                          >
                            {contributor.name}
                          </Link>
                        ) : (
                          <span className="font-semibold">{contributor.name}</span>
                        )}
                      </div>
                      <div className="block text-[12px] leading-[20.4px] text-[#898e95]">
                        Cestovní průvodce
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        {/* Time, Exchange & Practical Info — for place-type pages */}
        {showAktualniInfo && (timezone || exchangeRate || practicalInfoChild) && (
          <div className="relative">
            {/* Vertical line (shortened) — mezi textem a panelem */}
            <div className="absolute -left-[30px] top-[20%] h-[70%] w-px bg-[#e4e4e4]" />

            <div className="text-center bg-white py-4 px-0">
              {/* Section 1: Time and Exchange Rate */}
              {(timezone || exchangeRate) && (
                <div className="mb-6">
                  <h2 className="text-[20px] font-bold text-[#1a3f6c] mb-4">
                    {timezone && exchangeRate
                      ? 'Aktuální čas a kurz měny'
                      : exchangeRate
                        ? 'Aktuální měnový kurz'
                        : 'Aktuální čas'}
                  </h2>
                  {timezone && (
                    <>
                      <LocalTime timezone={timezone} />
                      {exchangeRate && (
                        <div className="w-[250px] mx-auto border-b border-[#e4e4e4] mt-4 mb-4" />
                      )}
                    </>
                  )}
                  {exchangeRate && currencyCode && (
                    <div className="block text-[26px] tracking-[0.01rem] text-[#333] mt-4">
                      {practicalInfoChild ? (
                        <Link
                          href={`${practicalInfoChild.fullSlug}#mena-a-ceny`}
                          className="hover:no-underline"
                        >
                          1 {currencyCode} ={' '}
                          {exchangeRate.toLocaleString('cs-CZ', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{' '}
                          CZK
                        </Link>
                      ) : (
                        <span>
                          1 {currencyCode} ={' '}
                          {exchangeRate.toLocaleString('cs-CZ', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{' '}
                          CZK
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Section 2: Practical Info */}
              {practicalInfoChild && pageTitle && (
                <Link
                  href={practicalInfoChild.fullSlug}
                  className="block hover:no-underline group relative mt-6 pt-4"
                >
                  <h2 className="text-[22px] font-bold text-[#1a3f6c] mb-6 group-hover:underline leading-tight">
                    Praktické informace <br />
                    do {displayName}
                  </h2>
                  <div className="relative inline-block w-full">
                    <div className="absolute top-1/2 -translate-y-1/2 left-[calc(50%+70px)] w-[55px] h-[55px] bg-[url('/assets/information/essentials-gray.gif')] bg-no-repeat bg-contain opacity-20 z-0" />
                    <div className="relative z-10 text-[18px] text-[#888] leading-[1.5]">
                      <p className="m-0">
                        Praktické cestovní informace <br />
                        při cestě do {displayName}
                      </p>
                    </div>
                  </div>
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Obsah (TOC) + reklama ve společném sticky bloku (jako u článku) —
            jen na praktických informacích. Sticky společně, ať se nepřekrývají. */}
        {showTableOfContents && (
          <div className="hidden lg:block sticky top-5">
            {headings.length > 0 && (
              <nav aria-label="Obsah stránky">
                <ul>
                  {headings.map((heading) => (
                    <li key={heading.id}>
                      <a
                        href={`#${heading.id}`}
                        className={`block py-4 border-b border-[#e4e4e4] transition-colors duration-300 hover:text-black no-underline ${
                          heading.level === 2
                            ? 'font-semibold text-gray-800/85'
                            : 'font-normal text-gray-800/65'
                        }`}
                      >
                        {heading.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
            <div className={headings.length > 0 ? 'mt-12' : ''}>
              <AdSenseScript />
              <ArticleAd variant="primary" />
            </div>
          </div>
        )}
      </aside>
    </main>
  )
}
