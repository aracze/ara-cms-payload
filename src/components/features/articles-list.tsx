import { Article } from '@/types/payload'
import { getArticleExcerpt, getArticleHref, getArticleImageUrl, getArticleKey } from '@/lib/utils'
import { ArticlesRowsClient } from './articles-rows-client'
import type { ArticleCardVM } from './article-row'

interface ArticlesProps {
  articles: Article[]
  parentFullSlug?: string
}

// SERVER komponenta: předpočítá lehký VM (titulek, href, perex, obrázek) a předá
// ho klientskému ostrůvku. Plná těla článků (`text`) tak NEjdou přes RSC hranici
// do prohlížeče a perex se extrahuje na serveru, ne na klientovi.
export const ArticlesList = ({ articles: articlesProp, parentFullSlug }: ArticlesProps) => {
  // Ensure we have an array even if Payload returns a single object (due to relation type)
  const articles = Array.isArray(articlesProp) ? articlesProp : articlesProp ? [articlesProp] : []

  if (articles.length === 0) return null

  const items: ArticleCardVM[] = articles.map((article, index) => ({
    key: getArticleKey(article, index),
    title: article.title,
    href: getArticleHref(article, parentFullSlug),
    excerpt: getArticleExcerpt(article),
    imageUrl: getArticleImageUrl(article),
  }))

  return <ArticlesRowsClient items={items} />
}
