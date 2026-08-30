import { fetchFeedArticles } from '@/lib/payload'
import {
  absoluteUrl,
  DEFAULT_DESCRIPTION,
  resolveSeoDescription,
  RSS_PATH,
  RSS_TITLE,
} from '@/lib/seo'
import { getSiteURL } from '@/lib/utils'

/**
 * RSS 2.0 kanál nejnovějších článků (/feed.xml). Odkazuje na něj
 * `<link rel="alternate" type="application/rss+xml">` v hlavičce každé stránky
 * (RSS_ALTERNATE v src/lib/seo.ts). Čtečky, agregátory i AI vyhledávače tak
 * dostanou nové články bez procházení webu.
 *
 * Data drží `cached()` (tag `articles`/`pages`), route je dynamická jako zbytek
 * webu — při výpadku CMS propadne chyba (500), ne prázdný kanál.
 */
export const dynamic = 'force-dynamic'

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** RFC 822 datum, jak ho RSS vyžaduje („Tue, 12 Mar 2024 22:00:00 GMT"). */
function rfc822(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date.toUTCString()
}

export async function GET() {
  const site = getSiteURL()
  const articles = await fetchFeedArticles()

  const items = articles
    .map((a) => {
      const url = absoluteUrl(a.path)
      const description = resolveSeoDescription(a.meta, a.text)
      const pubDate = rfc822(a.publishedAt)
      return [
        '<item>',
        `<title>${escapeXml(a.title)}</title>`,
        `<link>${escapeXml(url)}</link>`,
        `<guid isPermaLink="true">${escapeXml(url)}</guid>`,
        pubDate ? `<pubDate>${pubDate}</pubDate>` : '',
        a.authorName ? `<dc:creator>${escapeXml(a.authorName)}</dc:creator>` : '',
        description ? `<description>${escapeXml(description)}</description>` : '',
        '</item>',
      ]
        .filter(Boolean)
        .join('')
    })
    .join('\n')

  const lastBuild = rfc822(articles[0]?.publishedAt ?? null) ?? new Date().toUTCString()

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
<title>${escapeXml(RSS_TITLE)}</title>
<link>${escapeXml(site)}</link>
<description>${escapeXml(DEFAULT_DESCRIPTION)}</description>
<language>cs</language>
<lastBuildDate>${lastBuild}</lastBuildDate>
<atom:link href="${escapeXml(`${site}${RSS_PATH}`)}" rel="self" type="application/rss+xml"/>
${items}
</channel>
</rss>
`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      // Čtečky se ptají často; čtvrt hodiny na CDN/klientu stačí, data se
      // invalidují při publikaci článku.
      'Cache-Control': 'public, max-age=900',
    },
  })
}
