import { Page as PayloadPage, PageCategory } from '@/types/payload'

export const rootPageCategories: PageCategory[] = [
  PageCategory.Turisticky_cil,
  PageCategory.Misto_k_navstiveni,
  PageCategory.Rubrika,
  PageCategory.Staticka_stranka,
]

function getGenitivePlace(contextPage: PayloadPage): string {
  return contextPage.detail?.genitive || `do ${contextPage.title}`
}

function getLocativePlace(contextPage: PayloadPage): string {
  return contextPage.detail?.locative || `v ${contextPage.title}`
}

export function buildPageTitle(page: PayloadPage, rootPage?: PayloadPage): string {
  const contextualPage = !rootPageCategories.includes(page.category) && rootPage ? rootPage : page

  switch (page.category) {
    case PageCategory.Pocasi:
      // Matches legacy Grails wording: "Aktuální počasí a kdy jet ..."
      return `Aktuální počasí a kdy jet ${getGenitivePlace(contextualPage)}`
    case PageCategory.Doprava:
      // Matches legacy Grails wording: "Cestování a doprava ..."
      return `Cestování a doprava ${getLocativePlace(contextualPage)}`
    case PageCategory.Vstupni_podminky:
      // Matches legacy Grails wording: "Vstupní podmínky a víza ..."
      return `Vstupní podmínky a víza ${getGenitivePlace(contextualPage)}`
    case PageCategory.Mena_a_ceny:
      return `Měna a ceny ${getLocativePlace(contextualPage)}`
    case PageCategory.Zdravi_a_bezpeci:
      return `Zdraví a bezpečí ${getLocativePlace(contextualPage)}`
    case PageCategory.Jazyk_a_kultura:
      return `Jazyk a kultura ${getLocativePlace(contextualPage)}`
    case PageCategory.Jidlo_a_pit:
      return `Jídlo a pití ${getLocativePlace(contextualPage)}`
    case PageCategory.Cesta:
      // Matches legacy Grails wording: "Cestování a cesta ..."
      return `Cestování a cesta ${getGenitivePlace(contextualPage)}`
    case PageCategory.Ubytovani:
      return `Ubytování ${getLocativePlace(contextualPage)}`
    case PageCategory.Prakticke_informace:
      // Matches legacy Grails wording: "Praktické informace do ..."
      return `Praktické informace ${getGenitivePlace(contextualPage)}`
    default:
      return page.title
  }
}
