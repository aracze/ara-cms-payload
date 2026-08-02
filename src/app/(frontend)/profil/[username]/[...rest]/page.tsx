import { permanentRedirect } from 'next/navigation'

/**
 * Staré podstránky profilu (legacy Grails: /profil/<username>/clanky, /mista,
 * /turisticke-cile, /recenze, /komentare, …) — nový profil má vše na jedné
 * stránce, takže trvale přesměrujeme na ni; známé sekce rovnou na kotvu.
 */

const SECTION_ANCHORS: Record<string, string> = {
  clanky: '#clanky',
  mista: '#mista',
  'turisticke-cile': '#turisticke-cile',
  'prakticke-informace': '#mista',
  recenze: '#recenze',
  komentare: '#komentare',
}

type Props = {
  params: Promise<{ username: string; rest: string[] }>
}

/** Segment může přijít zakódovaný i dekódovaný — normalizujeme na zakódovaný. */
function encodeUsernameSegment(raw: string): string {
  try {
    return encodeURIComponent(decodeURIComponent(raw))
  } catch {
    return encodeURIComponent(raw)
  }
}

export default async function LegacyProfileSubpage({ params }: Props) {
  const { username, rest } = await params
  // `Object.hasOwn` schválně: obyčejný objekt vrací i zděděné vlastnosti, takže
  // /profil/<jméno>/constructor by prošlo jako platná sekce a do adresy by se
  // vypsal zdrojový kód funkce (ověřeno, redirect vedl na nesmysl).
  const section = rest?.[0] ?? ''
  const anchor = Object.hasOwn(SECTION_ANCHORS, section) ? SECTION_ANCHORS[section] : ''
  permanentRedirect(`/profil/${encodeUsernameSegment(username)}${anchor}`)
}
