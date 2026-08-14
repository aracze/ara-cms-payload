import { NextRequest, NextResponse } from 'next/server'
import { getAffiliateTargets } from '@/lib/affiliate'

/**
 * Provizní redirect na zájezdy Invia (karta „Zájezdy“) — stejný vzor jako
 * /go/ubytovani a /go/auta: vlastní důvěryhodná adresa místo partnerské,
 * robots.txt /go/ vylučuje z procházení.
 *
 * Volitelná cesta za /go/zajezdy/ = cesta na invia.cz (deep-link destinace
 * z CMS, např. dovolena/chorvatsko/dubrovnik). Bez cesty vede klik na obecnou
 * nabídku. Hostitel se bere ze základního odkazu v adminu (globál Homepage →
 * Připrav se na cestu) a cesta se validuje — otevřený redirect jinam nejde.
 * Provizní parametry (aid) se přebírají ze základního odkazu, takže se řídí
 * z jednoho místa v adminu.
 */

// Stejný vzor jako ostatní /go/: segment jen [a-z0-9._-], bez úvodní tečky.
const SEGMENT_PATTERN = /^[a-z0-9_-][a-z0-9._-]{0,80}$/i

export async function GET(_req: NextRequest, { params }: { params: Promise<{ cil?: string[] }> }) {
  const { toursUrl } = await getAffiliateTargets()
  const { cil } = await params
  const segments = cil ?? []

  const isValidPath =
    segments.length > 0 && segments.length <= 5 && segments.every((s) => SEGMENT_PATTERN.test(s))

  let base: URL
  try {
    base = new URL(toursUrl)
  } catch {
    return NextResponse.redirect(toursUrl, 302)
  }
  const isInvia = base.hostname === 'invia.cz' || base.hostname.endsWith('.invia.cz')

  if (isValidPath && isInvia) {
    // Cesta destinace nahrazuje cestu základu; query (aid) zůstává. Lomítko
    // na konci je záměr — bez něj Invia ještě jednou přesměrovává.
    base.pathname = `/${segments.join('/')}/`
  }

  return NextResponse.redirect(base.toString(), 302)
}
