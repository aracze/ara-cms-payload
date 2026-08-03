export interface SearchItem {
  // slug/fullSlug nejsou u všech položek (Services/Showcases je nemají,
  // jen stránky), proto jsou volitelné.
  slug?: string
  fullSlug?: string
  title: string
  text?: string
  documentId?: string
  /** Cesta předků („Chorvatsko › Rijeka") z drobečků — kde výsledek leží. */
  path?: string
  /** URL úvodní fotky (originál — miniaturu z ní dělá next/image loader). */
  image?: string
  /** Kategorie stránky (např. „Praktické informace") pro štítek ve výpisu. */
  category?: string
}

export interface ShowcaseData {
  [key: string]: unknown
}

export interface ServiceData {
  showcases?: ShowcaseData[]
  [key: string]: unknown
}

export interface PageData {
  title?: string
  text?: string
  slug?: string
  fullSlug?: string
  services?: ServiceData[]
  [key: string]: unknown
}
