import { NextRequest, NextResponse } from 'next/server'

/**
 * Provizní redirect na Booking.com přes síť CJ (karta „Rezervace ubytování“
 * v sekci „Příprava do …“). Vlastní /go/ adresa je tu kvůli důvěryhodnosti:
 * návštěvník při najetí na kartu vidí ara.cz/go/ubytovani/…, ne kryptické
 * tracking domény CJ (kqzyfj.com). Robots.txt /go/ vylučuje z procházení.
 *
 * Volitelná cesta za /go/ubytovani/ = cesta na booking.com (deep-link země
 * z CMS, např. country/gb.cs.html) — předává se CJ přes `?url=`, ověřeno, že
 * finální stránka pak nese živý aid + cjevent. Bez cesty vede klik na
 * homepage Bookingu. Cesta se validuje proti pevnému vzoru a hostitel je
 * natvrdo booking.com — z redirectu nejde udělat otevřený redirect jinam.
 */

/** CJ click link Booking.com (schváleno v CJ účtu uživatele 14. 8. 2026). */
const BOOKING_CJ_CLICK = 'https://www.kqzyfj.com/click-101533587-13386171'

// Segment smí být jen [a-z0-9._-], nesmí začínat tečkou (žádné "..") a cest
// je nejvýš pět — víc booking URL nemají a případný útok na délku to utne.
const SEGMENT_PATTERN = /^[a-z0-9_-][a-z0-9._-]{0,80}$/i

export async function GET(_req: NextRequest, { params }: { params: Promise<{ cil?: string[] }> }) {
  const { cil } = await params
  const segments = cil ?? []

  const isValidPath =
    segments.length > 0 && segments.length <= 5 && segments.every((s) => SEGMENT_PATTERN.test(s))

  const destination = isValidPath
    ? `${BOOKING_CJ_CLICK}?url=${encodeURIComponent(`https://www.booking.com/${segments.join('/')}`)}`
    : BOOKING_CJ_CLICK

  return NextResponse.redirect(destination, 302)
}
