import type { Endpoint } from 'payload'
import { APIError } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import { XMLParser } from 'fast-xml-parser'
import { timingSafeEqual } from 'node:crypto'
import { safeRevalidate } from '@/hooks/revalidation'
import type { AffiliateDealKiwi, AffiliateDealInvia, AffiliateDeals } from '@/types/payload'

/**
 * Denní sync sekce „Akční nabídky": pro místa s vyplněným `affiliate.kiwiIataCode`
 * nebo `affiliate.inviaFeedUrl` stáhne nejlevnější letenku (Kiwi Tequila Search
 * API, ceny v CZK) a nejlevnější zájezd s odletem z Prahy (Invia XML feed)
 * a uloží je do JSON pole `affiliate.deals`.
 *
 * Stejný vzor jako /api/sync-analytics: spouští GitHub Actions cron
 * (.github/workflows/sync-affiliate-deals.yml) se sdíleným tajemstvím
 * ANALYTICS_SYNC_SECRET; zápis jde přímým SQL mimo Payload hooky (stránky mají
 * drafts — denní update přes Local API by sypal historii verzí), invalidace
 * cache se proto volá ručně přes revalidateTag.
 *
 * Selhání jednoho zdroje NEMAŽE minulá data: karta drží poslední úspěšně
 * staženou nabídku (chování starého webu) a chyba se jen vrátí v odpovědi.
 *
 * Kiwi kvóty: 30 dotazů/min + look-to-book ratio (1 rezervace / 5000 dotazů,
 * jinak hrozí vypnutí účtu) → mezi dotazy se čeká a sync se pouští 1× denně.
 */

/** Porovnání secretu časově konstantní — obyčejné `!==` by šlo uhodnout po znacích z doby odezvy. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const KIWI_DELAY_MS = 2100 // 30 dotazů/min → bezpečně pod kvótou
const INVIA_DELAY_MS = 500
const FETCH_TIMEOUT_MS = 30_000

/** Datum pro Kiwi API (dd/mm/yyyy). */
function kiwiDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

/** Nejlevnější letenka Praha → destinace v okně dnes až +6 měsíců, v CZK. */
async function fetchKiwiDeal(iataCode: string): Promise<AffiliateDealKiwi> {
  const apiKey = process.env.KIWI_TEQUILA_API_KEY
  if (!apiKey) throw new Error('KIWI_TEQUILA_API_KEY není nastaveno')

  const now = new Date()
  const to = new Date(now)
  to.setMonth(to.getMonth() + 6)
  const params = new URLSearchParams({
    fly_from: 'PRG',
    fly_to: iataCode,
    date_from: kiwiDate(now),
    date_to: kiwiDate(to),
    curr: 'CZK',
    sort: 'price',
    limit: '3',
  })
  const res = await fetch(`https://api.tequila.kiwi.com/v2/search?${params}`, {
    headers: { accept: 'application/json', apikey: apiKey },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`Kiwi API ${res.status}`)
  const json = (await res.json()) as {
    data?: { price?: number; deep_link?: string; local_departure?: string }[]
  }
  const flights = (json.data ?? []).filter(
    (f) => typeof f.price === 'number' && f.price > 0 && typeof f.deep_link === 'string',
  )
  if (flights.length === 0) throw new Error('Kiwi nevrátilo žádný let')
  // sort=price → první je nejlevnější; min je jen pojistka.
  const cheapest = flights.reduce((a, b) => (b.price! < a.price! ? b : a))
  return {
    price: Math.round(cheapest.price!),
    deepLink: cheapest.deep_link!,
    departureDate: (cheapest.local_departure ?? '').slice(0, 10),
  }
}

/** Tvar nabídky z Invia XML feedu (fast-xml-parser, viz isArray níže). */
type InviaOffer = {
  image?: { '#text'?: string } | string
  hotel?: string
  totalprice?: number | string
  url?: string
  food?: string
  destination?: { locality?: string; country?: string }
  term?: { from?: string; to?: string; length?: number | string }
  airports?: { airport?: string[] }
}

/** Jediný povolený zdroj Invia feedů (viz SSRF poznámka ve fetchInviaDeal). */
export function isAllowedInviaFeedUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'affil.invia.cz'
  } catch {
    return false
  }
}

const inviaXmlParser = new XMLParser({
  ignoreAttributes: true,
  // Pole, která mají být VŽDY pole (jinak parser jediný prvek zploští na objekt).
  isArray: (name, jpath) => jpath === 'offers.offer' || jpath === 'offers.offer.airports.airport',
})

/**
 * Nejlevnější zájezd s odletem z Prahy. Filtr odletu ve feedu není striktní
 * (i s nastavenou Prahou obsahuje nabídky jen z Krakova/Vídně), proto se Praha
 * vybírá až tady; bez pražské nabídky vrací null a karta se nezobrazí —
 * inzerovat Čechům „zájezd za X" s odletem z Vídně by bylo zavádějící.
 */
async function fetchInviaDeal(feedUrl: string): Promise<AffiliateDealInvia | null> {
  // Adresa feedu je editovatelný text z adminu a stahuje se server-side —
  // bez kontroly hosta by šla zneužít jako SSRF (požadavek na interní/cizí
  // adresu). Povolený je jen https feed přímo z affil.invia.cz; stejné
  // pravidlo hlídá i validace pole v kolekci Pages.
  if (!isAllowedInviaFeedUrl(feedUrl)) {
    throw new Error('Invia feed URL musí být https://affil.invia.cz/…')
  }
  const res = await fetch(feedUrl, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: 'error',
  })
  if (!res.ok) throw new Error(`Invia feed ${res.status}`)
  const xml = await res.text()
  const parsed = inviaXmlParser.parse(xml) as { offers?: { offer?: InviaOffer[] } }
  const offers = parsed.offers?.offer ?? []
  if (offers.length === 0) throw new Error('Invia feed neobsahuje žádné nabídky')

  const fromPrague = offers.filter((o) =>
    (o.airports?.airport ?? []).some((a) => String(a).trim() === 'Praha'),
  )
  if (fromPrague.length === 0) return null

  const cheapest = fromPrague.reduce((a, b) =>
    Number(b.totalprice ?? Infinity) < Number(a.totalprice ?? Infinity) ? b : a,
  )
  const price = Number(cheapest.totalprice)
  const deepLink = String(cheapest.url ?? '').trim()
  if (!Number.isFinite(price) || price <= 0 || !deepLink) {
    throw new Error('Invia nabídka nemá cenu nebo odkaz')
  }
  const photo = typeof cheapest.image === 'object' ? cheapest.image?.['#text'] : cheapest.image
  return {
    price: Math.round(price),
    deepLink,
    photoUrl: photo ? String(photo).trim() : null,
    hotel: String(cheapest.hotel ?? '').trim(),
    termFrom: String(cheapest.term?.from ?? '').trim(),
    days: Number(cheapest.term?.length ?? 0) || 0,
    food: cheapest.food ? String(cheapest.food).trim() : null,
  }
}

type DealPage = {
  id: number
  fullSlug?: string | null
  affiliate?: {
    kiwiIataCode?: string | null
    inviaFeedUrl?: string | null
    deals?: unknown
  } | null
}

type DrizzleTx = { execute: (query: unknown) => Promise<unknown> }
type DrizzleLike = DrizzleTx & {
  transaction: <T>(fn: (tx: DrizzleTx) => Promise<T>) => Promise<T>
}

/**
 * Rezervace běhu PŘED stahováním. Advisory lock v transakci chrání až samotný
 * zápis, takže dva souběžné požadavky (ruční běh přes ruční spuštění workflow
 * + noční cron) by nejdřív oba stáhly všechny nabídky — zbytečné dotazy proti
 * kvótě Kiwi. Web běží v JEDNOM kontejneru, takže na to stačí příznak v paměti
 * procesu; nastavuje se SYNCHRONNĚ před naplánováním práce, aby mezi kontrolou
 * a zabráním nevznikla mezera.
 *
 * Drží se čas startu, ne boolean: kdyby background úloha kvůli chybě nedoběhla
 * do finally (např. tvrdé ukončení uprostřed), po STALE_MS se rezervace uvolní
 * sama a sync se nezasekne napořád.
 */
let syncStartedAt: number | null = null
const SYNC_STALE_MS = 30 * 60 * 1000

function reserveSyncRun(): boolean {
  const now = Date.now()
  if (syncStartedAt !== null && now - syncStartedAt < SYNC_STALE_MS) return false
  syncStartedAt = now
  return true
}

export const syncAffiliateDealsEndpoint: Endpoint = {
  path: '/sync-affiliate-deals',
  method: 'post',
  handler: async (req) => {
    const secret = process.env.ANALYTICS_SYNC_SECRET
    const providedSecret = req.headers.get('x-sync-secret')
    const roles = Array.isArray(req.user?.roles) ? req.user?.roles : []
    const isAdmin = Boolean(req.user) && roles.includes('admin')
    // Spouští GitHub Actions cron bez session → sdílené tajemství (stejné jako
    // sync-analytics, ať na serveru nepřibývá další env). Přihlášený admin projde.
    if (!isAdmin && (!secret || !providedSecret || !safeEqual(providedSecret, secret))) {
      throw new APIError('Forbidden', 403)
    }
    const dryRun = new URL(req.url ?? '', 'http://localhost').searchParams.get('dryRun') === '1'

    // Jen publikované stránky s aspoň jedním vyplněným zdrojem nabídek —
    // overrideAccess: true obchází přístupová práva (a s nimi filtr draftů),
    // proto se _status hlídá explicitně.
    const pagesRes = await req.payload.find({
      collection: 'pages',
      overrideAccess: true,
      where: {
        and: [
          { _status: { equals: 'published' } },
          {
            or: [
              { 'affiliate.kiwiIataCode': { exists: true } },
              { 'affiliate.inviaFeedUrl': { exists: true } },
            ],
          },
        ],
      },
      depth: 0,
      limit: 0,
      pagination: false,
      select: { fullSlug: true, affiliate: true },
      joins: false,
    })
    const pages = (pagesRes.docs as unknown as DealPage[]).filter(
      (p) => p.affiliate?.kiwiIataCode?.trim() || p.affiliate?.inviaFeedUrl?.trim(),
    )

    // Souběžný běh se odmítne HNED, ještě před stahováním (viz reserveSyncRun).
    // Rezervace platí i pro dryRun: jinak by ladicí běh spuštěný během ostrého
    // syncu stáhl všechno podruhé a zbytečně ubral z kvóty Kiwi.
    if (!reserveSyncRun()) {
      throw new APIError('Sync už běží — zkus to za chvíli znovu', 409)
    }

    if (dryRun) {
      // Ladicí režim zůstává synchronní — volá se ručně a chce vidět výsledky.
      try {
        const { results, errors } = await collectDeals(pages)
        return Response.json({ ok: true, dryRun: true, pages: results, errors })
      } finally {
        syncStartedAt = null
      }
    }

    // Odpověď se vrací HNED (202) a práce doběhne na pozadí: sync trvá přes
    // minutu (rozestupy kvůli Kiwi kvótě) a Cloudflare utíná spojení po 100 s
    // — noční cron by tak svítil červeně, i když sync doběhl (HTTP 524,
    // zjištěno při nasazení 14. 8. 2026). `after` se importuje líně
    // s příponou ze stejného důvodu jako next/cache v revalidation.ts.
    const { after } = await import('next/server.js')
    after(async () => {
      try {
        const summary = await runSync(req, pages)
        console.log('[sync-affiliate-deals] hotovo:', JSON.stringify(summary))
      } catch (err) {
        console.error('[sync-affiliate-deals] selhal:', err)
      } finally {
        syncStartedAt = null
      }
    })
    return Response.json({ ok: true, accepted: true, pages: pages.length }, { status: 202 })
  },
}

/** Stažení nabídek pro všechny stránky (bez zápisu) — sdílí ostrý běh i dryRun. */
async function collectDeals(pages: DealPage[]): Promise<{
  results: { id: number; fullSlug: string | null; deals: AffiliateDeals }[]
  errors: string[]
}> {
  const errors: string[] = []
  const results: { id: number; fullSlug: string | null; deals: AffiliateDeals }[] = []

  // Sekvenčně s rozestupy — kvóta Kiwi (30/min) a slušnost k Invii. Jeden
  // Invia feed se může sdílet mezi stránkami (země + město) → cache po URL.
  const inviaCache = new Map<string, AffiliateDealInvia | null | Error>()
  for (const page of pages) {
    const previous = (page.affiliate?.deals ?? {}) as AffiliateDeals
    const deals: AffiliateDeals = { updatedAt: new Date().toISOString() }

    const iata = page.affiliate?.kiwiIataCode?.trim()
    if (iata) {
      try {
        deals.kiwi = await fetchKiwiDeal(iata)
      } catch (err) {
        deals.kiwi = previous.kiwi ?? null // selhání nemaže minulou nabídku
        errors.push(`${page.fullSlug} kiwi(${iata}): ${err instanceof Error ? err.message : err}`)
      }
      await sleep(KIWI_DELAY_MS)
    }

    const feedUrl = page.affiliate?.inviaFeedUrl?.trim()
    if (feedUrl) {
      if (!inviaCache.has(feedUrl)) {
        try {
          inviaCache.set(feedUrl, await fetchInviaDeal(feedUrl))
        } catch (err) {
          inviaCache.set(feedUrl, err instanceof Error ? err : new Error(String(err)))
        }
        await sleep(INVIA_DELAY_MS)
      }
      const cachedDeal = inviaCache.get(feedUrl)
      if (cachedDeal instanceof Error) {
        deals.invia = previous.invia ?? null
        errors.push(`${page.fullSlug} invia: ${cachedDeal.message}`)
      } else {
        deals.invia = cachedDeal ?? null
      }
    }

    results.push({ id: page.id, fullSlug: page.fullSlug ?? null, deals })
  }
  return { results, errors }
}

/** Ostrý běh: stažení + zápis + invalidace cache; souhrn jde do server logu. */
async function runSync(req: Parameters<Endpoint['handler']>[0], pages: DealPage[]) {
  const { results, errors } = await collectDeals(pages)

  // Přímý SQL zápis mimo hooky (viz hlavička souboru) — v jedné transakci
  // s try-advisory lockem. Souběh řeší primárně rezervace v paměti procesu
  // (reserveSyncRun); lock je druhá pojistka pro případ víc instancí appky.
  const db = req.payload.db as unknown as { drizzle: DrizzleLike }
  await db.drizzle.transaction(async (tx) => {
    const lockResult = (await tx.execute(
      sql`SELECT pg_try_advisory_xact_lock(hashtext('aracze:sync-affiliate-deals')) AS acquired`,
    )) as { rows: { acquired: boolean }[] }
    if (!lockResult.rows[0]?.acquired) {
      throw new Error('Sync už běží (souběžný požadavek) — tenhle běh se přeskakuje')
    }
    for (const r of results) {
      await tx.execute(
        sql`UPDATE pages SET affiliate_deals = ${JSON.stringify(r.deals)}::jsonb WHERE id = ${r.id}`,
      )
    }
  })

  // Zápis šel mimo hooky → invalidace cache stránek ručně (vzor revalidation.ts).
  await safeRevalidate([
    'pages',
    ...results.filter((r) => r.fullSlug).map((r) => 'page_' + r.fullSlug),
  ])

  return {
    pages: results.length,
    withKiwi: results.filter((r) => r.deals.kiwi).length,
    withInvia: results.filter((r) => r.deals.invia).length,
    errors,
  }
}
