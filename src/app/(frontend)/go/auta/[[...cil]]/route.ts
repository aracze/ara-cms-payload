import { NextRequest, NextResponse } from 'next/server'

/**
 * Provizní redirect na DiscoverCars (karta „Půjčení auta“ v sekci
 * „Příprava do …“) — stejný vzor jako /go/ubytovani: vlastní důvěryhodná
 * adresa místo partnerské v odkazu, robots.txt /go/ vylučuje z procházení.
 *
 * Volitelná cesta za /go/auta/ = cesta na discovercars.com/cz (stránka země,
 * příp. města z jejich Landing page generatoru, např. austria/vienna).
 * Bez cesty vede klik na českou homepage DiscoverCars. Hostitel je natvrdo
 * discovercars.com a cesta se validuje — otevřený redirect jinam nejde.
 * Affiliate kód `a_aid` doplňuje až tento handler.
 */

/** Česká verze DiscoverCars; partnerský kód uživatele (program DiscoverCars). */
const DISCOVERCARS_BASE = 'https://www.discovercars.com/cz'
const DISCOVERCARS_AFFILIATE_ID = 'aracz'

// Stejný vzor jako /go/ubytovani: segment jen [a-z0-9._-], bez úvodní tečky.
const SEGMENT_PATTERN = /^[a-z0-9_-][a-z0-9._-]{0,80}$/i

export async function GET(_req: NextRequest, { params }: { params: Promise<{ cil?: string[] }> }) {
  const { cil } = await params
  const segments = cil ?? []

  const isValidPath =
    segments.length > 0 && segments.length <= 5 && segments.every((s) => SEGMENT_PATTERN.test(s))

  const target = isValidPath ? `${DISCOVERCARS_BASE}/${segments.join('/')}` : DISCOVERCARS_BASE

  return NextResponse.redirect(`${target}?a_aid=${DISCOVERCARS_AFFILIATE_ID}`, 302)
}
