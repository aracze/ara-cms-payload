import React from 'react'
import { PageCategory, RichTextRoot } from '@/types/payload'
import Link from 'next/link'
import { Globe, MapPin } from 'lucide-react'
import { LocalTime } from '@/components/features/local-time'
import { MapLibreMap } from '@/components/features/maplibre-map'
import { UserAvatar } from '@/components/user-avatar'
import { richTextToHtml } from '@/lib/rich-text-html'
import { websiteHref, websiteLabel } from '@/lib/utils'
import { CollapsiblePageTextWithContributor } from './collapsible-page-text'
import { ArticleAd, AdSenseScript } from '@/components/features/article-ad'
import { TocSidebar } from '@/components/features/toc-sidebar'

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

// TOC odkazy jdou do Reactu jako holý text (ne dangerouslySetInnerHTML), takže
// entity z bohatého textu (typicky &nbsp; z pevné mezery) by se jinak zobrazily
// doslova — prohlížeč je dekóduje jen při parsování HTML, ne když je JS nastaví
// jako textContent. Záměrně NEDEKÓDUJE &lt;/&gt; (ani číselné ekvivalenty) —
// výstup by pak mohl obsahovat "<"/">" a jakékoli následné ořezání tagů na
// takovém textu je z podstaty nedokončitelné (CodeQL: incomplete
// multi-character sanitization). Nadpis s literálním "<"/">" je natolik
// okrajový případ, že bezpečnější je ho zobrazit jako "&lt;"/"&gt;".
function decodeHtmlEntities(text: string): string {
  const codePointToChar = (codePoint: number, fallback: string): string => {
    if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return fallback
    if (codePoint === 0x3c || codePoint === 0x3e) return fallback
    return String.fromCodePoint(codePoint)
  }

  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (match, dec) => codePointToChar(Number(dec), match))
    .replace(/&#x([0-9a-fA-F]+);/gi, (match, hex) => codePointToChar(parseInt(hex, 16), match))
    .replace(/&amp;/g, '&')
}

// Jeden průchod `/<[^>]+>/g` může odstraněním jednoho tagu spojit okolní
// text do NOVÉHO tagu, který v původním vstupu vůbec nebyl (klasický
// "incomplete multi-character sanitization" případ) — opakuje se proto do
// ustálení, ne jen jednou.
function stripTags(html: string): string {
  let result = html
  let previous
  do {
    previous = result
    result = previous.replace(/<[^>]+>/g, '')
  } while (result !== previous)
  return result
}

function extractHeadings(html: string, maxLevel: 3 | 4 = 3): TocItem[] {
  const headings: TocItem[] = []
  // Nadpisy mají po renderu atributy (např. id z richTextToHtml) — otevírací
  // tag proto musí povolit i atributy, jinak by TOC zůstalo prázdné.
  // Zachytíme i atributy otevíracího tagu, ať přečteme skutečné `id`, které
  // vygeneroval richTextToHtml (vč. případných -2/-3 u opakovaných nadpisů) —
  // jinak by TOC odkaz nesouhlasil s kotvou v textu.
  const regex = new RegExp(`<(h[2-${maxLevel}])([^>]*)>(.*?)</\\1>`, 'gi')
  let match
  while ((match = regex.exec(html)) !== null) {
    const level = parseInt(match[1][1], 10)
    const attrs = match[2]
    const text = decodeHtmlEntities(stripTags(match[3])).trim()
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
  pageCategory,
  timezone,
  currencyCode,
  exchangeRate,
  practicalInfo = null,
  createdByPublic,
  touristPointInfo = null,
  belowText = null,
  centerColumn = false,
}: {
  text: string | RichTextRoot
  pageCategory?: PageCategory
  timezone?: string | null
  currencyCode?: string | null
  exchangeRate?: number | null
  /**
   * Karta „Praktické informace" v pravém sloupci u míst — `fullSlug` může být
   * vlastní podstránka místa, nebo (San Francisco → USA) zděděná od nejbližšího
   * předka; `ownerTitle`/`ownerGenitive` se PRO NADPIS KARTY vždy týkají toho,
   * čí je to podstránka (viz legacy `parentPracticalInformationPage.parent`).
   */
  practicalInfo?: {
    fullSlug: string
    ownerTitle: string
    ownerGenitive?: string | null
  } | null
  createdByPublic?: {
    username?: string | null
    name?: string | null
    avatar?: { url?: string | null } | null
  } | null
  /** Karta Praktické informace (jen turistické cíle) — adresa, web, mapa, autor. */
  touristPointInfo?: TouristPointInfo | null
  /**
   * Obsah, který navazuje HNED ZA textem stránky uvnitř čtecího sloupce (dnes
   * sekce „Náš tým" na stránce O nás). Samostatná sekce pod `<main>` by se
   * musela znovu zarovnávat na šířku sloupce a oddělilo by ji spodní odsazení
   * obsahu — takhle plyne dál ve stejném rytmu jako odstavce.
   */
  belowText?: React.ReactNode
  /**
   * Postavit čtecí sloupec na osu stránky, i když vedle sebe nemá boční panel.
   * Zapíná se na statických stránkách — pod nimi nezačíná žádná sekce přes
   * celou šířku, ke které by se text měl zarovnat vlevo (viz `justify` níž).
   */
  centerColumn?: boolean
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
  // Složené Praktické informace mají nadpisy posunuté o úroveň níž — obsah
  // proto bere h2–h4 (sekce + dvě úrovně podkapitol, jako starý web s h1–h3).
  const isPracticalInfo = pageCategory === PageCategory.Prakticke_informace
  const headings = showTableOfContents ? extractHeadings(textHtml, isPracticalInfo ? 4 : 3) : []

  const cleanOwnerGenitive = practicalInfo?.ownerGenitive?.replace(/^do\s+/i, '')
  const practicalInfoOwnerName = practicalInfo
    ? cleanOwnerGenitive || practicalInfo.ownerTitle
    : null
  // Autora bereme VÝHRADNĚ z veřejného virtuálního pole `createdByPublic` —
  // interní `createdBy` (surová relace na uživatele) se na frontend nevystavuje.
  const author = createdByPublic ?? null
  // Pořadí stejné jako u autora článku: nejdřív celé jméno, pak uživatelské.
  // U AUTORSTVÍ obsahu (článek, místo, cíl) dává smysl skutečné jméno; podpis
  // pod komentáři a recenzemi zůstává uživatelským jménem (viz publicName).
  const authorName = author?.name || author?.username || null
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

  // Bloky bočního panelu — každý má svou podmínku, protože panel se skládá
  // podle typu stránky (karta cíle / čas s kurzem / obsah s reklamou).
  const showTouristPointCard = Boolean(
    touristPointInfo &&
    (touristPointInfo.address ||
      touristPointInfo.websiteUrl ||
      touristPointInfo.mapCenter ||
      contributor),
  )
  const showAktualniInfoPanel = Boolean(
    showAktualniInfo && (timezone || exchangeRate || practicalInfo),
  )
  // Statické stránky a rubriky do panelu nedávají NIC — dokud se vykresloval
  // vždy, držel si prázdný sloupec 340 px i s mezerou. Bez obsahu proto vůbec
  // nevznikne.
  const hasSidebar = showTouristPointCard || showAktualniInfoPanel || showTableOfContents
  // Kam se čtecí sloupec postaví, když vedle sebe nemá panel:
  //  · statická stránka (`centerColumn`) → na OSU stránky. Zaparkovaný vlevo
  //    ležel ~190 px od středu a vpravo zela díra po panelu.
  //  · rubrika → zůstává vlevo, protože pod textem začíná mřížka článků přes
  //    celou šířku a vystředěný úvod by proti ní byl odsazený doprava.
  // Šířku ani vnitřní odsazení sloupce neměníme — text má pořád stejnou míru
  // řádku, mění se jen jeho poloha.
  const justify = hasSidebar || centerColumn ? 'lg:justify-center' : 'lg:justify-start'

  return (
    <main
      id="obsah"
      tabIndex={-1}
      // Turistický cíl: menší spodní odsazení — hned pod obsahem navazuje
      // sekce recenzí a plných 80 px by mezi nimi dělalo zbytečnou díru.
      className={`max-w-7xl mx-auto px-4 pt-12 ${touristPointInfo ? 'pb-6 md:pb-8' : 'pb-12 md:pb-20'} flex flex-col items-stretch lg:flex-row ${justify} gap-8 lg:gap-10 focus:outline-none`}
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
          // orientované fotky by jinak zabraly celou obrazovku. Praktické
          // informace: posunuté nadpisy dostávají vzhled o úroveň výš (pi-prose).
          proseClassName={touristPointInfo ? 'poi-prose' : isPracticalInfo ? 'pi-prose' : undefined}
        />
        {belowText}
      </div>

      {/* Sidebar / Info Column — vznikne jen když má co ukázat (viz hasSidebar) */}
      {hasSidebar && (
        <aside className="w-full lg:w-[340px] shrink-0 flex flex-col gap-12 relative">
          {/* Praktické informace turistického cíle — adresa, web, mapa, autor.
            Vzdušné legacy rozložení: bez rámečku, přes celou šířku sloupce,
            větší modré ikony a velká mapa; autor ve standardní podobě
            (avatar + jméno + „Cestovní průvodce"). */}
          {showTouristPointCard && touristPointInfo && (
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
                    <MapLibreMap
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
          {showAktualniInfoPanel && (
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
                        {practicalInfo ? (
                          <Link
                            href={`${practicalInfo.fullSlug}#mena-a-ceny`}
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
                {practicalInfo && (
                  <Link
                    href={practicalInfo.fullSlug}
                    className="block hover:no-underline group relative mt-6 pt-4"
                  >
                    <h2 className="text-[22px] font-bold text-[#1a3f6c] mb-6 group-hover:underline leading-tight">
                      Praktické informace <br />
                      do {practicalInfoOwnerName}
                    </h2>
                    <div className="relative inline-block w-full">
                      <div className="absolute top-1/2 -translate-y-1/2 left-[calc(50%+70px)] w-[55px] h-[55px] bg-[url('/assets/information/essentials-gray.gif')] bg-no-repeat bg-contain opacity-20 z-0" />
                      <div className="relative z-10 text-[18px] text-[#888] leading-[1.5]">
                        <p className="m-0">
                          Praktické cestovní informace <br />
                          při cestě do {practicalInfoOwnerName}
                        </p>
                      </div>
                    </div>
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* Obsah (TOC) + reklama ve společném sticky bloku (jako u článku) —
            jen na informačních podstránkách. Panel má scrollspy (zvýrazňuje
            čtenou sekci a posouvá se za ní) a vnitřní posuvník — dlouhý obsah
            složených Praktických informací by jinak přerostl obrazovku.
            Reklama jde dovnitř jako children (zůstává server-side). */}
          {showTableOfContents && (
            <TocSidebar items={headings} practicalInfo={isPracticalInfo}>
              <div className={headings.length > 0 ? 'mt-12' : ''}>
                <AdSenseScript />
                <ArticleAd variant="primary" />
              </div>
            </TocSidebar>
          )}
        </aside>
      )}
    </main>
  )
}
