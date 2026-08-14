import { NextRequest, NextResponse } from 'next/server'
import { getAffiliateTargets } from '@/lib/affiliate'

/**
 * Provizní redirect na DiscoverCars (karta „Půjčení auta“ v sekci
 * „Příprava do …“) — stejný vzor jako /go/ubytovani: vlastní důvěryhodná
 * adresa místo partnerské v odkazu, robots.txt /go/ vylučuje z procházení.
 *
 * Volitelná cesta za /go/auta/ = cesta na discovercars.com (stránka země,
 * příp. města z jejich Landing page generatoru, např. austria/vienna).
 * Bez cesty vede klik na českou homepage DiscoverCars. Hostitel je natvrdo
 * discovercars.com a cesta se validuje — otevřený redirect jinam nejde.
 *
 * Základní odkaz (vč. jazyka /cz a kódu a_aid) je editovatelný v adminu
 * (globál Homepage → Připrav se na cestu). Deep-link cesta se přidává jen
 * k adrese na discovercars.com — jiný cíl by ji nepochopil, tam se zahodí.
 */

// Stejný vzor jako /go/ubytovani: segment jen [a-z0-9._-], bez úvodní tečky.
const SEGMENT_PATTERN = /^[a-z0-9_-][a-z0-9._-]{0,80}$/i

export async function GET(_req: NextRequest, { params }: { params: Promise<{ cil?: string[] }> }) {
  const { carRentalUrl } = await getAffiliateTargets()
  const { cil } = await params
  const segments = cil ?? []

  const isValidPath =
    segments.length > 0 && segments.length <= 5 && segments.every((s) => SEGMENT_PATTERN.test(s))

  let base: URL
  try {
    base = new URL(carRentalUrl)
  } catch {
    return NextResponse.redirect(carRentalUrl, 302)
  }
  const isDiscoverCars =
    base.hostname === 'discovercars.com' || base.hostname.endsWith('.discovercars.com')

  if (isValidPath && isDiscoverCars) {
    // Cesta země/města se lepí za jazykovou verzi ze základu (typicky /cz);
    // query základu (a_aid) zůstává zachovaná.
    const localePath = base.pathname.replace(/\/+$/, '')
    base.pathname = `${localePath}/${segments.join('/')}`
  }

  return NextResponse.redirect(base.toString(), 302)
}
