import type { Endpoint } from 'payload'
import { APIError } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import { XMLParser } from 'fast-xml-parser'
import { timingSafeEqual } from 'node:crypto'
import { safeRevalidate } from '@/hooks/revalidation'
import type {
  AffiliateDealKiwi,
  AffiliateDealInvia,
  AffiliateDeals,
  HomepageTourDeal,
  HomepageTourDeals,
} from '@/types/payload'

/**
 * Denní sync sekce „Akční nabídky": pro místa s vyplněným `affiliate.kiwiIataCode`
 * nebo `affiliate.inviaFeedUrl` stáhne nejlevnější letenku (Kiwi Tequila Search
 * API, ceny v CZK) a nejlevnější zájezd s odletem z Prahy (Invia XML feed)
 * a uloží je do JSON pole `affiliate.deals`. Navíc plní dlaždice zájezdů sekce
 * „Dnešní akční nabídky" na homepage z kurátorovaného feedu (globál Homepage →
 * `dealsOfDay`, viz fetchHomepageTourDeals) — zapisuje se stejným přímým SQL
 * ve stejné transakci jako stránky (updateGlobal by přes hook globálů shazoval
 * cache menu a patičky celého webu, běžel validace nad cizími poli a vracel by
 * do globálu URL feedu přečtenou na začátku několikaminutového běhu).
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

/**
 * Dálková destinace = leží mimo Evropu. Bere se z PRVNÍHO drobečku stránky
 * (kontinent, např. `/asie`), ne ze seznamu kódů: pole `Kiwi Fly To` přijímá
 * kódy zemí i měst (LON, PAR, BCN) a proti seznamu kódů by se dálkové MĚSTO
 * (BKK, NYC) tiše vyhodnotilo jako blízké a dostalo okno na tři noci.
 */
const EUROPE_CRUMB = '/evropa'

function isLongHaul(page: DealPage): boolean {
  const continent = page.breadcrumbs?.[0]?.url?.trim().toLowerCase()
  // Bez drobečků radši kratší okno — širší by u evropské destinace vypadlo
  // jako „nejlevnější letenka na tři týdny", což nedává smysl.
  return Boolean(continent) && continent !== EUROPE_CRUMB
}

/**
 * Nejlevnější ZPÁTEČNÍ letenka Praha ⇄ destinace v okně dnes až +6 měsíců,
 * v CZK. Zpáteční (ne jednosměrná) záměrně: cena je to, co člověk opravdu
 * zaplatí, sedí k ceně zájezdu na vedlejší kartě a provize se počítá
 * z rezervace — jednosměrná cena láká na klik, ale po zjištění celkové ceny
 * odrazuje (rozhodnutí uživatele 15. 8. 2026).
 */
async function fetchKiwiDeal(iataCode: string, longHaul: boolean): Promise<AffiliateDealKiwi> {
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
    // Délka pobytu = zároveň přepínač na zpáteční hledání (bez ní vrací
    // Kiwi jednosměrné lety). Okno je široké schválně — čím víc kombinací,
    // tím nižší nalezená cena; užší okno cenu zvedá bez užitku.
    nights_in_dst_from: longHaul ? '7' : '3',
    nights_in_dst_to: longHaul ? '21' : '14',
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
    data?: {
      price?: number
      deep_link?: string
      local_departure?: string
      nightsInDest?: number | null
    }[]
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
    // Celé noci: zlomek by se vykreslil jako „3.5 nocí".
    nights:
      Number.isInteger(cheapest.nightsInDest) && (cheapest.nightsInDest as number) > 0
        ? (cheapest.nightsInDest as number)
        : null,
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
  transportation?: string
  /** Sleva v procentech (celé číslo, 0 = bez slevy). */
  discount?: number | string
  hotelinfo?: { id?: number | string }
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

/** Stažení a rozparsování Invia feedu (sdílí karty destinací i homepage). */
async function fetchInviaOffers(feedUrl: string): Promise<InviaOffer[]> {
  // Adresa feedu je editovatelný text z adminu a stahuje se server-side —
  // bez kontroly hosta by šla zneužít jako SSRF (požadavek na interní/cizí
  // adresu). Povolený je jen https feed přímo z affil.invia.cz; stejné
  // pravidlo hlídá i validace polí (kolekce Pages, globál Homepage).
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
  return offers
}

/** Odlet z Prahy — filtr feedu není striktní, Praha se vybírá až u nás. */
const isFromPrague = (o: InviaOffer) => (o.airports?.airport ?? []).some((a) => text(a) === 'Praha')

/**
 * Česká letiště tak, jak je pojmenovává Invia feed. Homepage dlaždice berou
 * odlet z kteréhokoli z nich (rozhodnutí uživatele 28. 8. 2026 — Brno/Ostrava
 * jsou pro české návštěvníky stejně dobré jako Praha); feed obsahuje i Krakov,
 * Katovice, Vídeň, Bratislavu, které se vyřazují.
 */
const CZECH_AIRPORTS = ['Praha', 'Brno', 'Ostrava', 'Pardubice', 'Karlovy Vary']

/** Odletové letiště v ČR pro dlaždici: Praha má přednost, jinak první české; null = žádné. */
function czechDeparture(o: InviaOffer): string | null {
  const airports = (o.airports?.airport ?? []).map(text)
  if (airports.includes('Praha')) return 'Praha'
  return airports.find((a) => CZECH_AIRPORTS.includes(a)) ?? null
}

/**
 * Textová hodnota z feedu: trim + oprava dvojitě zakódovaného ampersandu
 * („Resort &amp;Amp; Spa" → po XML dekódování „&Amp;") — chyba dat Invie, která
 * se může objevit v kterémkoli textovém poli, proto jde každý text tudy.
 */
const text = (value: unknown): string =>
  String(value ?? '')
    .replace(/&amp;/gi, '&')
    .trim()

/** Datum termínu jen v ISO tvaru (YYYY-MM-DD) — web podle něj porovnáním
 * řetězců filtruje propadlé zájezdy, jiný formát by tam tiše selhal. */
const isoDate = (value: unknown): string | null => {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(text(value))
  return match ? match[1] : null
}

/**
 * Nabídka z feedu → tvar karty zájezdu (sdílí karty destinací i homepage).
 * null = nabídka se nedá poctivě vykreslit: bez ceny, bez https odkazu (web
 * při čtení jiný než https deep-link zahazuje — viz isValidDeal) nebo bez
 * ISO termínu.
 */
function mapInviaOffer(o: InviaOffer): AffiliateDealInvia | null {
  const price = Number(o.totalprice)
  const deepLink = text(o.url)
  const termFrom = isoDate(o.term?.from)
  if (!Number.isFinite(price) || price <= 0 || !deepLink.startsWith('https://') || !termFrom) {
    return null
  }
  const photo = typeof o.image === 'object' ? o.image?.['#text'] : o.image
  return {
    price: Math.round(price),
    deepLink,
    photoUrl: text(photo) || null,
    hotel: text(o.hotel),
    termFrom,
    days: Number(o.term?.length ?? 0) || 0,
    food: text(o.food) || null,
  }
}

/**
 * Nejlevnější zájezd s odletem z Prahy. Filtr odletu ve feedu není striktní
 * (i s nastavenou Prahou obsahuje nabídky jen z Krakova/Vídně), proto se Praha
 * vybírá až tady; bez pražské nabídky vrací null a karta se nezobrazí —
 * inzerovat Čechům „zájezd za X" s odletem z Vídně by bylo zavádějící.
 */
async function fetchInviaDeal(feedUrl: string): Promise<AffiliateDealInvia | null> {
  const offers = await fetchInviaOffers(feedUrl)

  const fromPrague = offers.filter(isFromPrague)
  if (fromPrague.length === 0) return null

  const deals = fromPrague.map(mapInviaOffer).filter((d): d is AffiliateDealInvia => d !== null)
  if (deals.length === 0) throw new Error('Invia nabídka nemá cenu, odkaz nebo termín')
  return deals.reduce((a, b) => (b.price < a.price ? b : a))
}

/** Pojistka proti bobtnání JSON v globálu — feed má desítky položek, po
 * filtru leteckých z ČR zbývá typicky 10–15; web z nich kreslí 4. */
const HOMEPAGE_TOURS_STORE_LIMIT = 20

/**
 * Výběr zájezdů pro dlaždice „Dnešní akční nabídky" na homepage z Inviou
 * kurátorovaného feedu (defaultní cílení = trháky z úvodky invia.cz). Feed
 * střídá letecké zájezdy k moři s horskými pobyty vlastní dopravou (Tatry,
 * Alpy) bez slevy — pro web o cestách do dalekých zemí se berou jen letecké
 * s odletem z českého letiště (viz CZECH_AIRPORTS), řazené podle výše slevy
 * (rozhodnutí uživatele 28. 8. 2026).
 * Duplicitní hotely (stejný hotel ve víc termínech) drží jen nejvýhodnější
 * termín. Ukládají se VŠICHNI kandidáti: propadlé termíny a pestrost destinací
 * řeší až web při čtení (fetchTopAffiliateDeals) — kdyby se pořadí skládalo
 * tady, po vypršení prvních termínů by na webu přestalo odpovídat slevám.
 * Prázdný výběr je chyba (minulá data zůstávají), ne platný výsledek.
 */
async function fetchHomepageTourDeals(feedUrl: string): Promise<HomepageTourDeal[]> {
  const offers = await fetchInviaOffers(feedUrl)

  const candidates: { deal: HomepageTourDeal; hotelId: string }[] = []
  for (const o of offers) {
    if (text(o.transportation).toLowerCase() !== 'letecky') continue
    const departure = czechDeparture(o)
    if (!departure) continue
    const base = mapInviaOffer(o)
    const country = text(o.destination?.country)
    // Bez země není co napsat do titulku dlaždice.
    if (!base || !country) continue
    // Sleva je ve feedu celé procento; cokoli mimo 0–100 (NaN, poměr, záporné)
    // se bere jako „bez slevy", ať se nevykreslí štítek „−1 %".
    const discount = Math.round(Number(o.discount))
    candidates.push({
      deal: {
        ...base,
        country,
        locality: text(o.destination?.locality) || null,
        discount: Number.isFinite(discount) && discount > 0 && discount <= 100 ? discount : 0,
        departure,
      },
      hotelId: text(o.hotelinfo?.id),
    })
  }
  if (candidates.length === 0) {
    throw new Error('Invia feed neobsahuje žádný letecký zájezd s odletem z ČR')
  }

  // Nejvýhodnější nabídka první: podle slevy, při shodě podle ceny.
  candidates.sort((a, b) => b.deal.discount - a.deal.discount || a.deal.price - b.deal.price)

  // Dedup hotelů: stejný hotel bývá ve feedu ve víc termínech. Klíč je id
  // hotelu z feedu, bez něj jméno + lokalita; nabídka bez jména hotelu se
  // nesmí slít s ostatními bezejmennými, proto pro ni platí deep-link.
  // Díky řazení výše vyhrává termín s největší slevou.
  const byHotel = new Map<string, HomepageTourDeal>()
  for (const { deal, hotelId } of candidates) {
    const key = hotelId
      ? `id:${hotelId}`
      : deal.hotel
        ? `${deal.hotel}|${deal.locality ?? ''}`
        : `link:${deal.deepLink}`
    if (!byHotel.has(key)) byHotel.set(key, deal)
  }
  return [...byHotel.values()].slice(0, HOMEPAGE_TOURS_STORE_LIMIT)
}

type DealPage = {
  id: number
  fullSlug?: string | null
  /** Řetěz předků; první položka je kontinent — viz isLongHaul. */
  breadcrumbs?: { url?: string | null }[] | null
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
      select: { fullSlug: true, affiliate: true, breadcrumbs: true },
      joins: false,
    })
    const pages = (pagesRes.docs as unknown as DealPage[]).filter(
      (p) => p.affiliate?.kiwiIataCode?.trim() || p.affiliate?.inviaFeedUrl?.trim(),
    )

    // Feed pro homepage dlaždice (globál Homepage → Dnešní akční nabídky).
    const homepageGlobal = (await req.payload.findGlobal({
      slug: 'homepage',
      overrideAccess: true,
      depth: 0,
      select: { dealsOfDay: true },
    })) as { dealsOfDay?: { inviaFeedUrl?: string | null } | null }
    const homepageFeedUrl = homepageGlobal.dealsOfDay?.inviaFeedUrl?.trim() || null

    // Souběžný běh se odmítne HNED, ještě před stahováním (viz reserveSyncRun).
    // Rezervace platí i pro dryRun: jinak by ladicí běh spuštěný během ostrého
    // syncu stáhl všechno podruhé a zbytečně ubral z kvóty Kiwi.
    if (!reserveSyncRun()) {
      throw new APIError('Sync už běží — zkus to za chvíli znovu', 409)
    }

    if (dryRun) {
      // Ladicí režim zůstává synchronní — volá se ručně a chce vidět výsledky.
      try {
        const { results, errors, homepageTours } = await collectDeals(pages, homepageFeedUrl)
        return Response.json({ ok: true, dryRun: true, pages: results, homepageTours, errors })
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
        const summary = await runSync(req, pages, homepageFeedUrl)
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

/** Stažení nabídek pro všechny stránky i homepage (bez zápisu) — sdílí ostrý běh i dryRun. */
async function collectDeals(
  pages: DealPage[],
  homepageFeedUrl: string | null,
): Promise<{
  results: { id: number; fullSlug: string | null; deals: AffiliateDeals }[]
  errors: string[]
  /** null = feed není nastavený nebo stažení selhalo (minulá data zůstávají). */
  homepageTours: HomepageTourDeal[] | null
}> {
  const errors: string[] = []
  const results: { id: number; fullSlug: string | null; deals: AffiliateDeals }[] = []

  // Homepage feed první — je jen jeden a nezávisí na stránkách.
  let homepageTours: HomepageTourDeal[] | null = null
  if (homepageFeedUrl) {
    try {
      homepageTours = await fetchHomepageTourDeals(homepageFeedUrl)
    } catch (err) {
      errors.push(`homepage invia: ${err instanceof Error ? err.message : err}`)
    }
    await sleep(INVIA_DELAY_MS)
  }

  // Sekvenčně s rozestupy — kvóta Kiwi (30/min) a slušnost k Invii. Jeden
  // Invia feed se může sdílet mezi stránkami (země + město) → cache po URL.
  const inviaCache = new Map<string, AffiliateDealInvia | null | Error>()
  for (const page of pages) {
    const previous = (page.affiliate?.deals ?? {}) as AffiliateDeals
    const deals: AffiliateDeals = { updatedAt: new Date().toISOString() }

    const iata = page.affiliate?.kiwiIataCode?.trim()
    if (iata) {
      try {
        deals.kiwi = await fetchKiwiDeal(iata, isLongHaul(page))
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
  return { results, errors, homepageTours }
}

/** Ostrý běh: stažení + zápis + invalidace cache; souhrn jde do server logu. */
async function runSync(
  req: Parameters<Endpoint['handler']>[0],
  pages: DealPage[],
  homepageFeedUrl: string | null,
) {
  const { results, errors, homepageTours } = await collectDeals(pages, homepageFeedUrl)

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
    // Homepage dlaždice ve stejné transakci; při selhání feedu (null) minulá
    // data zůstávají. URL feedu se nepřepisuje — patří adminovi. Řádek globálu
    // existuje, jakmile byla URL uložena v adminu (leží ve stejném řádku).
    if (homepageTours !== null) {
      const deals: HomepageTourDeals = { tours: homepageTours, updatedAt: new Date().toISOString() }
      await tx.execute(
        sql`UPDATE homepage SET deals_of_day_deals = ${JSON.stringify(deals)}::jsonb`,
      )
    }
  })

  // Zápis šel mimo hooky → invalidace cache stránek ručně (vzor revalidation.ts);
  // tag 'pages' kryje i homepage dlaždice (fetchTopAffiliateDealsCached).
  await safeRevalidate([
    'pages',
    ...results.filter((r) => r.fullSlug).map((r) => 'page_' + r.fullSlug),
  ])

  return {
    pages: results.length,
    withKiwi: results.filter((r) => r.deals.kiwi).length,
    withInvia: results.filter((r) => r.deals.invia).length,
    homepageTours: homepageTours?.length ?? null,
    errors,
  }
}
