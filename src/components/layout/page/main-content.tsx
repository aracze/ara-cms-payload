import React from 'react'
import { PageCategory, RichTextRoot } from '@/types/payload'
import Link from 'next/link'
import { ChevronRight, Globe, MapPin } from 'lucide-react'
import { LocalTime } from '@/components/features/local-time'
import { MapLibreMap } from '@/components/features/maplibre-map'
import { UserAvatar } from '@/components/user-avatar'
import { richTextToHtml } from '@/lib/rich-text-html'
import { websiteHref, websiteLabel } from '@/lib/utils'
import { CollapsiblePageTextWithContributor } from './collapsible-page-text'
import { PageContributor } from './page-contributor'
import { ArticleAd } from '@/components/features/article-ad'
import { TocSidebar } from '@/components/features/toc-sidebar'
import { SeasonStrip } from './season-strip'
import { WeatherIcon } from '@/components/features/weather-icon'
import type { SeasonMonths } from '@/lib/seasonality'

/** Data počasí v pravém panelu — teplota, stav a odkaz na stránku počasí. */
export interface PanelWeatherData {
  temp: number
  condition: string
  icon: string | null
  href: string
}

/**
 * Sloupec počasí v panelu: tři řádky nad sebou — popisek stavu, teplota, ikona.
 * Přesně tatáž stavba jako sloupec s časem vedle (den / čas / posun), takže obě
 * poloviny mají stejný tvar i výšku a u dělící linky proti sobě stojí jen dvě
 * hodnoty. Ikona proto leží POD teplotou, ne vedle ní — vedle ní by u linky
 * odsazovala jednu stranu jinak než druhá.
 */
function PanelWeather({ weather }: { weather: PanelWeatherData }) {
  return (
    <Link
      href={weather.href}
      className="flex flex-col items-center gap-1.5 px-1.5 hover:no-underline"
    >
      {/* Jeden řádek s výpustkou: sloupec je široký 125 px, takže delší popisky
          („Zataženo s deštěm“) by se zalomily. Řádek má pevnou výšku kvůli
          zarovnání s časem vedle, takže by druhá řádka přetekla přes teplotu.
          Celý popisek zůstává v title a stránka počasí ho má vypsaný. */}
      <span
        title={weather.condition}
        className="block h-[15px] max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[10px] font-bold uppercase leading-[15px] tracking-[0.1em] text-[#667085]"
      >
        {weather.condition}
      </span>
      <span className="text-[26px] leading-none tracking-[0.01rem] text-[#333]">
        {weather.temp} °C
      </span>
      <WeatherIcon icon={weather.icon} className="h-[15px] w-[15px] text-[#667085]" />
    </Link>
  )
}

/** Data karty „Praktické informace" v pravém sloupci detailu turistického cíle. */
export interface TouristPointInfo {
  address: string | null
  websiteUrl: string | null
  mapCenter: { lat: number; lng: number } | null
  mapZoom: number
  title: string
  fullSlug: string
}

export interface TocItem {
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
    // Osamocené UTF-16 surrogate hodnoty nejsou platný Unicode scalar —
    // String.fromCodePoint by je nevyhodil, ale vrátil by nepárový surrogate.
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) return fallback
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
  seasonPanel = null,
  panelWeather = null,
  createdByPublic,
  touristPointInfo = null,
  aboveText = null,
  midText = null,
  midHeadings = [],
  belowText = null,
  preHeadings = [],
  extraHeadings = [],
  contributorAtEnd = false,
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
  /**
   * Pruh „Kdy jet do…" na začátku panelu. Zdroj sezóny vybírá page.tsx —
   * u zemí jedině ruční blok z adminu, u konkrétních míst i výpočet z klimatu.
   */
  seasonPanel?: {
    season: SeasonMonths
    heading: string
    href: string | null
  } | null
  /**
   * Teplota vedle hodin (legacy „Aktuální čas s teplotou a kurz"). Jen
   * u konkrétních míst s vlastní stránkou počasí — u zemí by šlo o teplotu
   * z jejich geometrického středu.
   */
  panelWeather?: PanelWeatherData | null
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
   * Obsah PŘED textem stránky uvnitř čtecího sloupce (dnes aktuální počasí
   * na stránkách Počasí — legacy pořadí: počasí, text „Kdy jet", zbytek).
   */
  aboveText?: React.ReactNode
  /**
   * Blok vložený DO textu za první nadpis h2 a jeho první odstavec (mapa se
   * štítkem ubytování). Text bez h2 ho dostane až za sebe (před `belowText`).
   * Jen pro nesbalované stránky — rozdělený text by sbalování rozbilo.
   */
  midText?: React.ReactNode
  /** Položky obsahu (TOC) bloku `midText` — zařadí se mezi nadpisy textu na jeho místo. */
  midHeadings?: TocItem[]
  /**
   * Položky obsahu (TOC) PŘED nadpisy z textu — pro sekce v `aboveText`.
   */
  preHeadings?: TocItem[]
  /**
   * Položky obsahu (TOC) navíc za nadpisy z textu — pro sekce vykreslované
   * mimo rich text (dnes graf klimatu v `belowText` na stránkách Počasí).
   * Bez nich by sekce v postranním obsahu chyběla, extractHeadings čte jen HTML.
   */
  extraHeadings?: TocItem[]
  /**
   * Podpis autora až na SAMÉM KONCI sloupce (za `belowText`), ne hned pod
   * textem. Zapnuté na stránkách počasí: mezi textem a grafy by autor rozdělil
   * sekce, které patří k sobě.
   */
  contributorAtEnd?: boolean
  /**
   * Postavit čtecí sloupec na osu stránky, i když vedle sebe nemá boční panel.
   * Zapíná se na statických stránkách — pod nimi nezačíná žádná sekce přes
   * celou šířku, ke které by se text měl zarovnat vlevo (viz `justify` níž).
   */
  centerColumn?: boolean
}) => {
  const placeCategories: PageCategory[] = [
    PageCategory.Misto_k_navstiveni,
    PageCategory.Turisticky_cil,
  ]
  const showAktualniInfo = !!pageCategory && placeCategories.includes(pageCategory)
  // Pásmo jde do kontextu spolu s měnou — karta „Aktuální čas" v textu si ho
  // bere, když má v bloku prázdné políčko (viz rich-text-html).
  const textHtml = richTextToHtml(text, { currencyCode, exchangeRate, timezone })
  const tocCategories: PageCategory[] = [
    PageCategory.Vstupni_podminky,
    PageCategory.Mena_a_ceny,
    PageCategory.Pocasi,
    PageCategory.Cesta,
    PageCategory.Doprava,
    PageCategory.Zdravi_a_bezpeci,
    PageCategory.Jazyk_a_kultura,
    PageCategory.Jidlo_a_pit,
    // Ubytování je informační podstránka jako ostatní (starý web jí dával
    // obsah vpravo i autora) — bez ní tu stránka stála vlevo s prázdným sloupcem.
    PageCategory.Ubytovani,
    PageCategory.Prakticke_informace,
  ]
  const showTableOfContents = !!pageCategory && tocCategories.includes(pageCategory)
  // Složené Praktické informace mají nadpisy posunuté o úroveň níž — obsah
  // proto bere h2–h4 (sekce + dvě úrovně podkapitol, jako starý web s h1–h3).
  const isPracticalInfo = pageCategory === PageCategory.Prakticke_informace
  // Rozdělení textu pro `midText`: před prvním h2 (úvod) / od něj dál. Nadpisy
  // jsou v HTML z richTextToHtml na nejvyšší úrovni, takže řez mezi bloky
  // nechá oba kusy validní. Bez h2 zůstane text celý a blok jde až za něj.
  // Řez pro `midText`: za prvním nadpisem h2 a jeho prvním odstavcem
  // (rozhodnutí uživatele 5. 9. 2026) — čtenář si přečte úvod i to, kde se
  // ubytovat, a pak vidí mapu. Bez h2 nebo bez odstavce za ním jde blok až za
  // text. Nadpisy i odstavce jsou v HTML z richTextToHtml na nejvyšší úrovni,
  // takže řez za `</p>` nechá oba kusy validní.
  const firstH2 = midText ? textHtml.search(/<h2[\s>]/i) : -1
  const firstParagraphEnd = firstH2 >= 0 ? textHtml.indexOf('</p>', firstH2) : -1
  const splitAt = firstParagraphEnd >= 0 ? firstParagraphEnd + '</p>'.length : -1
  const splitText = midText && splitAt > 0
  const textBefore = splitText ? textHtml.slice(0, splitAt) : textHtml
  const textAfter = splitText ? textHtml.slice(splitAt) : ''
  const headingLevel = isPracticalInfo ? 4 : 3
  const headings = showTableOfContents
    ? [
        ...preHeadings,
        ...extractHeadings(textBefore, headingLevel),
        ...(midText ? midHeadings : []),
        ...extractHeadings(textAfter, headingLevel),
        ...extraHeadings,
      ]
    : []

  // Celý 2. pád i s předložkou („do Myanmaru", „na Slovensko") — stejně jako
  // titulky v page-title.ts. Dřívější odřezávání „do" a doplňování ve větě
  // selhalo u zemí s jinou předložkou („do na Slovensko").
  const practicalInfoOwnerPhrase = practicalInfo
    ? practicalInfo.ownerGenitive || `do ${practicalInfo.ownerTitle}`
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
      contributor ||
      practicalInfo),
  )
  // U cíle se odkaz na Praktické informace zapojuje přímo do karty (viz níže) —
  // zmenšený vystředěný panel z míst pod ní působil nalepeně. Rozhoduje ale
  // skutečné VYKRESLENÍ karty, ne existence cíle: cíl bez adresy/webu/mapy
  // kartu nemá a panel mu musí zůstat, jinak by přišel o čas a kurz.
  const showAktualniInfoPanel = Boolean(
    showAktualniInfo &&
    !showTouristPointCard &&
    (timezone || exchangeRate || practicalInfo || seasonPanel),
  )
  /**
   * Nadpis musí vyjmenovat PRÁVĚ TO, co je pod ním — proto všech sedm kombinací
   * času, teploty a kurzu (formulace ze starého webu). Dřívější řetěz ternárních
   * podmínek na kombinaci „čas + teplota bez kurzu" zapomněl, takže Dubrovník
   * s viditelnou teplotou hlásil jen „Aktuální čas“. Kurz tam chybí proto, že má
   * v CMS starou měnu HRK — nadpis ale musí sedět i v takovém případě.
   */
  const panelHeadings: Record<string, string> = {
    '111': 'Aktuální čas s teplotou a kurz',
    '110': 'Aktuální čas a teplota',
    '101': 'Aktuální čas a kurz měny',
    '100': 'Aktuální čas',
    '011': 'Aktuální teplota a kurz měny',
    '010': 'Aktuální teplota',
    '001': 'Aktuální měnový kurz',
  }
  const panelHeading =
    panelHeadings[`${timezone ? 1 : 0}${panelWeather ? 1 : 0}${exchangeRate ? 1 : 0}`]
  // Statické stránky a rubriky do panelu nedávají NIC — dokud se vykresloval
  // vždy, držel si prázdný sloupec 340 px i s mezerou. Bez obsahu proto vůbec
  // nevznikne.
  const hasSidebar = showTouristPointCard || showAktualniInfoPanel || showTableOfContents
  // Rubrika: krátký perex je vystředěný jako podtitul stránky a sedí těsně nad
  // mřížkou článků (redesign rubrik, varianta C — dřív stál vlevo v širokém
  // prázdném pruhu a ztrácel se).
  const isRubric = pageCategory === PageCategory.Rubrika
  // Kam se čtecí sloupec postaví, když vedle sebe nemá panel:
  //  · statická stránka (`centerColumn`) a rubrika → na OSU stránky. Zaparkovaný
  //    vlevo ležel ~190 px od středu a vpravo zela díra po panelu.
  // Šířku ani vnitřní odsazení sloupce neměníme — text má pořád stejnou míru
  // řádku, mění se jen jeho poloha.
  const justify = hasSidebar || centerColumn || isRubric ? 'lg:justify-center' : 'lg:justify-start'
  // Fotky v textu cíle: plná šířka sloupce, ale omezená výška — na výšku
  // orientované fotky by jinak zabraly celou obrazovku. Praktické informace:
  // posunuté nadpisy dostávají vzhled o úroveň výš (pi-prose). Rubrika: text
  // je jednořádkové motto vycentrované nad mřížkou článků (viz `isRubric`
  // a .rubric-motto v globals.css).
  const proseClassName = touristPointInfo
    ? 'poi-prose'
    : isPracticalInfo
      ? 'pi-prose'
      : isRubric
        ? 'rubric-motto'
        : undefined

  return (
    <main
      id="obsah"
      tabIndex={-1}
      // Turistický cíl: menší spodní odsazení — hned pod obsahem navazuje
      // sekce recenzí a plných 80 px by mezi nimi dělalo zbytečnou díru.
      // Rubrika: totéž kvůli mřížce článků — perex je její podtitul, ne
      // samostatný blok, takže mezi nimi nesmí zet prázdný pruh.
      className={`max-w-7xl mx-auto px-4 pt-12 ${touristPointInfo || isRubric ? 'pb-6 md:pb-8' : 'pb-12 md:pb-20'} flex flex-col items-stretch lg:flex-row ${justify} gap-8 lg:gap-10 focus:outline-none`}
    >
      {/* Main Content — čtecí sloupec jako u článku (viz reading-prose) */}
      <div className="flex-1 min-w-0 lg:max-w-[808px] lg:px-16">
        {aboveText}
        {splitText && (
          <CollapsiblePageTextWithContributor
            textHtml={textBefore}
            collapsible={false}
            proseClassName={proseClassName}
          />
        )}
        {splitText && midText}
        <CollapsiblePageTextWithContributor
          textHtml={splitText ? textAfter : textHtml}
          // Autor se zobrazuje na místech (Místa/Místo k navštívení/Turistický cíl)
          // i na informačních podstránkách (Vstupní podmínky, Měna a ceny, Počasí…)
          // — jako na původním webu. Rubriky a statické stránky autora nemají.
          // Na turistickém cíli se autor přesouvá do karty Praktické informace
          // v pravém sloupci (legacy rozložení), pod textem by byl dvakrát.
          contributor={
            (showAktualniInfo || showTableOfContents) && !touristPointInfo && !contributorAtEnd
              ? contributor
              : null
          }
          collapsible={pageCategory === PageCategory.Misto_k_navstiveni}
          // Pokračování za vloženým blokem: první odstavec už není úvodní
          // „lead" (viz .prose-continued v globals.css).
          proseClassName={
            splitText ? `${proseClassName ?? ''} prose-continued`.trim() : proseClassName
          }
        />
        {midText && !splitText && midText}
        {belowText}
        {contributorAtEnd && contributor && (
          <div className="mt-10">
            <PageContributor contributor={contributor} />
          </div>
        )}
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

                {/* Odkaz na Praktické informace země — karta-tip s jemně modrým
                    podkladem a podkresem mapové ikony mezi koncem textu a šipkou
                    (stejný motiv jako v panelu u míst; na modrém podkladu je
                    potřeba o chlup silnější síla než na bílé). */}
                {practicalInfo && (
                  <Link
                    href={practicalInfo.fullSlug}
                    className="relative flex items-center gap-3 overflow-hidden rounded-lg bg-[#f2f7fb] px-[18px] py-4 transition-colors hover:bg-[#e9f2f9]"
                  >
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute right-11 top-1/2 z-0 h-[56px] w-[56px] -translate-y-1/2 bg-[url('/assets/information/essentials-gray.gif')] bg-contain bg-no-repeat opacity-[0.18]"
                    />
                    <span className="relative z-10 flex-1">
                      <span className="block font-heading text-[16px] font-semibold leading-snug text-[#1a3f6c]">
                        Praktické informace {practicalInfoOwnerPhrase}
                      </span>
                      <span className="mt-1 block text-[13px] leading-snug text-[#6f7a86]">
                        Měna, doprava, zdraví a další rady na cestu.
                      </span>
                    </span>
                    <ChevronRight
                      aria-hidden="true"
                      className="relative z-10 h-5 w-5 shrink-0 text-[#215491]"
                      strokeWidth={2}
                    />
                  </Link>
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
                {/* Kdy jet — pruh sezóny úplně nahoře (rozhodnutí uživatele:
                    u zemí tenhle blok panel otevírá místo praktických informací). */}
                {seasonPanel && (
                  <SeasonStrip
                    season={seasonPanel.season}
                    heading={seasonPanel.heading}
                    href={seasonPanel.href}
                  />
                )}
                {seasonPanel && (timezone || exchangeRate || panelWeather) && (
                  <div className="w-[250px] mx-auto border-b border-[#e4e4e4] mb-6" />
                )}
                {/* Section 1: Time, Weather and Exchange Rate */}
                {(timezone || exchangeRate || panelWeather) && (
                  <div className="mb-6">
                    <h2 className="text-[20px] font-semibold text-[#1a3f6c] mb-4">
                      {panelHeading}
                    </h2>
                    {(timezone || panelWeather) && (
                      <>
                        {/* Čas vlevo, počasí vpravo, mezi nimi vlasová linka —
                            dvě různé věci se nemají mísit do jedné řady (dřív
                            splývaly a popisek stavu se vázal spíš k hodinám).
                            Oba sloupce mají tvar „popisek / hodnota / upřesnění":
                            vlevo den–čas–posun, vpravo stav–teplota–ikona, takže
                            u linky proti sobě stojí jen dvě hodnoty.

                            Blok je široký 250 px jako vodorovné linky nad ním a
                            pod ním — v šířce celého panelu (340 px) zbývalo u
                            dělící linky přes 50 px prázdna na každé straně. */}
                        {timezone && panelWeather ? (
                          // Flex, ne grid: u gridu se automatické umísťování
                          // buněk kolem přes-řádkové linky rozsype a sloupce
                          // se překryjí.
                          <div className="mx-auto flex w-[250px] items-stretch justify-center">
                            <LocalTime timezone={timezone} stacked className="flex-1 min-w-0" />
                            <div className="w-px shrink-0 self-stretch bg-[#e4e4e4]" />
                            <div className="flex-1 min-w-0">
                              <PanelWeather weather={panelWeather} />
                            </div>
                          </div>
                        ) : timezone ? (
                          <LocalTime timezone={timezone} />
                        ) : (
                          panelWeather && <PanelWeather weather={panelWeather} />
                        )}
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
                    <h2 className="text-[22px] font-semibold text-[#1a3f6c] mb-6 group-hover:underline leading-tight">
                      Praktické informace <br />
                      {practicalInfoOwnerPhrase}
                    </h2>
                    <div className="relative inline-block w-full">
                      <div className="absolute top-1/2 -translate-y-1/2 left-[calc(50%+70px)] w-[55px] h-[55px] bg-[url('/assets/information/essentials-gray.gif')] bg-no-repeat bg-contain opacity-20 z-0" />
                      <div className="relative z-10 text-[18px] text-[#888] leading-[1.5]">
                        <p className="m-0">
                          Praktické cestovní informace <br />
                          při cestě {practicalInfoOwnerPhrase}
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
                <ArticleAd variant="primary" />
              </div>
            </TocSidebar>
          )}
        </aside>
      )}
    </main>
  )
}
