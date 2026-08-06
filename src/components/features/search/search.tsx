'use client'

import { HeaderSearch } from './header-search'
import { HomepageSearch } from './homepage-search'

interface SearchProps {
  variant?: 'header' | 'homepage'
  /** Jen pro variant="homepage" — název místa do nápovědy v poli hledání. */
  placeholderExample?: string | null
}

export default function Search({ variant = 'header', placeholderExample }: SearchProps) {
  if (variant === 'homepage') {
    return <HomepageSearch placeholderExample={placeholderExample} />
  }

  return <HeaderSearch />
}
