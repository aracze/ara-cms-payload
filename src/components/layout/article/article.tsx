import React from 'react'
import { Article as ArticleType } from '@/types/payload'
import { getPayloadURL, getSiteURL } from '@/lib/utils'
import { richTextToHtml } from '@/lib/rich-text-html'
import Link from 'next/link'
import { UserAvatar } from '@/components/user-avatar'
import { fetchPageLightByFullSlug, pageHasArticles, fetchArticleComments } from '@/lib/payload'
import { breadcrumbListJsonLd, buildBreadcrumbs, menuOwnerCategories } from '@/lib/page-hierarchy'
import { Subnavigation } from '@/components/layout/page/subnavigation'
import { HeroSection } from '@/components/layout/page/hero-section'
import { ArticleAd, AdSenseScript } from '@/components/features/article-ad'
import { ArticleActions } from '@/components/features/article-actions'
import { CommentsSection } from '@/components/features/comments/comments-section'

interface ArticleProps {
  article: ArticleType
  contextSlug?: string
}

export const Article: React.FC<ArticleProps> = async ({ article, contextSlug }) => {
  const articleText = richTextToHtml(article.text)

  // Komentáře rozjedeme SOUBĚŽNĚ s načítáním kontextových stránek (cachovaný
  // dotaz); počet potřebuje horní lišta (ArticleActions), seznam sekce dole.
  const commentsPromise = fetchArticleComments(article.id)

  // Resolve the context page (the page the user came from based on URL)
  const contextPageSlug = contextSlug || article.mainPage?.fullSlug?.replace(/^\//, '') || null
  const { contextPage, rootPage } = await resolveContextPages(contextPageSlug)

  // Článek se chová jako turistický cíl: sekundární menu patří MÍSTU, pod
  // kterým visí (např. San Francisco), ne zemi z prvního segmentu URL. Když
  // článek visí pod něčím jiným než místem (např. pod rubrikou), zůstává
  // dosavadní chování — menu kořenové stránky.
  const placePage =
    contextPage && contextPage.category && menuOwnerCategories.includes(contextPage.category)
      ? contextPage
      : rootPage

  // Má kontextové místo články? Levný count (přes FK mainPage) místo tahání
  // celého pole článků těžkým fetchem — rozhoduje jen o záložce „Články".
  const placeHasArticles = placePage ? await pageHasArticles(placePage.id) : false

  // Drobečky článku jdou po hierarchii v CMS a končí místem, pod kterým článek
  // visí (proto `includeSelf`) — u článku pod San Franciscem tedy
  // „USA / Kalifornie / San Francisco".
  const breadcrumbs = buildBreadcrumbs(placePage, { includeSelf: true })

  const heroImage = resolveHeroImage(contextPage || rootPage, article)

  // Author (safe public subset from the backend virtual field)
  const author = article.createdByPublic ?? null
  const authorName = author
    ? [author.firstName, author.lastName].filter(Boolean).join(' ') || author.username || null
    : null
  const profileHref = author?.username ? `/profil/${author.username}` : null
  const rawAvatar = author?.avatar?.url
  const authorBio = author?.description || null

  // Sdílený avatar (fotka, jinak papoušek fallback) — stejné markup pro variantu
  // s odkazem i bez, ať se needuplikuje.
  const authorAvatar = <UserAvatar name={authorName ?? ''} avatarUrl={rawAvatar} size={45} />

  const { threads, count: commentCount } = await commentsPromise

  // Kanonická adresa článku (mainPage + slug) — tu samou dává i generateMetadata,
  // takže strukturovaná data ukazují na stejnou URL jako `rel=canonical`.
  const canonicalHref = article.mainPage?.fullSlug
    ? `${article.mainPage.fullSlug}/${article.slug}`
    : placePage
      ? `${placePage.fullSlug}/${article.slug}`
      : null

  return (
    <div className="bg-white min-h-screen">
      {/* Drobečky pro vyhledávače (BreadcrumbList) — cesta ve výsledku hledání. */}
      {breadcrumbs.length > 0 && canonicalHref && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: breadcrumbListJsonLd(
              breadcrumbs,
              { title: article.title, href: canonicalHref },
              getSiteURL(),
            ),
          }}
        />
      )}
      {/* Article Header / Hero */}
      <HeroSection
        title={article.title}
        imageUrl={heroImage.url}
        styleCss={heroImage.styleCss}
        filterId={`blurFilter-article-${article.documentId}`}
        breadcrumbs={breadcrumbs}
      />

      {/* Subnavigation - keeps user in context of parent destination */}
      {placePage && (
        <Subnavigation
          contextTitle={placePage.title}
          contextFullSlug={placePage.fullSlug}
          pageChildren={placePage.children?.docs ?? []}
          // Sbalený odkaz „Praktické informace" bere z kořenové stránky (země) —
          // stejně jako podstránky a cíle pod nadřazeným místem.
          rootChildren={rootPage?.children?.docs ?? []}
          currentPageFullSlug={placePage.fullSlug}
          currentPageCategory={contextPage?.category}
          isSubPlace={!!rootPage && placePage.fullSlug !== rootPage.fullSlug}
          hasPlaces={(placePage.children?.docs?.length ?? 0) > 0}
          hasArticles={placeHasArticles}
          activeSection="clanky"
        />
      )}

      {/* Article Content + side advertisement (two-column on desktop) */}
      <div className="max-w-7xl mx-auto px-4 py-16 md:py-8">
        <div className="flex flex-col items-stretch lg:flex-row lg:justify-center gap-8 lg:gap-10">
          <main
            id="obsah"
            tabIndex={-1}
            className="flex-1 min-w-0 lg:max-w-[808px] lg:px-16 focus:outline-none"
          >
            {/* Už sanitizované HTML z richTextToHtml (DOMPurify) vkládáme přímo —
              odstavce tak zůstávají PŘÍMÝMI potomky .prose (kvůli
              `.prose > p:first-of-type`) a nadpisy mají id přímo z richTextToHtml
              (rehypeSlug byl proto zbytečný). */}
            <div
              className="reading-prose prose max-w-[808px] prose-a:text-[#215491] prose-a:no-underline hover:prose-a:underline"
              dangerouslySetInnerHTML={{ __html: articleText }}
            />

            {/* Attribution (Zdroj: ...) — right-aligned italic, like the legacy `p.attribution` */}
            {article.attribution && (
              <div
                className="mt-12 text-right text-sm italic text-gray-600 [&_a]:font-medium [&_a]:text-[#215491] [&_a]:no-underline hover:[&_a]:underline"
                dangerouslySetInnerHTML={{ __html: richTextToHtml(article.attribution) }}
              />
            )}

            {/* Author */}
            {authorName && (
              <div className="mt-8 flex items-start gap-4 border-t border-[#dadbdc] pt-5 pb-2.5">
                {profileHref ? (
                  <Link href={profileHref} className="shrink-0">
                    {authorAvatar}
                  </Link>
                ) : (
                  authorAvatar
                )}
                <div className="min-w-0">
                  {profileHref ? (
                    <Link
                      href={profileHref}
                      className="font-semibold text-[#215491] hover:underline"
                    >
                      {authorName}
                    </Link>
                  ) : (
                    <span className="font-semibold text-[#215491]">{authorName}</span>
                  )}
                  {authorBio && <p className="mt-1 leading-relaxed text-gray-600">{authorBio}</p>}
                </div>
              </div>
            )}

            {/* Comment count + "Vložit komentář" + "Sdílet" */}
            <ArticleActions commentCount={commentCount} />
          </main>

          {/* Side advertisements — desktop only, matches legacy `.sideAds`.
            The column stretches to the article height and is split into two halves;
            each ad is `sticky`, so the first pins in the upper half and the second
            takes over in the lower half (legacy `sideAds--first` / `sideAds--second`). */}
          <aside className="hidden lg:flex flex-col w-[340px] shrink-0">
            {/* AdSense loader — rendered once, shared by both ad boxes below. */}
            <AdSenseScript />
            <div className="flex-1">
              <ArticleAd variant="primary" className="sticky top-5" />
            </div>
            <div className="flex-1">
              <ArticleAd variant="secondary" className="sticky top-5 mt-10" />
            </div>
          </aside>
        </div>

        {/* Komentáře — zarovnané s textem článku (vlevo). Stejné centrování jako
            blok výše (max-w-[1188px] = main 808 + gap 40 + reklama 340); lg:pl-16
            posadí levý okraj karet na text článku. lg:pr-[170px] zkrátí pravý okraj
            do POLOVINY reklamy (340/2) — vzdušnější a lepší čitelnost než plná
            šířka. Na mobilu (bez lg) plná šířka. */}
        <div className="mt-12 lg:mx-auto lg:max-w-[1188px] lg:pl-16 lg:pr-[170px]">
          <CommentsSection articleId={article.id} threads={threads} count={commentCount} />
        </div>
      </div>
    </div>
  )
}

async function resolveContextPages(contextPageSlug: string | null) {
  if (!contextPageSlug) return { contextPage: null, rootPage: null }

  // Root = první segment slugu. Když je stejný jako celý slug, kontext JE kořen
  // → stačí jeden dotaz.
  // Používáme LEHKÝ fetch: detail článku potřebuje z (kořenové) stránky jen
  // menu/hero pole (title, fullSlug, category, children, featuredImage), NE plná
  // data stránky včetně všech jejích článků a enriche obrázků (to dělal těžký
  // fetchPageByFullSlug zbytečně). Počet článků pro záložku „Články" řešíme zvlášť
  // levným countem (pageHasArticles) v komponentě.
  const rootSlug = contextPageSlug.split('/')[0]
  if (rootSlug === contextPageSlug) {
    const { data } = await fetchPageLightByFullSlug(contextPageSlug)
    const contextPage = data?.pages[0] ?? null
    return { contextPage, rootPage: contextPage }
  }

  // Nezávislé dotazy běží paralelně (fetchPageLightByFullSlug je navíc dedup přes cache).
  const [ctxRes, rootRes] = await Promise.all([
    fetchPageLightByFullSlug(contextPageSlug),
    fetchPageLightByFullSlug(rootSlug),
  ])

  const contextPage = ctxRes.data?.pages[0] ?? null
  if (!contextPage) return { contextPage: null, rootPage: null }

  const rootPage = rootRes.data?.pages[0] ?? contextPage
  return { contextPage, rootPage }
}

function resolveHeroImage(
  page: {
    featuredImage?: {
      image?: { url?: string } | null
      featureImageStyleCss?: string | null
    } | null
  } | null,
  article: ArticleType,
) {
  // Prefer article's own featured image (a populated media object), fall back to context page.
  const articleImage = article.featuredImage?.image
  const articleUrl = articleImage && typeof articleImage === 'object' ? articleImage.url : null
  const url = articleUrl ?? page?.featuredImage?.image?.url ?? null

  return {
    url: url ? (url.startsWith('/') ? `${getPayloadURL()}${url}` : url) : null,
    // styleCss (ohnisko/pozice) musí pocházet ze STEJNÉHO obrázku jako `url` —
    // u fallbacku na obrázek stránky tedy z featuredImage stránky, ne z článku.
    styleCss: articleUrl
      ? article.featuredImage?.featureImageStyleCss || undefined
      : page?.featuredImage?.featureImageStyleCss || undefined,
  }
}
