import { PageCategory, PracticalInfoSection, RichTextRoot } from '@/types/payload'
import { richTextToHtml, type RichTextRenderContext } from './rich-text-html'

/**
 * Složená stránka „Praktické informace" — jedna dlouhá stránka poskládaná
 * z textů sousedních podstránek místa (Vstupní podmínky, Měna a ceny…),
 * stejně jako na starém webu (taglib displayTextsFromOtherPages).
 */

// Pořadí sekcí podle toho, jak se cesta plánuje (rozhodnutí uživatele
// 5. 9. 2026): podmínky vstupu a kdy jet, pak cesta a doprava, ubytování,
// peníze a jídlo, nakonec zdraví a kultura. Starý web řadil Ubytování první
// a Počasí poslední (nejdelší sekce) — Počasí je proto druhé, ne první, aby
// čtenář nemusel přes dlouhý text scrollovat k ostatním. Nadpisy sekcí jako
// na starém webu; kategorie bez `title` používají název podstránky z CMS
// (Ubytování, Cesta).
const sectionDefs: { category: PageCategory; title?: string }[] = [
  { category: PageCategory.Vstupni_podminky, title: 'Vstupní podmínky' },
  { category: PageCategory.Pocasi, title: 'Počasí a doba návštěvy' },
  { category: PageCategory.Cesta },
  { category: PageCategory.Doprava, title: 'Cestování a doprava' },
  { category: PageCategory.Ubytovani },
  { category: PageCategory.Mena_a_ceny, title: 'Měna a ceny' },
  { category: PageCategory.Jidlo_a_pit, title: 'Jídlo a pití' },
  { category: PageCategory.Zdravi_a_bezpeci, title: 'Zdraví a bezpečí' },
  { category: PageCategory.Jazyk_a_kultura, title: 'Jazyk a kultura' },
]

/** Kategorie podstránek, ze kterých se skládá stránka Praktické informace. */
export const practicalInfoSectionCategories = sectionDefs.map((def) => def.category)

// Kotvy sekcí jsou ASCII (bez diakritiky) — jsou to sdílitelné adresy
// (…/prakticke-informace#mena-a-ceny) a míří na ně i karta kurzu v pravém
// sloupci míst. ID běžných nadpisů uvnitř textů diakritiku drží (konvence
// richTextToHtml) — obě sady se díky tomu skoro nepotkají a zbytek ohlídá
// sdílený set usedHeadingIds.
function sectionAnchor(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Nadpisy uvnitř textů podstránek posuneme o úroveň níž (h2→h3…), aby
// nekolidovaly s nadpisy sekcí (h2) — osnova stránky i obsah v pravém sloupci
// pak drží hierarchii sekce → podkapitola. Od nejhlubší úrovně, ať se nic
// neposune dvakrát; případné h1 v obsahu spadne rovnou pod sekci (h3).
function demoteHeadings(html: string): string {
  return html
    .replace(/<(\/?)h5(?=[\s>])/gi, '<$1h6')
    .replace(/<(\/?)h4(?=[\s>])/gi, '<$1h5')
    .replace(/<(\/?)h3(?=[\s>])/gi, '<$1h4')
    .replace(/<(\/?)h2(?=[\s>])/gi, '<$1h3')
    .replace(/<(\/?)h1(?=[\s>])/gi, '<$1h3')
}

/**
 * Poskládá HTML stránky Praktické informace: vlastní text stránky (úvod,
 * karty Nice-to-know) + sekce z podstránek v legacy pořadí. Nadpis každé
 * sekce je odkaz na samostatnou podstránku (jako na starém webu) a má
 * stabilní ASCII kotvu. Výsledek jde přes MainContent, kde se znovu
 * sanitizuje (string projde richTextToHtml beze změny) a krmí obsah
 * v pravém sloupci.
 */
export function composePracticalInfoHtml(
  ownText: string | RichTextRoot | null | undefined,
  sections: PracticalInfoSection[],
  // Tvar kontextu sdílíme s richTextToHtml, ať se při přidání dalšího pole
  // (jako se stalo s pásmem) nemusí měnit dvě definice.
  context: Omit<RichTextRenderContext, 'usedHeadingIds'> = {},
): string {
  const present = sectionDefs
    .map((def) => {
      const page = sections.find((section) => section.category === def.category)
      return page ? { page, title: def.title ?? page.title } : null
    })
    .filter((entry): entry is { page: PracticalInfoSection; title: string } => entry !== null)

  // Kotvy sekcí rezervujeme PŘEDEM — kdyby některý text obsahoval nadpis se
  // stejným id jako pozdější sekce, dostane příponu -2 on, ne sekce.
  const usedHeadingIds = new Set<string>(present.map(({ title }) => sectionAnchor(title)))

  const parts: string[] = []
  const ownHtml = richTextToHtml(ownText, { ...context, usedHeadingIds })
  if (ownHtml) parts.push(ownHtml)

  for (const { page, title } of present) {
    const body = demoteHeadings(richTextToHtml(page.text, { ...context, usedHeadingIds }))
    parts.push(
      `<h2 id="${sectionAnchor(title)}"><a href="${escapeHtml(page.fullSlug)}">${escapeHtml(title)}</a></h2>`,
      body,
    )
  }

  return parts.join('')
}
