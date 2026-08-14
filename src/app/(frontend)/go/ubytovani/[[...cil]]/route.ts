import { NextRequest, NextResponse } from 'next/server'
import { getAffiliateTargets } from '@/lib/affiliate'

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
 *
 * Základní CJ odkaz je editovatelný v adminu (globál Homepage → Připrav se
 * na cestu). Deep-link přes `?url=` umí jen CJ „click" odkazy — kdyby se
 * v adminu nastavil jiný cíl, cesta se zahodí a klik vede na něj napřímo.
 */

/** Tracking domény sítě CJ — jen na ně lze věšet `?url=` deep-link. */
const CJ_CLICK_HOSTS = ['kqzyfj.com', 'anrdoezrs.net', 'jdoqocy.com', 'tkqlhce.com']

// Segment smí být jen [a-z0-9._-], nesmí začínat tečkou (žádné "..") a cest
// je nejvýš pět — víc booking URL nemají a případný útok na délku to utne.
const SEGMENT_PATTERN = /^[a-z0-9_-][a-z0-9._-]{0,80}$/i

function isCjClickUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return CJ_CLICK_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))
  } catch {
    return false
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ cil?: string[] }> }) {
  const { accommodationUrl } = await getAffiliateTargets()
  const { cil } = await params
  const segments = cil ?? []

  const isValidPath =
    segments.length > 0 && segments.length <= 5 && segments.every((s) => SEGMENT_PATTERN.test(s))

  const destination =
    isValidPath && isCjClickUrl(accommodationUrl)
      ? `${accommodationUrl}?url=${encodeURIComponent(`https://www.booking.com/${segments.join('/')}`)}`
      : accommodationUrl

  return NextResponse.redirect(destination, 302)
}
