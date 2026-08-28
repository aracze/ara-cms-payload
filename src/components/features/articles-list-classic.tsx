import { Article } from '@/types/payload'
import { getArticleExcerpt, getArticleHref, getArticleImageUrl, getArticleKey } from '@/lib/utils'
import { ArticlesListClassicClient } from './articles-list-classic-client'
import type { ArticleCardVM } from './article-row'

// Klasický (vertikální) layout článků — podobný původnímu webu: články pod sebou
// (titulek + perex vlevo, náhled vpravo), vedle nich reklamní sloupec.
// SERVER komponenta: předpočítá VM + podtitulek, klientský ostrůvek řeší jen
// interaktivitu („zobrazit další"). Plná těla článků nejdou do prohlížeče.

interface ArticlesProps {
  articles: Article[]
  parentFullSlug?: string
  /** Lokativ destinace z `page.detail.locative` (např. „v Chorvatsku", „na Slovensku"). */
  destinationLocative?: string | null
}

export const ArticlesListClassic = ({
  articles: articlesProp,
  parentFullSlug,
  destinationLocative,
}: ArticlesProps) => {
  const articles = Array.isArray(articlesProp) ? articlesProp : articlesProp ? [articlesProp] : []

  if (articles.length === 0) return null

  const items: ArticleCardVM[] = articles.map((article, index) => ({
    key: getArticleKey(article, index),
    title: article.title,
    href: getArticleHref(article, parentFullSlug),
    excerpt: getArticleExcerpt(article),
    imageUrl: getArticleImageUrl(article),
  }))

  const place = destinationLocative?.replace(/^(ve?|na)\s+/i, '').trim()
  const subtitle = place
    ? `Zážitky, tipy a inspirace z cestování po ${place}.`
    : 'Zážitky, tipy a inspirace z cestování.'

  return <ArticlesListClassicClient items={items} subtitle={subtitle} />
}
