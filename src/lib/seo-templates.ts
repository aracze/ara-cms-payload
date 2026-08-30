/**
 * Šablony SEO titulků a popisků podle kategorie stránky.
 *
 * Starý web (Grails) měl v adminu u SEO polí výběr „Šablona" (Stát, Město,
 * Turistický cíl, Počasí, Vstupní podmínky…; `assets/javascripts/page/
 * seo-templates.js` + `_seoSection.gsp`), který do polí vložil vzor
 * s `{{title}}`/`{{parentTitle}}` a editor ho dosklonil ručně — proto mají
 * migrované popisky jednotné znění („Vstupní podmínky a víza do Peru • Ara.cz",
 * „Čím platit ve Slovinsku - aktuální měna a ceny", „Inspirace a doporučení pro
 * cestování do Norska…"). Tyhle vzory tu jsou přepsané do kódu (skloňování už
 * automaticky z polí místa), aby:
 *
 * 1. stránka bez vyplněného SEO pole dostala titulek a popisek ve stejném duchu
 *    (fallback v `generateMetadata`, viz src/lib/seo.ts),
 * 2. tlačítko „Vygenerovat" u SEO polí v adminu (plugin-seo) nabídlo rovnou
 *    hotový návrh podle kategorie, ne obecnou větu.
 *
 * Skloňování bere z polí `detail.genitive` („do Norska") a `detail.locative`
 * („v Norsku") místa; bez nich spadne na název s předložkou. Sedmý pád
 * („průvodce Norskem") CMS nemá, takže se v šablonách nepoužívá.
 *
 * POZOR: tohle jsou šablony jen pro `<title>`/meta description. Viditelný h1
 * skládá `buildPageTitle` (src/lib/page-title.ts) a drží znění starého webu —
 * neměnit jedno podle druhého.
 */
import { PageCategory } from '@/types/payload'

/** Minimum, co šablony o stránce potřebují (detail stránky i surový doc z adminu). */
export type SeoPageLike = {
  title: string
  category: PageCategory | string | null | undefined
  detail?: { genitive?: string | null; locative?: string | null } | null
}

/** Místo, ke kterému stránka patří (samo místo, nebo nejbližší nadřazené). */
export type SeoPlaceLike = Pick<SeoPageLike, 'title' | 'detail'>

export type SeoTemplateOptions = {
  /**
   * Místo leží v jiném místě (město v zemi, ostrov v zemi…) → legacy šablona
   * „Město" místo „Stát". Kontinent i země mají `false`.
   */
  placeHasParentPlace?: boolean
}

/** „do Norska" — druhý pád s předložkou, fallback na název. */
export function genitiveOf(place: SeoPlaceLike): string {
  return place.detail?.genitive?.trim() || `do ${place.title}`
}

/** „v Norsku" — šestý pád s předložkou, fallback na název. */
export function locativeOf(place: SeoPlaceLike): string {
  return place.detail?.locative?.trim() || `v ${place.title}`
}

/**
 * „v Norsku" → „Norsku", „na Maltě" → „Maltě": šestý pád bez předložky, aby šlo
 * říct „informace o Norsku". (U druhého pádu to nejde — „na Maltu" je čtvrtý.)
 */
export function locativeBare(place: SeoPlaceLike): string {
  return locativeOf(place).replace(/^(ve?|na)\s+/i, '')
}

/** První věta textu (pro popisky, které legacy začínalo úvodem stránky). */
export function leadSentence(plain: string, max = 120): string {
  const compact = plain.replace(/\s+/g, ' ').trim()
  if (!compact) return ''
  const m = compact.match(/^.*?[.!?](?=\s|$)/)
  const sentence = m ? m[0] : compact
  if (sentence.length <= max) return sentence
  const cut = sentence.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:–—-]+$/, '')}…`
}

/**
 * SEO titulek podle kategorie — BEZ přípony webu (tu přidá šablona layoutu,
 * resp. plugin-seo generátor). Vrací `null`, když šablona pro kategorii není
 * (statické stránky, neznámé) → volající použije název.
 */
export function seoTitleTemplate(page: SeoPageLike, place: SeoPlaceLike): string | null {
  const gen = genitiveOf(place)
  const loc = locativeOf(place)
  switch (page.category) {
    case PageCategory.Turisticky_cil:
      // Legacy šablona „{{title}} v {{parentTitle}} - cestovní průvodce";
      // „cestovní průvodce" doplní přípona layoutu.
      return place.title && place.title !== page.title ? `${page.title} ${loc}` : null
    case PageCategory.Misto_k_navstiveni:
      return null // název místa; „Cestovní průvodce" doplní přípona
    case PageCategory.Prakticke_informace:
      return `Praktické informace při cestě ${gen}`
    case PageCategory.Vstupni_podminky:
      return `Vstupní podmínky a víza ${gen}`
    case PageCategory.Cesta:
      return `Cesta ${gen} – jak se dostat levně a rychle`
    case PageCategory.Pocasi:
      return `Počasí ${loc} – předpověď a kdy jet`
    case PageCategory.Doprava:
      return `Cestování a doprava ${loc} – levně a jednoduše`
    case PageCategory.Mena_a_ceny:
      return `Čím platit ${loc} – aktuální měna a ceny`
    case PageCategory.Zdravi_a_bezpeci:
      return `Zdraví a bezpečí ${loc} – zdravotní péče a rizika`
    case PageCategory.Jazyk_a_kultura:
      return `Jazyk a kultura ${loc} – zvyky, svátky a památky`
    case PageCategory.Jidlo_a_pit:
      return `Jídlo a pití ${loc} – co ochutnat a vyzkoušet`
    case PageCategory.Ubytovani:
      return `Ubytování ${loc} – kde se ubytovat`
    case PageCategory.Rubrika:
      return `${page.title} – cestovní inspirace`
    default:
      return null
  }
}

/**
 * SEO popisek podle kategorie. `lead` = první věta textu stránky (legacy jí
 * začínalo popisky cílů a vstupních podmínek). Vrací `null` bez šablony →
 * volající použije začátek textu.
 */
export function seoDescriptionTemplate(
  page: SeoPageLike,
  place: SeoPlaceLike,
  lead: string,
  options: SeoTemplateOptions = {},
): string | null {
  const gen = genitiveOf(place)
  const loc = locativeOf(place)
  const o = `o ${locativeBare(place)}`
  const withLead = (intro: string) => (lead ? `${intro}: ${lead}` : `${intro}.`)
  switch (page.category) {
    case PageCategory.Misto_k_navstiveni:
      // Legacy „Stát" vs. „Město": země zve k objevování, město vyjmenovává, co
      // si nenechat ujít.
      return options.placeHasParentPlace
        ? `Inspirace a doporučení pro cestování ${gen}. Praktické informace, oblíbená místa a aktivity, které si nenech ujít ${loc} – kdy jet, co vidět a kde se ubytovat.`
        : `Inspirace a doporučení pro cestování ${gen}. Nejlepší místa k návštěvě, články a praktické informace ${o} – kdy jet, co vidět a na co si dát pozor.`
    case PageCategory.Turisticky_cil: {
      // Legacy: „Cestovní průvodce a kompletní informace o {{title}} v {{parentTitle}}.
      // Praktické informace, mapa, recenze, fotky a zajímavá místa v okolí."
      // — s první větou textu místo obecného výčtu, když text je.
      const where = place.title && place.title !== page.title ? ` ${loc}` : ''
      const intro = `Cestovní průvodce a informace o cíli ${page.title}${where}`
      return lead
        ? `${intro}: ${lead}`
        : `${intro}. Praktické informace, mapa, recenze, fotky a zajímavá místa v okolí.`
    }
    case PageCategory.Prakticke_informace:
      // Legacy „Praktické informace": „Vše důležité, co potřebuješ vědět před cestou…"
      return `Vše důležité, co potřebuješ vědět před cestou ${gen}: vstupní podmínky a víza, měna a ceny, zdraví a bezpečí, doprava, jazyk, kultura a jídlo.`
    case PageCategory.Vstupni_podminky:
      return withLead(
        `Podmínky vstupu ${gen} – víza, pasy, potřebné dokumenty a odkazy na oficiální zdroje`,
      )
    case PageCategory.Cesta:
      return `Jak se dostat levně a rychle ${gen} – porovnání ceny, času a tras při cestování autem, autobusem, vlakem nebo letadlem.`
    case PageCategory.Pocasi:
      return `Aktuální předpověď počasí ${loc}, průměrné teploty a srážky v jednotlivých měsících a výběr ideálního období, kdy jet ${gen}.`
    case PageCategory.Doprava:
      return `Tipy, jak levně a jednoduše cestovat ${loc}: veřejná doprava, taxi, cesta z letiště a možnosti půjčení auta.`
    case PageCategory.Mena_a_ceny:
      return `Jakou měnou se platí ${loc} a jaké jsou denní náklady a ceny? Platba kartou, výběr z bankomatu, spropitné a smlouvání.`
    case PageCategory.Zdravi_a_bezpeci:
      return `Bezpečí ${loc} a na co si dát pozor: zdravotní péče, možná rizika, doporučené očkování, cestovní pojištění a rady pro cesty s dětmi.`
    case PageCategory.Jazyk_a_kultura:
      return `Základy jazyka, zvyky a způsob života ${loc}: svátky, náboženství, pravidla chování a nejzajímavější památky včetně UNESCO.`
    case PageCategory.Jidlo_a_pit:
      return `Tradiční pokrmy a nápoje, které musíš ochutnat ${loc}. Vše o stravování, specialitách místní kuchyně a cenách v restauracích.`
    case PageCategory.Ubytovani:
      return `Doporučení, kde se ubytovat ${loc}: výběr vhodné lokality, tipy na levné hotely a porovnání aktuálních cen na mapě.`
    case PageCategory.Rubrika:
      return lead
        ? `${lead} Články, tipy a zkušenosti z rubriky ${page.title} na Ara.cz.`
        : `Články, tipy a zkušenosti z rubriky ${page.title} na Ara.cz.`
    default:
      return null
  }
}
