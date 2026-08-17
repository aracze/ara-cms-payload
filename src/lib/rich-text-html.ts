import DOMPurify from 'isomorphic-dompurify'
import { LEGEND_GROUPS, SUITABILITY_LABEL, type Suitability } from '@/lib/climate'

// Rendering Lexical rich-textu do (sanitizovaného) HTML. Vyčleněno z `utils.ts`,
// protože `isomorphic-dompurify` je těžká závislost a `utils.ts` importují i
// klientské komponenty (kvůli `cn`/`getArticle*`) — držením DOMPurify jen zde se
// nedostane do klientského bundlu. Tento modul je čistě serverový.

export type RichTextRenderContext = {
  currencyCode?: string | null
  exchangeRate?: number | null
  /** Časové pásmo stránky (vlastní nebo zděděné) pro kartu „Aktuální čas". */
  timezone?: string | null
  /** Už použitá heading id v rámci jednoho dokumentu (unikátnost kotev). */
  usedHeadingIds?: Set<string>
}

const CC_ICON_SVG =
  '<svg viewBox="0 0 640 640" aria-hidden="true" focusable="false"><path d="M317.8 278.9L284.6 296.2C275.2 276.6 259.4 276.3 257.1 276.3C235 276.3 223.9 290.9 223.9 320.1C223.9 343.7 233.1 363.9 257.1 363.9C271.6 363.9 281.7 356.8 287.7 342.6L318.3 358.1C312.1 369.6 292.6 397.1 253.2 397.1C230.6 397.1 179.2 386.8 179.2 320.1C179.2 261.4 222.2 243 251.8 243C282.5 243 304.5 254.9 317.8 278.9zM460.8 278.9L428 296.2C418.5 276.4 402.3 276.3 400.1 276.3C378 276.3 366.9 290.9 366.9 320.1C366.9 343.6 376.1 363.9 400.1 363.9C414.5 363.9 424.7 356.8 430.6 342.6L461.6 358.1C459.5 361.9 440.2 397.1 396.5 397.1C373.8 397.1 322.5 387.2 322.5 320.1C322.5 261.4 365.5 243 395.1 243C425.8 243 447.7 254.9 460.7 278.9zM319.6 72C176.7 72 72 187.1 72 320.1C72 458.5 185.6 568.1 319.6 568.1C449.5 568.1 568 467.2 568 320.1C568 182.2 461.4 72 319.6 72zM320.5 522.8C208 522.8 116.8 429.8 116.8 320C116.8 214.6 202.2 116.7 320.5 116.7C433 116.7 523.3 206.2 523.3 320C523.3 441.7 423.6 522.8 320.5 522.8z"/></svg>'

const allowedHeadingTags = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

/** Šířka fotky otevírané v lightboxu (delší strana na šířku 1600 px stačí i na 4k displeje se zoomem). */
const LIGHTBOX_MAX_WIDTH = 1600

function headingIdFromHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .trim()
    .toLowerCase()
    .replace(/ /g, '-')
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\-]/gu, '')
}

// Zajistí unikátní heading id v rámci dokumentu: opakovaný nadpis dostane
// příponu -2, -3 … (jinak by fragmentové odkazy skočily vždy na první výskyt).
function uniqueHeadingId(baseId: string, used?: Set<string>): string {
  if (!baseId || !used) return baseId
  let id = baseId
  let n = 2
  while (used.has(id)) {
    id = `${baseId}-${n}`
    n++
  }
  used.add(id)
  return id
}

/**
 * Convert a Lexical rich text JSON tree to an HTML string.
 * Falls back to returning the value as-is if it's already a string.
 */
export function richTextToHtml(value: unknown, context: RichTextRenderContext = {}): string {
  // Čerstvá sada heading id pro každé volání (= per dokument/pole).
  const ctx: RichTextRenderContext = {
    ...context,
    usedHeadingIds: context.usedHeadingIds ?? new Set<string>(),
  }
  const rawHtml = richTextToHtmlInternal(value, ctx)
  return DOMPurify.sanitize(rawHtml, {
    ADD_TAGS: ['iframe', 'section', 'svg', 'path', 'button'],
    ADD_ATTR: [
      'allowfullscreen',
      'frameborder',
      'target',
      'rel',
      'loading',
      'referrerpolicy',
      'srcset',
      'sizes',
      'aria-label',
      'aria-hidden',
      'focusable',
      'viewBox',
      'd',
    ],
  })
}

function richTextToHtmlInternal(value: unknown, context: RichTextRenderContext = {}): string {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return ''

  const node = value as Record<string, unknown>
  if ('root' in node) return richTextToHtmlInternal(node.root, context)

  const children = Array.isArray(node.children)
    ? (node.children as Record<string, unknown>[])
        .map((child) => richTextToHtmlInternal(child, context))
        .join('')
    : ''

  const type = node.type as string | undefined

  // Text leaf node
  if (type === 'text' || ('text' in node && typeof node.text === 'string')) {
    let text = escapeHtml(node.text as string)
    const format = (node.format as number) ?? 0
    if (format & 1) text = `<strong>${text}</strong>`
    if (format & 2) text = `<em>${text}</em>`
    if (format & 4) text = `<s>${text}</s>`
    if (format & 8) text = `<u>${text}</u>`
    if (format & 16) text = `<code>${text}</code>`
    return text
  }

  // Linebreak
  if (type === 'linebreak') return '<br/>'

  // Block nodes
  switch (type) {
    case 'table':
      return `<div class="rich-text-table-container"><table class="rich-text-table">${children}</table></div>`
    case 'tablerow':
      return `<tr class="rich-text-table-row">${children}</tr>`
    case 'tablecell': {
      const isHeader = (node.headerState as number) > 0
      const tag = isHeader ? 'th' : 'td'
      const className = isHeader ? 'rich-text-table-cell is-header' : 'rich-text-table-cell'
      return `<${tag} class="${className}">${children}</${tag}>`
    }
    case 'paragraph':
      return `<p>${children}</p>`
    case 'heading': {
      const rawTag = String((node.tag as string | undefined) || 'h2').toLowerCase()
      const tag = allowedHeadingTags.has(rawTag) ? rawTag : 'h2'
      const id = uniqueHeadingId(headingIdFromHtml(children), context.usedHeadingIds)
      const idAttr = id ? ` id="${id}"` : ''
      return `<${tag}${idAttr}>${children}</${tag}>`
    }
    case 'quote':
      return `<blockquote>${children}</blockquote>`
    case 'list': {
      const tag = (node.listType as string) === 'number' ? 'ol' : 'ul'
      return `<${tag}>${children}</${tag}>`
    }
    case 'listitem':
      return `<li>${children}</li>`
    case 'link': {
      const linkFields = node.fields as Record<string, unknown> | undefined
      const linkType = String((linkFields?.linkType as string | undefined) ?? '')
      const linkedDoc = linkFields?.doc as
        | { relationTo?: unknown; value?: unknown }
        | { fullSlug?: unknown; slug?: unknown }
        | number
        | string
        | undefined
      const docValue =
        linkedDoc && typeof linkedDoc === 'object' && 'value' in linkedDoc
          ? (linkedDoc as { value?: unknown }).value
          : linkedDoc
      const rawUrl =
        (linkFields?.url as string | undefined) ??
        (linkType === 'internal' && docValue && typeof docValue === 'object'
          ? String(
              (docValue as { fullSlug?: unknown }).fullSlug ??
                (docValue as { slug?: unknown }).slug ??
                '',
            )
          : undefined) ??
        (node.url as string | undefined) ??
        ''
      const newTab =
        (linkFields?.newTab as boolean | undefined) ?? (node.newTab as boolean | undefined) ?? false
      const normalizedUrl =
        linkType === 'internal' && rawUrl && !rawUrl.startsWith('/') ? `/${rawUrl}` : rawUrl
      const url = isSafeUrl(String(normalizedUrl)) ? escapeHtml(String(normalizedUrl)) : '#'
      const nofollow = Boolean(linkFields?.nofollow)
      const relTokens: string[] = []

      if (nofollow) {
        relTokens.push('nofollow')
      }

      if (newTab) {
        relTokens.push('noopener', 'noreferrer')
      }

      const target = newTab ? ' target="_blank"' : ''
      const rel = relTokens.length > 0 ? ` rel="${relTokens.join(' ')}"` : ''

      return `<a href="${url}"${target}${rel}>${children}</a>`
    }
    case 'upload': {
      const src = escapeHtml(
        String((node.value as Record<string, unknown>)?.url ?? (node.src as string) ?? ''),
      )
      const alt = escapeHtml(String((node.value as Record<string, unknown>)?.alt ?? ''))
      return src ? `<img src="${src}" alt="${alt}" />` : ''
    }
    case 'block': {
      const fields = node.fields as Record<string, unknown> | undefined
      if (fields?.blockType === 'contentImage') {
        const image = fields.image as Record<string, unknown> | undefined
        if (!image?.url) return ''
        const url = String(image.url)
        const alt = escapeHtml(String(image.alt ?? ''))
        const caption = String(fields.caption ?? '')
        const attribution = buildImageAttributionHtml(image)
        const cloudinaryMatch = url.match(
          /res\.cloudinary\.com\/([^/]+)\/image\/upload\/(?:v\d+\/)?(.+?)(?:\.[^.]+)?$/,
        )
        let html = ''
        if (cloudinaryMatch) {
          const [, cloudName, publicId] = cloudinaryMatch
          const base = `https://res.cloudinary.com/${cloudName}/image/upload`
          // Odkaz otevírá lightbox (PhotoSwipe, viz RichTextLightbox) — míří na
          // skutečně velkou verzi (c_limit malé originály nezvětšuje, f_auto/q_auto
          // nechá Cloudinary zvolit moderní formát a kvalitu).
          const fullUrl = `${base}/c_limit,w_${LIGHTBOX_MAX_WIDTH},f_auto,q_auto/${publicId}`
          const defaultUrl = `${base}/c_fit,w_790/${publicId}`
          const smallUrl = `${base}/c_fit,w_420/${publicId}`
          // PhotoSwipe potřebuje rozměry otevírané fotky dopředu (animace
          // z náhledu a rozvržení) — spočítáme je z rozměrů média v DB.
          const width = Number(image.width)
          const height = Number(image.height)
          let dimensionAttrs = ''
          if (width > 0 && height > 0) {
            const scale = Math.min(1, LIGHTBOX_MAX_WIDTH / width)
            dimensionAttrs = ` data-pswp-width="${Math.round(width * scale)}" data-pswp-height="${Math.round(height * scale)}"`
          }
          html = `<figure class="image-wrapper"><a href="${fullUrl}" rel="lightbox"${dimensionAttrs}><img alt="${alt}" src="${defaultUrl}" srcset="${smallUrl} 420w, ${defaultUrl} 747w" sizes="(min-width: 480px) calc(100vw - 60px), calc(100vw - 30px)" /></a>`
        } else {
          html = `<figure class="image-wrapper"><img src="${escapeHtml(url)}" alt="${alt}" />`
        }

        if (caption || attribution) {
          html += `<figcaption>`
          if (caption) {
            html += `<span class="image-caption">${escapeHtml(caption)}</span>`
          }
          if (attribution) {
            html += `<span class="image-attribution-tooltip"><button type="button" class="image-attribution-trigger" aria-label="Informace o licenci obrázku">${CC_ICON_SVG}</button><span class="image-attribution-content">${attribution}</span></span>`
          }
          html += `</figcaption>`
        }
        html += '</figure>'
        return html
      }
      if (fields?.blockType === 'promoBlock') {
        const content = richTextToHtmlInternal(fields.content, context)
        if (!content.trim()) return ''
        // Promo box = placený/komerční odkaz → doplníme rel="sponsored".
        const withSponsored = addRelToAnchors(content, 'sponsored')
        return `<div class="article-promo">${withSponsored}</div>`
      }
      if (fields?.blockType === 'mapBlock') {
        const rawIframeUrl = String(fields.iframeUrl ?? '').trim()
        if (!rawIframeUrl) return ''

        const iframeUrl = escapeHtml(rawIframeUrl)
        const caption = String(fields.caption ?? '')
        let html = `<div class="rich-text-map-container"><div class="rich-text-map-iframe-wrapper"><iframe src="${iframeUrl}" width="100%" height="100%" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>`
        if (caption) {
          html += `<p class="rich-text-map-caption">${escapeHtml(caption)}</p>`
        }
        html += '</div>'
        return html
      }
      if (fields?.blockType === 'seasonalityBlock') {
        const prefixText = String(fields.prefixText ?? '')
        const idealText = String(fields.idealMonthsText ?? '')
        const months = Array.isArray(fields.months) ? fields.months : []

        const monthLabels = [
          'Led',
          'Úno',
          'Bře',
          'Dub',
          'Kvě',
          'Čvn',
          'Čvc',
          'Srp',
          'Zář',
          'Říj',
          'Lis',
          'Pro',
        ]

        // Pořadí řádků v poli NENÍ zdroj pravdy — kalendářní měsíc určuje
        // `monthNumber` (redaktor umí řádky přetáhnout). Dřív se číslo bralo
        // z něj, ale popisek i barva z pozice v poli, takže po přeházení
        // ukazovala dlaždice „7" nad popiskem „Led".
        const byCalendar = monthsByCalendar(months)

        const html =
          `<div class="rich-text-seasonality-container">${idealText || prefixText ? `<div class="seasonality-ideal-text">${escapeHtml(prefixText)} <strong>${escapeHtml(idealText)}</strong></div>` : ''}<div class="seasonality-grid">` +
          byCalendar
            .map(
              (m, i) =>
                `<div class="seasonality-month status-${sanitizeSeasonalityStatus(m?.status)}"><div class="month-num">${i + 1}</div><div class="month-label">${monthLabels[i]}</div></div>`,
            )
            .join('') +
          `</div>${seasonalityLegendHtml(byCalendar, monthLabels)}</div>`
        return html
      }
      if (fields?.blockType === 'niceToKnowBlock') {
        const items = Array.isArray(fields.items) ? fields.items : []
        let html = `<div class="nice-to-know"><div class="nice-to-know__wrap">`
        items.forEach((item: any) => {
          const t = sanitizeNiceToKnowType(item.type)
          let headerHtml = ''
          let timeData: ReturnType<typeof getTimeDataForTimezone> | null = null

          if (t === 'language') {
            headerHtml = `<div class="nice-to-know-item__content__header"><div class="language-bubble">${escapeHtml(item.headerText || '')}${item.headerSubtext ? `<br/><span>${escapeHtml(item.headerSubtext)}</span>` : ''}</div></div>`
          } else if (t === 'electricity') {
            headerHtml = `<div class="nice-to-know-item__content__header"><img src="/assets/outlets/typeC.png" width="60" height="60" alt="Zásuvka" /></div>`
          } else if (t === 'currency') {
            const renderedCurrency = escapeHtml(context.currencyCode || '--')
            const renderedRate =
              typeof context.exchangeRate === 'number'
                ? `${context.exchangeRate.toLocaleString('cs-CZ', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })} CZK`
                : '-- CZK'
            headerHtml = `<div class="nice-to-know-item__content__header nice-to-know-item__content__header--currency nice-to-know-item__currency-card">
              <div class="nice-to-know-item__content__header--foreign">
                1 <span class="currency-card-code-value">${renderedCurrency}</span>
                <span class="circleArrow"></span>
              </div>
              <span class="currency-card-rate">${escapeHtml(renderedRate)}</span>
            </div>`
          } else if (t === 'weather') {
            headerHtml = `<div class="nice-to-know-item__content__header"><img src="/assets/information/weather-gray.svg" width="60" height="60" alt="Počasí" /></div>`
          } else if (t === 'population') {
            headerHtml = `<div class="nice-to-know-item__content__header"><img src="/assets/population.svg" width="60" height="60" alt="Počet obyvatel" /></div>`
          } else if (t === 'drivingSide') {
            // Legacy má dvě zrcadlené ikony podle strany, na které se jezdí —
            // rozpoznáme ji z textu hodnoty karty (podchytí "levé"/"levá"/
            // "vlevo" i "pravé"/"pravá"/"vpravo" jako podřetězec). Když text
            // neříká jasně ani jedno (nebo mluví o obou), ikonu raději
            // nezobrazíme, než abychom hádali špatnou stranu.
            const value = String(item.value || '')
            const isLeft = /lev/i.test(value)
            const isRight = /prav/i.test(value)
            const side = isLeft !== isRight ? (isLeft ? 'left' : 'right') : null
            headerHtml = side
              ? `<div class="nice-to-know-item__content__header"><img src="/assets/driving/${side}-side.svg" width="60" height="60" alt="Řízení" /></div>`
              : ''
          } else if (t === 'time') {
            // Prázdné políčko v bloku = pásmo stránky (vlastní nebo zděděné od
            // předka), jak slibuje popisek v adminu; Praha je až poslední záskok.
            // Bez tohoto řetězu ukazovala karta v textu pražský čas i tam, kde
            // panel vedle ní správně tikal místní (Rusko, Japonsko, Thajsko…).
            const tz = String(item.timezone || context.timezone || 'Europe/Prague')
            timeData = getTimeDataForTimezone(tz)
            headerHtml = `<div class="nice-to-know-item__content__header nice-to-know__item--time-header" data-timezone="${escapeHtml(
              tz,
            )}">
              <span class="nice-to-know-item__day">${escapeHtml(timeData.day)}</span>
              <span class="nice-to-know-item__time">${escapeHtml(timeData.time)}</span>
            </div>`
          }

          html += `<div class="nice-to-know-item nice-to-know__item--${t}"><div class="nice-to-know-item__content">${headerHtml}<div class="nice-to-know-item__body"><span class="nice-to-know-item__title">${escapeHtml(
            item.title || '',
          )}</span><span class="nice-to-know-item__value-wrap"><span>${escapeHtml(
            item.value || '',
          )}</span>${
            t === 'time' && timeData && timeData.offsetLabel
              ? ` <span class="nice-to-know-item__time-diff">${escapeHtml(
                  timeData.offsetLabel,
                )}</span>`
              : ''
          }</span></div></div></div>`
        })
        html += `</div></div>`
        return html
      }
      if (fields?.blockType === 'dailyCostsBlock') {
        const heading = escapeHtml(String(fields.heading ?? 'Denní náklady'))
        const columns = Array.isArray(fields.columns) ? fields.columns : []

        let html = `<section class="pi-budget"><h3 class="pi-budget__heading">${heading}</h3>`

        columns.forEach((column: any) => {
          const tier = sanitizeBudgetTier(column.tier)
          const rangeLabel = escapeHtml(String(column.rangeLabel ?? ''))
          const price = escapeHtml(String(column.price ?? ''))
          const items = Array.isArray(column.items) ? column.items : []

          html += `<div class="pi-budget-container"><div class="pi-budget-container__title pi-budget-container__title--${tier}"><div class="pi-budget-container__range"><h5>${rangeLabel}</h5></div><div class="pi-budget-container__price">${price}</div></div><ul class="pi-budget-container__list">${items
            .map(
              (item: any) =>
                `<li class="pi-budget-container__list__item">${escapeHtml(String(item?.text ?? ''))}</li>`,
            )
            .join('')}</ul></div>`
        })

        html += `</section>`
        return html
      }
      return children
    }
    default:
      return children
  }
}

function isSafeUrl(url: string): boolean {
  if (!url) return true
  const normalized = url.trim()
  if (normalized.startsWith('/') || normalized.startsWith('#') || normalized.startsWith('?')) {
    return true
  }
  return /^(https?|mailto|tel):/i.test(normalized)
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildImageAttributionHtml(image: Record<string, unknown>): string {
  const author = String(image.author ?? '').trim()
  const source = String(image.source ?? '').trim()
  const sourceLink = String(image.sourceLink ?? '').trim()
  const license = String(image.creativeCommonsLicense ?? '').trim()

  const parts: string[] = []

  if (author) {
    parts.push(`Foto: ${escapeHtml(author)}`)
  }

  if (source) {
    const renderedSource = sourceLink
      ? `<a href="${escapeHtml(sourceLink)}" target="_blank" rel="nofollow noopener noreferrer">${escapeHtml(source)}</a>`
      : escapeHtml(source)

    parts.push(renderedSource)
  } else if (sourceLink) {
    parts.push(
      `<a href="${escapeHtml(sourceLink)}" target="_blank" rel="nofollow noopener noreferrer">zdroj</a>`,
    )
  }

  if (license) {
    parts.push(escapeHtml(license))
  }

  return parts.join(' · ')
}

function sanitizeSeasonalityStatus(status: unknown): 'off' | 'shoulder' | 'mid' | 'peak' {
  if (status === 'mid' || status === 'peak' || status === 'off' || status === 'shoulder') {
    return status
  }
  return 'off'
}

/**
 * Řádky bloku srovnané do kalendáře: `byCalendar[0]` je vždy leden, ať jsou
 * v poli v jakémkoli pořadí. Rozhoduje `monthNumber`; řádek bez něj (nebo
 * s číslem mimo 1–12) padne na svou pozici v poli, aby se starší obsah
 * nerozsypal. Když je jedno číslo dvakrát, platí první výskyt — druhý by
 * jinak tiše přepsal cizí měsíc. Chybějící měsíc zůstane prázdný a vykreslí
 * se jako „mimo sezónu".
 */
function monthsByCalendar(months: unknown[]): ({ status?: unknown } | null)[] {
  const slots = new Array<{ status?: unknown } | null>(12).fill(null)
  const zbyle: { status?: unknown }[] = []

  months.slice(0, 12).forEach((raw) => {
    const row = (raw ?? {}) as { monthNumber?: unknown; status?: unknown }
    const n = typeof row.monthNumber === 'number' ? row.monthNumber : Number.NaN
    const index = Number.isInteger(n) && n >= 1 && n <= 12 ? n - 1 : -1
    if (index >= 0 && slots[index] === null) slots[index] = row
    else zbyle.push(row)
  })

  // Řádky bez použitelného čísla doplní první volné místo v kalendáři.
  for (const row of zbyle) {
    const volny = slots.indexOf(null)
    if (volny === -1) break
    slots[volny] = row
  }
  return slots
}

/** Stav bloku → stupeň škály. Dvě jména téhož: blok mluví sezónně, škála hodnotí. */
const STATUS_LEVEL: Record<'peak' | 'mid' | 'shoulder' | 'off', Suitability> = {
  peak: 'ideal',
  mid: 'good',
  shoulder: 'mid',
  off: 'poor',
}

/**
 * Měsíce stupně jako text: souvislý úsek dostane pomlčku („lis–bře"), rozsypané
 * měsíce čárky („kvě, čvn, zář"). Řada je KRUHOVÁ, aby zimní úsek přes přelom
 * roku nevyšel jako dva („lis, pro, led, úno, bře").
 */
function monthRangeLabel(indexes: number[], monthLabels: string[]): string {
  if (indexes.length === 0) return ''
  if (indexes.length === 12) return 'celý rok'
  const set = new Set(indexes)
  const zkratka = (i: number) => monthLabels[i].toLowerCase()

  // Začátek úseku je měsíc, jehož předchůdce ve stupni NENÍ.
  const starts = indexes.filter((i) => !set.has((i + 11) % 12))
  return starts
    .map((start) => {
      let length = 1
      while (set.has((start + length) % 12)) length++
      const end = (start + length - 1) % 12
      if (length === 1) return zkratka(start)
      if (length === 2) return `${zkratka(start)}, ${zkratka(end)}`
      return `${zkratka(start)}–${zkratka(end)}`
    })
    .join(', ')
}

/**
 * Legenda pod pruhem — SKLÁDÁ SE SAMA ze zaškrtnutých měsíců a ze škály
 * v `lib/climate.ts`, odkud ji bere i klimatický graf na stránkách počasí.
 * Dřív si ji redaktor psal ručně v adminu ke každé zemi, což se rozcházelo:
 * u Chorvatska pojmenovala „Období mimo sezónu (říjen–duben)" dva různé
 * stupně, ale nesla barvu jen toho horšího, a dvě zelené se obě jmenovaly
 * „hlavní". Stupeň bez jediného měsíce se vynechá, prázdná skupina taky.
 */
function seasonalityLegendHtml(
  byCalendar: ({ status?: unknown } | null)[],
  monthLabels: string[],
): string {
  const byLevel = new Map<Suitability, number[]>()
  byCalendar.forEach((m, i) => {
    const level = STATUS_LEVEL[sanitizeSeasonalityStatus(m?.status)]
    byLevel.set(level, [...(byLevel.get(level) ?? []), i])
  })

  const skupiny = LEGEND_GROUPS.map((group) => {
    const items = group.levels
      .filter((level) => (byLevel.get(level)?.length ?? 0) > 0)
      .map((level) => {
        const rozsah = monthRangeLabel(byLevel.get(level) ?? [], monthLabels)
        return (
          `<div class="legend-item status-${LEVEL_STATUS[level]}"><span class="legend-dot"></span>` +
          `<span class="legend-label"><strong>${escapeHtml(SUITABILITY_LABEL[level])}</strong>` +
          `${rozsah ? ` <span class="legend-time">(${escapeHtml(rozsah)})</span>` : ''}</span></div>`
        )
      })
      .join('')
    if (!items) return ''
    return `<div class="legend-group"><span class="legend-group-title">${escapeHtml(group.title)}</span>${items}</div>`
  }).join('')

  return skupiny ? `<div class="seasonality-legend">${skupiny}</div>` : ''
}

/** Opačný směr než STATUS_LEVEL — barvu tečky nese CSS třída podle stavu bloku. */
const LEVEL_STATUS: Record<Suitability, string> = {
  ideal: 'peak',
  good: 'mid',
  mid: 'shoulder',
  poor: 'off',
}

function sanitizeNiceToKnowType(
  type: unknown,
): 'language' | 'electricity' | 'currency' | 'weather' | 'time' | 'population' | 'drivingSide' {
  if (
    type === 'language' ||
    type === 'electricity' ||
    type === 'currency' ||
    type === 'weather' ||
    type === 'time' ||
    type === 'population' ||
    type === 'drivingSide'
  ) {
    return type
  }
  return 'language'
}

function sanitizeBudgetTier(type: unknown): 'budget' | 'midrange' | 'top' {
  if (type === 'budget' || type === 'midrange' || type === 'top') {
    return type
  }
  return 'budget'
}

function getTimeDataForTimezone(timeZone: string): {
  day: string
  time: string
  offsetLabel: string | null
} {
  const now = new Date()

  try {
    const day = now.toLocaleDateString('cs-CZ', { weekday: 'long', timeZone }).toUpperCase()
    const time = now.toLocaleTimeString('cs-CZ', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
    })

    const destinationOffset = getOffsetHours(timeZone, now)
    const pragueOffset = getOffsetHours('Europe/Prague', now)

    // Neznámý offset = null (ne „0h" — to by lhalo, že je stejný jako Praha).
    let offsetLabel: string | null = null
    if (destinationOffset !== null && pragueOffset !== null) {
      const diffHours = destinationOffset - pragueOffset
      const value = Number.isInteger(diffHours) ? `${diffHours}` : diffHours.toFixed(1)
      offsetLabel = `${diffHours >= 0 ? '+' : ''}${value}h`
    }

    return { day, time, offsetLabel }
  } catch {
    return { day: '', time: '--:--', offsetLabel: null }
  }
}

function getOffsetHours(timeZone: string, date: Date): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'shortOffset',
      hour: '2-digit',
    }).formatToParts(date)

    const offsetName = parts.find((part) => part.type === 'timeZoneName')?.value
    if (!offsetName) return null

    const match = offsetName.match(/^GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?$/)
    if (!match) return null

    const sign = match[1] === '-' ? -1 : 1
    const hours = Number(match[2] ?? 0)
    const minutes = Number(match[3] ?? 0)

    return sign * (hours + minutes / 60)
  } catch {
    return null
  }
}

/**
 * Sanitizace SVG loga do hlavičky (výplň sjednocená na bílou). Běží na SERVERU —
 * výsledek se předává klientskému Headeru jako hotový HTML string, aby se DOMPurify
 * nedostal do klientského bundlu.
 */
export function sanitizeHeaderLogoSvg(svgCode: string): string {
  // Sjednotí fill na bílou pro 3- i 6-místné hex barvy v jedno/dvojitých uvozovkách.
  const processed = svgCode.replace(/fill=(["'])#(?:[a-f0-9]{6}|[a-f0-9]{3})\1/gi, 'fill="white"')
  return DOMPurify.sanitize(processed, { USE_PROFILES: { svg: true } })
}

/**
 * Přidá `rel` token (např. "sponsored") do všech <a> v HTML řetězci — sjednocené
 * na jednom místě místo inline regexů. Bez duplikace už přítomného tokenu.
 */
export function addRelToAnchors(html: string, token: string): string {
  const hasToken = new RegExp(`\\b${token}\\b`)
  return html
    .replace(/(<a\b[^>]*\brel=")([^"]*)"/g, (_m, prefix, rel) =>
      hasToken.test(rel) ? `${prefix}${rel}"` : `${prefix}${rel} ${token}"`,
    )
    .replace(/(<a\b(?![^>]*\brel=)[^>]*)>/g, `$1 rel="${token}">`)
}
