import { fetchRootPages } from '@/lib/payload'
import { Homepage } from '@/components/layout/homepage/homepage'

// Dynamické vykreslování jako zbytek webu (/[...slug]). PROČ ne ISR jako dřív:
// hlavička od zavedení přihlášení čte cookie, a stránku, která sáhne na cookie,
// nelze předgenerovat — build na tom padal („couldn't be rendered statically").
// Data to nezdražuje: fetchRootPages jde přes `cached()`, takže se z databáze
// nečte znovu, opakuje se jen React render.
export const dynamic = 'force-dynamic'

export default async function Home() {
  const { data } = await fetchRootPages()

  return <Homepage homepage={data?.homepage} />
}
