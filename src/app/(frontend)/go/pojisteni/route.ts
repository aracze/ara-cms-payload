import { NextResponse } from 'next/server'
import { getAffiliateTargets } from '@/lib/affiliate'

/**
 * Provizní redirect na srovnávač cestovního pojištění (karta „Cestovní
 * pojištění“). Cíl je editovatelný v adminu (globál Homepage → Připrav se na
 * cestu), výchozí je CJ odkaz na Klik.cz. ZÁMĚRNĚ dočasné přesměrování (302),
 * ať si prohlížeče a vyhledávače cíl necachují; robots.txt /go/ vylučuje
 * z procházení. (Dřív to řešil statický redirect v next.config.mjs — route
 * handler je tu kvůli čtení cíle z CMS.)
 */
export async function GET() {
  const { insuranceUrl } = await getAffiliateTargets()
  return NextResponse.redirect(insuranceUrl, 302)
}
