import React from 'react'
import { Article as ArticleType, type Page as PayloadPage } from '@/types/payload'
import { articlePath, getPayloadURL, getSiteURL } from '@/lib/utils'
import { richTextToHtml } from '@/lib/rich-text-html'
import { articleJsonLd, resolveSeoDescription } from '@/lib/seo'
import { formatPublishDate } from '@/lib/relative-time'
import Link from 'next/link'
import { UserAvatar } from '@/components/user-avatar'
import { fetchPageLightByFullSlug, pageHasArticles, fetchArticleComments } from '@/lib/payload'
import {
  breadcrumbListJsonLd,
  buildBreadcrumbs,
  menuOwnerCategories,
  type Breadcrumb,
} from '@/lib/page-hierarchy'
import { breadcrumbsFromSlug, fetchAncestorChain } from '@/lib/page-ancestors'
import { Subnavigation } from '@/components/layout/page/subnavigation'
import { HeroSection } from '@/components/layout/page/hero-section'
import { ArticleAd } from '@/components/features/article-ad'
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
  // kterým visí (např. San Francisco), ne zemi z prvního segmentu URL.
  const placePage = await resolvePlacePage(contextPage, rootPage)

  // Kontext ale nemusí být místo — články visí i pod rubrikami („Rady na
  // cestu"). Stránka rubriky JE sama výpis článků (a kotvy #mista/#clanky na ní
  // nejsou), takže menu tvoří jen název rubriky jako aktivní odkaz zpět — parita
  // se starým webem.
  const placeIsMenuOwner = !!placePage?.category && menuOwnerCategories.includes(placePage.category)

  // Má kontextové místo články? Levný count (přes FK mainPage) místo tahání
  // celého pole článků těžkým fetchem — rozhoduje jen o záložce „Články".
  const placeHasArticles =
    placePage && placeIsMenuOwner ? await pageHasArticles(placePage.id) : false

  // Drobečky článku jdou po hierarchii v CMS a končí místem, pod kterým článek
  // visí (proto `includeSelf`) — u článku pod San Franciscem tedy
  // „USA / Kalifornie / San Francisco".
  const breadcrumbs = await getArticleBreadcrumbs(placePage)

  // Hero fotka ze STEJNÉHO místa jako menu a drobečky (legacy: obrázek článku,
  // jinak fotka nejbližšího místa).
  const heroImage = resolveHeroImage(placePage || contextPage, article)

  // Author (safe public subset from the backend virtual field)
  const author = article.createdByPublic ?? null
  const authorName = author ? author.name || author.username || null : null
  const profileHref = author?.username ? `/profil/${author.username}` : null
  const rawAvatar = author?.avatar?.url
  const authorBio = author?.description || null

  // Sdílený avatar (fotka, jinak papoušek fallback) — stejné markup pro variantu
  // s odkazem i bez, ať se needuplikuje.
  const authorAvatar = <UserAvatar name={authorName ?? ''} avatarUrl={rawAvatar} size={45} />

  const { threads, count: commentCount } = await commentsPromise

  // Kanonická adresa článku (mainPage + slug) — tu samou dává i generateMetadata,
  // takže strukturovaná data ukazují na stejnou URL jako `rel=canonical`.
  // Bez mainPage stejná cesta, jakou má generateMetadata (aktuální rodič z URL
  // = contextPage), ne nejbližší místo — JSON-LD a rel=canonical musí sedět.
  const canonicalHref = article.mainPage?.fullSlug
    ? articlePath(article.mainPage.fullSlug, article.slug)
    : contextPage
      ? articlePath(contextPage.fullSlug, article.slug)
      : null

  // Datum vydání — viditelně u autora a ve strukturovaných datech (Google
  // datum článku bere z JSON-LD, ale chce ho vidět i na stránce).
  const publishedIso = article.publishedAt ?? article.createdAt ?? null
  const publishDate = formatPublishDate(publishedIso)
  const publishedLine = publishDate && (
    <p className="text-sm text-gray-500">
      Publikováno <time dateTime={publishDate.dateTime}>{publishDate.text}</time>
    </p>
  )

  return (
    <div className="bg-white min-h-screen">
      {/* Strukturovaná data článku (schema.org Article): autor, datum vydání
          a aktualizace, fotka, vydavatel. */}
      {canonicalHref && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: articleJsonLd({
              title: article.title,
              description: resolveSeoDescription(article.meta, article.text),
              path: canonicalHref,
              imageUrl: heroImage.url,
              publishedAt: publishedIso,
              modifiedAt: article.updatedAt ?? null,
              author: authorName ? { name: authorName, profilePath: profileHref } : null,
            }),
          }}
        />
      )}
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
        imageAlt={heroImage.alt ?? undefined}
        styleCss={heroImage.styleCss}
        filterId={`blurFilter-article-${article.documentId}`}
        breadcrumbs={breadcrumbs}
      />

      {/* Subnavigation - keeps user in context of parent destination */}
      {placePage && (
        <Subnavigation
          contextTitle={placePage.title}
          contextFullSlug={placePage.fullSlug}
          // U rubriky žádné další položky — menu je jen aktivní odkaz zpět na výpis.
          pageChildren={placeIsMenuOwner ? (placePage.children?.docs ?? []) : []}
          currentPageFullSlug={placePage.fullSlug}
          hasPlaces={placeIsMenuOwner && (placePage.children?.docs?.length ?? 0) > 0}
          hasArticles={placeHasArticles}
          // Bez activeSection se zvýrazní samotný kontext (rubrika) — u místa
          // zůstává aktivní záložka „Články".
          activeSection={placeIsMenuOwner ? 'clanky' : undefined}
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
                  {publishedLine}
                  {authorBio && <p className="mt-1 leading-relaxed text-gray-600">{authorBio}</p>}
                </div>
              </div>
            )}
            {/* Bez autora aspoň samotné datum (dnes nemá autora žádný článek). */}
            {!authorName && publishedLine && (
              <div className="mt-8 border-t border-[#dadbdc] pt-5 pb-2.5">{publishedLine}</div>
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
          <CommentsSection
            articleId={article.id}
            threads={threads}
            count={commentCount}
            // Kam se vrátit po přihlášení z pruhu nad formulářem. Kanonická
            // adresa článku; kdyby chyběla, alespoň domů.
            backTo={canonicalHref ?? '/'}
          />
        </div>
      </div>
    </div>
  )
}

/**
 * Místo, kterému patří sekundární menu, drobečky i hero fotka článku = NEJBLIŽŠÍ
 * místo nad článkem (stejné pravidlo jako u podstránek a turistických cílů).
 *
 * Článek jde v CMS připojit k libovolné stránce (`mainPage` i vedlejší `pages`),
 * takže nad ním může být i stránka, která místem není (rubrika, informační
 * podstránka). Pak hledáme nejbližší místo v jejích předcích a teprve když žádné
 * není, spadneme na kořenovou stránku.
 */
async function resolvePlacePage(
  contextPage: PayloadPage | null,
  rootPage: PayloadPage | null,
): Promise<PayloadPage | null> {
  if (!contextPage) return rootPage

  if (contextPage.category && menuOwnerCategories.includes(contextPage.category)) {
    return contextPage
  }

  const ancestors = await fetchAncestorChain(contextPage.fullSlug)
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const ancestor = ancestors[i]
    if (
      !('isPlaceholder' in ancestor) &&
      ancestor.category &&
      menuOwnerCategories.includes(ancestor.category)
    ) {
      return ancestor
    }
  }

  return rootPage
}

/**
 * Drobečky článku končí místem, pod kterým visí (stejně jako u turistického
 * cíle). Hlavní cesta jde po hierarchii v CMS; když místu chybí uložený řetězec
 * `breadcrumbs` (starý import bez resave), dopočítáme předky z adresy a místo
 * přidáme na konec — stejná pojistka jako u stránek, ať drobečky ani
 * strukturovaná data nezmizí úplně.
 */
async function getArticleBreadcrumbs(placePage: PayloadPage | null): Promise<Breadcrumb[]> {
  if (!placePage) return []

  if (placePage.breadcrumbs?.length) {
    return buildBreadcrumbs(placePage, { includeSelf: true })
  }

  const ancestors = await breadcrumbsFromSlug(placePage.fullSlug)
  return [...ancestors, { title: placePage.title, href: placePage.fullSlug }]
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
      image?: { url?: string; alternativeText?: string | null } | null
      featureImageStyleCss?: string | null
    } | null
  } | null,
  article: ArticleType,
) {
  // Prefer article's own featured image (a populated media object), fall back to context page.
  const articleImage = article.featuredImage?.image
  const articleUrl = articleImage && typeof articleImage === 'object' ? articleImage.url : null
  const url = articleUrl ?? page?.featuredImage?.image?.url ?? null
  // Popisek ze STEJNÉ fotky jako URL (alt média z CMS), bez něj null → název článku.
  const alt = articleUrl
    ? (articleImage && typeof articleImage === 'object' && articleImage.alternativeText) || null
    : page?.featuredImage?.image?.alternativeText || null

  return {
    url: url ? (url.startsWith('/') ? `${getPayloadURL()}${url}` : url) : null,
    alt,
    // styleCss (ohnisko/pozice) musí pocházet ze STEJNÉHO obrázku jako `url` —
    // u fallbacku na obrázek stránky tedy z featuredImage stránky, ne z článku.
    styleCss: articleUrl
      ? article.featuredImage?.featureImageStyleCss || undefined
      : page?.featuredImage?.featureImageStyleCss || undefined,
  }
}
