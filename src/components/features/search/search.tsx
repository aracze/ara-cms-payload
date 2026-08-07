'use client'

import { HeaderSearch } from './header-search'
import { HomepageSearch } from './homepage-search'

interface SearchProps {
  variant?: 'header' | 'homepage'
  /** Jen pro variant="homepage" — název místa do nápovědy v poli hledání. */
  placeholderExample?: string | null
  /**
   * Jen pro variant="homepage" — pole stojí na SVĚTLÉM podkladu, ne na hero
   * fotce. Dokreslí mu obrys; bez něj by na bílé splynulo s pozadím, protože
   * hranici pole tam jinak dělá jen stín. Používají chybové stránky.
   */
  onLightSurface?: boolean
}

export default function Search({
  variant = 'header',
  placeholderExample,
  onLightSurface,
}: SearchProps) {
  if (variant === 'homepage') {
    return (
      <HomepageSearch placeholderExample={placeholderExample} onLightSurface={onLightSurface} />
    )
  }

  return <HeaderSearch />
}
