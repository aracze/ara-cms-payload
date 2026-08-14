import 'dotenv/config'
import { getPayload } from 'payload'
import configPromise from '../src/payload.config'

/**
 * Jednorázový doběh: vyplní místům zdroje sekce „Akční nabídky" — Kiwi kód
 * destinace (`affiliate.kiwiIataCode`) a Invia XML feed (`affiliate.inviaFeedUrl`).
 *
 *   pnpm backfill:affiliate-deals            # dry-run: vypíše, co by zapsal
 *   pnpm backfill:affiliate-deals -- --apply # zapíše do CMS
 *
 * Invia feedy „<Destinace> – ara.cz" vznikly 14. 8. 2026 v affil.invia.cz
 * (Nástroje → XML feed → Uložené XML feedy; odlet z Prahy, 25 položek,
 * tracking Data1=akcni-nabidky). Adresy feedů nejsou tajemství — provizní
 * `aid` nesou až odkazy nabídek uvnitř feedu.
 *
 * Kiwi kódy: města mají IATA metro kód (LON, PAR, BCN), země kód země (HR…) —
 * Tequila Search API umí obojí. Samotná data nabídek pak stahuje denní sync
 * /api/sync-affiliate-deals (po tomto doběhu ho lze spustit ručně z GitHubu:
 * Actions → Sync affiliate deals → Run workflow).
 *
 * Po běhu na PRODUKCI force-recreate cms (cache mimo hooky, viz README).
 */

const APPLY = process.argv.includes('--apply')

const FEED = (id: string) => `https://affil.invia.cz/direct/core/tool_xml-feed/download/id/${id}/`

/** fullSlug stránky → zdroje nabídek. */
const DESTINATIONS: Record<string, { kiwi: string; inviaFeed: string | null }> = {
  '/chorvatsko': { kiwi: 'HR', inviaFeed: FEED('4745582-6a7ee4b5774b7') },
  '/recko': { kiwi: 'GR', inviaFeed: FEED('4745582-6a7ee8a1d7579') },
  '/bulharsko': { kiwi: 'BG', inviaFeed: FEED('4745582-6a7ee8b4bdce2') },
  '/turecko': { kiwi: 'TR', inviaFeed: FEED('4745582-6a7ee8c78f466') },
  '/egypt': { kiwi: 'EG', inviaFeed: FEED('4745582-6a7ee8da20c21') },
  '/tunisko': { kiwi: 'TN', inviaFeed: FEED('4745582-6a7ee8ecec9fc') },
  '/spanelsko': { kiwi: 'ES', inviaFeed: FEED('4745582-6a7ee8ffd2d7d') },
  '/italie': { kiwi: 'IT', inviaFeed: FEED('4745582-6a7ee9128bae0') },
  '/kypr': { kiwi: 'CY', inviaFeed: FEED('4745582-6a7ee9251162a') },
  '/malta': { kiwi: 'MT', inviaFeed: FEED('4745582-6a7ee937af7d6') },
  '/cerna-hora': { kiwi: 'ME', inviaFeed: FEED('4745582-6a7eea6daec5a') },
  '/maroko': { kiwi: 'MA', inviaFeed: FEED('4745582-6a7eea808d802') },
  // Feed se u Invie jmenuje „Kapverdské ostrovy" — stránka webu „Kapverdy".
  '/kapverdy': { kiwi: 'CV', inviaFeed: FEED('4745582-6a7eea9428ed0') },
  '/thajsko': { kiwi: 'TH', inviaFeed: FEED('4745582-6a7eeaa71e9ce') },
  '/sri-lanka': { kiwi: 'LK', inviaFeed: FEED('4745582-6a7eeaba27ad6') },
  // Anglie sdílí zdroje s Londýnem (letenky i zájezdy tam stejně míří) —
  // parita se starým webem, který měl LON na Anglii i Londýnu.
  '/anglie': { kiwi: 'LON', inviaFeed: FEED('4745582-6a7eeacda0eb5') },
  '/anglie/londyn': { kiwi: 'LON', inviaFeed: FEED('4745582-6a7eeacda0eb5') },
  '/francie/pariz': { kiwi: 'PAR', inviaFeed: FEED('4745582-6a7eeae12293b') },
  '/spanelsko/barcelona': { kiwi: 'BCN', inviaFeed: FEED('4745582-6a7eeaf4d6228') },
}

async function main() {
  const payload = await getPayload({ config: configPromise })

  const res = await payload.find({
    collection: 'pages',
    overrideAccess: true,
    where: { fullSlug: { in: Object.keys(DESTINATIONS) } },
    depth: 0,
    limit: 100,
    select: { title: true, fullSlug: true, affiliate: true },
    joins: false,
  })
  const bySlug = new Map(
    (
      res.docs as unknown as {
        id: number
        title: string
        fullSlug: string
        affiliate?: Record<string, unknown> | null
      }[]
    ).map((d) => [d.fullSlug, d]),
  )

  let written = 0
  for (const [fullSlug, src] of Object.entries(DESTINATIONS)) {
    const page = bySlug.get(fullSlug)
    if (!page) {
      console.warn(`CHYBÍ stránka ${fullSlug} — přeskočeno`)
      continue
    }
    console.log(
      `${APPLY ? 'ZAPISUJI' : 'dry-run'} ${page.title} (${fullSlug}): kiwi=${src.kiwi}, invia=${src.inviaFeed ? 'feed' : '—'}`,
    )
    if (!APPLY) continue

    await payload.update({
      collection: 'pages',
      id: page.id,
      depth: 0,
      overrideAccess: true,
      data: {
        affiliate: {
          // Skupina se posílá CELÁ (spread) — nesmí smazat toursUrl a spol.
          // z doběhu backfill-affiliate-links ani `deals` z denního syncu.
          ...(page.affiliate ?? {}),
          kiwiIataCode: src.kiwi,
          inviaFeedUrl: src.inviaFeed,
        },
      },
    })
    written++
  }

  console.log(APPLY ? `Hotovo, zapsáno ${written} stránek.` : 'Dry-run hotov (nic nezapsáno).')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
