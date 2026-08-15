import type { Endpoint } from 'payload'
import { APIError } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import { timingSafeEqual } from 'node:crypto'
import { safeRevalidate } from '@/hooks/revalidation'
import { PageCategory, type ClimateNormalMonth, type ClimateNormals } from '@/types/payload'

/**
 * Sync dlouhodobých měsíčních průměrů počasí: pro publikované stránky kategorie
 * „Počasí" spočítá z Meteostat API průměrné denní teploty a srážky za
 * **posledních 20 ukončených let** a uloží je do JSON pole `climateNormals`.
 * Souřadnice se berou z rodičovského místa (stránka počasí vlastní nemá).
 *
 * PROČ KLOUZAVÉ OKNO A NE OFICIÁLNÍ NORMÁLY: endpoint `point/normals` vrací
 * třicetiletá období podle pravidel WMO, nejnovější 1991–2020 — a to se nezmění
 * až do roku 2031. Na webu, který radí „kdy tam jet", pak trvale svítí období
 * končící rokem 2020 a působí zastarale. Klouzavé okno se každý rok posune
 * a v popisku stojí skutečný rozsah („průměr 2006–2025").
 *
 * PROČ DENNÍ DATA A NE MĚSÍČNÍ AGREGÁTY: `point/monthly` zvládne celé okno
 * jedním dotazem, ale srážky v něm chybí u většiny měsíců (Londýn 24 %
 * použitelných měsíců). Když se stejné období vezme po dnech a měsíce se
 * spočítají tady, vyjde srážek trojnásobek (75 %). Za ten druhý dotaz to stojí.
 *
 * PROČ 20 LET: u kratšího okna stojí srážky na pár letech a skáčou (Londýn
 * ±13 mm u desetiletky vs ±8 mm u dvacetiletky, měřeno na červenci); delší
 * okno by potřebovalo tři dotazy na místo a nevešlo by se do měsíční kvóty.
 *
 * Stejný vzor jako /api/sync-affiliate-deals: spouští GitHub Actions cron
 * (.github/workflows/sync-climate-normals.yml) se sdíleným tajemstvím
 * ANALYTICS_SYNC_SECRET; zápis jde přímým SQL mimo Payload hooky (stránky mají
 * drafts — update přes Local API by sypal historii verzí), invalidace cache se
 * proto volá ručně přes revalidateTag.
 *
 * Selhání jednoho místa NEMAŽE minulá data: stránka drží poslední úspěšně
 * stažené normály a chyba se jen vrátí v odpovědi.
 *
 * Kvóta Meteostatu (RapidAPI Basic zdarma) je 500 dotazů/měsíc a jedno místo
 * stojí dva, takže běh je PŘÍRŮSTKOVÝ: bere jen stránky bez dat (nové
 * destinace) a ty starší než REFRESH_AFTER_DAYS, nejvýš MAX_PLACES_PER_RUN za
 * běh. Cron může jezdit klidně měsíčně — většinou nemá co dělat a zbytek
 * dopočítá příští běh (`deferred` v odpovědi). Licence dat: CC BY 4.0 — web
 * u grafu uvádí „Zdroj: Meteostat" (viz climate-section.tsx).
 */

/** Porovnání secretu časově konstantní — obyčejné `!==` by šlo uhodnout po znacích z doby odezvy. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const METEOSTAT_DELAY_MS = 1200 // slušný rozestup pod rate limitem RapidAPI
const FETCH_TIMEOUT_MS = 30_000
/**
 * Kolik míst zvládne jeden běh. Jedno místo = 2 dotazy (okno 20 let se nevejde
 * do limitu 3 650 dní na dotaz), kvóta RapidAPI je 500 dotazů/měsíc — 200 míst
 * = 400 dotazů nechává rezervu na ruční doběhy. Až destinací přibude, práce se
 * rozloží do víc běhů (viz `deferred` v odpovědi); přebít lze `?maxPlaces=`.
 */
const MAX_PLACES_PER_RUN = 200
/** Data starší než tohle se přepočítají — okno se každý leden posune o rok. */
const REFRESH_AFTER_DAYS = 330

/** Řádek odpovědi Meteostat point/daily (jeden den). */
type MeteostatDailyRow = {
  date?: string
  tmin?: number | null
  tmax?: number | null
  prcp?: number | null
}

/** Délka klouzavého okna v letech — viz WINDOW_YEARS v hlavičce souboru. */
const WINDOW_YEARS = 20
/** Meteostat pouští nejvýš 3 650 dní na jeden dotaz → okno se dělí na části. */
const MAX_DAYS_PER_REQUEST = 3650
/** Měsíc se počítá jen z roku, kde má aspoň 90 % dní (jinak by chyběl týden srážek). */
const MIN_DAYS_RATIO = 0.9
/** Míň let než tohle = hodnota by byla jednoletý výkyv, ne průměr. */
const MIN_YEARS = 5

/** Skutečný počet dní v měsíci (i přestupný únor). */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

const ymd = (d: Date): string => d.toISOString().slice(0, 10)

/** Rozsahy dní pokrývající okno, každý pod limitem API. */
function requestRanges(from: Date, to: Date): { start: string; end: string }[] {
  const ranges: { start: string; end: string }[] = []
  const cursor = new Date(from)
  while (cursor <= to) {
    const chunkEnd = new Date(cursor)
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + MAX_DAYS_PER_REQUEST - 1)
    ranges.push({ start: ymd(cursor), end: ymd(chunkEnd < to ? chunkEnd : to) })
    cursor.setUTCDate(cursor.getUTCDate() + MAX_DAYS_PER_REQUEST)
  }
  return ranges
}

async function fetchDailyRange(
  lat: number,
  lon: number,
  start: string,
  end: string,
  apiKey: string,
): Promise<MeteostatDailyRow[]> {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon), start, end })
  const res = await fetch(`https://meteostat.p.rapidapi.com/point/daily?${params}`, {
    headers: { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': 'meteostat.p.rapidapi.com' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`Meteostat API ${res.status} (${start}..${end})`)
  const json = (await res.json()) as { data?: MeteostatDailyRow[] }
  return json.data ?? []
}

/**
 * Měsíční průměry za posledních WINDOW_YEARS ukončených let, spočítané
 * z DENNÍCH dat (viz hlavička souboru — měsíční agregáty Meteostatu mají
 * srážky jen u zlomku měsíců).
 *
 * Postup: denní hodnoty se seskupí na (rok, měsíc); měsíc se použije jen když
 * má aspoň 90 % dní s hodnotou (jinak by chyběl kus srážkového úhrnu). Z těchto
 * měsíců se pak udělá průměr přes roky. Teploty musí vyjít pro všech 12 měsíců,
 * jinak jde o místo bez použitelné stanice a sync ho přeskočí; srážky smí
 * chybět (graf u toho měsíce proužek nekreslí).
 */
async function fetchRollingAverages(lat: number, lon: number, now: Date): Promise<ClimateNormals> {
  const apiKey = process.env.METEOSTAT_RAPIDAPI_KEY
  if (!apiKey) throw new Error('METEOSTAT_RAPIDAPI_KEY není nastaveno')

  // Okno končí POSLEDNÍM UKONČENÝM rokem — probíhající rok by měl jen část
  // měsíců a zkreslil by průměry (v srpnu chybí celá zima).
  const lastYear = now.getUTCFullYear() - 1
  const firstYear = lastYear - WINDOW_YEARS + 1
  const from = new Date(Date.UTC(firstYear, 0, 1))
  const to = new Date(Date.UTC(lastYear, 11, 31))

  const rows: MeteostatDailyRow[] = []
  const ranges = requestRanges(from, to)
  for (const [index, range] of ranges.entries()) {
    rows.push(...(await fetchDailyRange(lat, lon, range.start, range.end, apiKey)))
    // Rozestup jen MEZI dotazy — čekání po posledním by při plném běhu
    // (~174 míst) přidalo přes tři minuty úplně zbytečně.
    if (index < ranges.length - 1) await sleep(METEOSTAT_DELAY_MS)
  }
  if (rows.length === 0) throw new Error('Meteostat nevrátil žádná denní data')

  // (rok, měsíc) → hodnoty daného měsíce
  type Bucket = { tmax: number[]; tmin: number[]; prcp: number[] }
  const buckets = new Map<string, Bucket>()
  for (const row of rows) {
    const date = row.date ?? ''
    const year = Number(date.slice(0, 4))
    const month = Number(date.slice(5, 7))
    if (!Number.isInteger(year) || !Number.isInteger(month)) continue
    const key = `${year}-${month}`
    const bucket = buckets.get(key) ?? { tmax: [], tmin: [], prcp: [] }
    if (typeof row.tmax === 'number') bucket.tmax.push(row.tmax)
    if (typeof row.tmin === 'number') bucket.tmin.push(row.tmin)
    if (typeof row.prcp === 'number') bucket.prcp.push(row.prcp)
    buckets.set(key, bucket)
  }

  const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / values.length
  const round1 = (value: number): number => Math.round(value * 10) / 10

  const months: ClimateNormalMonth[] = []
  for (let month = 1; month <= 12; month++) {
    const tmaxYears: number[] = []
    const tminYears: number[] = []
    const prcpYears: number[] = []
    for (let year = firstYear; year <= lastYear; year++) {
      const bucket = buckets.get(`${year}-${month}`)
      if (!bucket) continue
      // Poměřuje se se SKUTEČNÝM počtem dní v měsíci, ne s počtem vrácených
      // řádků: kdyby API polovinu dní vůbec neposlalo, byl by takový měsíc
      // „kompletní" a měsíční úhrn srážek by vyšel poloviční.
      const required = daysInMonth(year, month) * MIN_DAYS_RATIO
      if (bucket.tmax.length >= required) tmaxYears.push(mean(bucket.tmax))
      if (bucket.tmin.length >= required) tminYears.push(mean(bucket.tmin))
      // Srážky se sčítají (měsíční úhrn), teploty průměrují.
      if (bucket.prcp.length >= required) {
        prcpYears.push(bucket.prcp.reduce((a, b) => a + b, 0))
      }
    }
    // Stejný práh pro teploty i srážky — průměr z jednoho dvou let není
    // dlouhodobá hodnota, ale náhodný výkyv.
    months.push({
      month,
      tmax: tmaxYears.length >= MIN_YEARS ? round1(mean(tmaxYears)) : null,
      tmin: tminYears.length >= MIN_YEARS ? round1(mean(tminYears)) : null,
      prcp: prcpYears.length >= MIN_YEARS ? Math.round(mean(prcpYears)) : null,
    })
  }

  if (months.some((m) => m.tmin === null || m.tmax === null)) {
    throw new Error('Meteostat nemá pro tyto souřadnice kompletní teploty (12 měsíců)')
  }

  return {
    months,
    period: { start: firstYear, end: lastYear },
    updatedAt: new Date().toISOString(),
  }
}

type WeatherPage = {
  id: number
  fullSlug?: string | null
  parent?: number | { id: number } | null
  climateNormals?: unknown
}

type ParentPlace = {
  id: number
  detail?: { latitude?: string | null; longitude?: string | null } | null
}

type DrizzleTx = { execute: (query: unknown) => Promise<unknown> }
type DrizzleLike = DrizzleTx & {
  transaction: <T>(fn: (tx: DrizzleTx) => Promise<T>) => Promise<T>
}

/**
 * Souběžný běh se odmítá HNED, ještě před prvním dotazem na Meteostat —
 * jinak by dva překrývající se běhy (ruční curl přes běžící cron) společně
 * spálily měsíční kvótu a teprve na konci by jeden dostal 409 u zápisu.
 * Postgresový advisory lock by tuhle roli plnit nemohl: `pg_try_advisory_lock`
 * platí pro spojení, a Payload sahá do poolu, takže další dotaz může přijít
 * po jiném spojení. Web běží v jednom kontejneru, takže procesní pojistka
 * stačí; zápis navíc chrání transakční advisory lock níž (obojí se doplňuje).
 */
let syncInFlight = false

export const syncClimateNormalsEndpoint: Endpoint = {
  path: '/sync-climate-normals',
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
    const url = new URL(req.url ?? '', 'http://localhost')
    const dryRun = url.searchParams.get('dryRun') === '1'

    // Bez dotazů na Meteostat (dryRun jen počítá) se souběh hlídat nemusí.
    if (!dryRun) {
      if (syncInFlight) {
        throw new APIError('Sync už běží (souběžný požadavek) — zkus to za chvíli znovu', 409)
      }
      syncInFlight = true
    }
    try {
      return await runSync(req, url, dryRun)
    } finally {
      if (!dryRun) syncInFlight = false
    }
  },
}

/** Vlastní práce syncu — oddělené kvůli pojistce proti souběhu výš. */
async function runSync(
  req: Parameters<Extract<Endpoint['handler'], (...args: never[]) => unknown>>[0],
  url: URL,
  dryRun: boolean,
): Promise<Response> {
  {
    // Jen publikované stránky počasí — overrideAccess: true obchází přístupová
    // práva (a s nimi filtr draftů), proto se _status hlídá explicitně.
    const pagesRes = await req.payload.find({
      collection: 'pages',
      overrideAccess: true,
      where: {
        and: [{ _status: { equals: 'published' } }, { category: { equals: PageCategory.Pocasi } }],
      },
      depth: 0,
      limit: 0,
      pagination: false,
      select: { fullSlug: true, parent: true, climateNormals: true },
      joins: false,
    })
    const pages = pagesRes.docs as unknown as WeatherPage[]

    // Souřadnice rodičovských míst jedním dotazem (stránka počasí vlastní nemá).
    const parentIds = [
      ...new Set(
        pages
          .map((p) => (typeof p.parent === 'object' ? p.parent?.id : p.parent))
          .filter((id): id is number => typeof id === 'number'),
      ),
    ]
    const parentsRes = await req.payload.find({
      collection: 'pages',
      overrideAccess: true,
      where: { id: { in: parentIds } },
      depth: 0,
      limit: 0,
      pagination: false,
      select: { detail: true },
      joins: false,
    })
    const parentById = new Map((parentsRes.docs as unknown as ParentPlace[]).map((p) => [p.id, p]))

    const errors: string[] = []
    const results: { id: number; fullSlug: string | null; normals: ClimateNormals }[] = []
    let skipped = 0

    // DÁVKOVÁNÍ: kvóta Meteostatu je 500 dotazů/měsíc a jedno místo stojí dva
    // (okno 20 let se nevejde do limitu 3 650 dní na dotaz). Jeden běh proto
    // obslouží nejvýš MAX_PLACES_PER_RUN míst — s přibývajícími destinacemi
    // se práce rozloží do několika běhů místo aby narazila na kvótu.
    const now = new Date()
    const maxPlaces = Math.max(
      1,
      Number.parseInt(url.searchParams.get('maxPlaces') ?? '', 10) || MAX_PLACES_PER_RUN,
    )

    // `?force=1` přepočítá i čerstvá data — po změně metodiky (jiné okno, jiný
    // výpočet) je jinak stará hodnota „dost čerstvá" a nikdy by se nepřepsala.
    const force = url.searchParams.get('force') === '1'
    // `?slug=/anglie/londyn/pocasi` omezí běh na jedinou stránku — po přidání
    // destinace nebo při ověřování se nemusí čekat na celou frontu.
    const slugFilter = url.searchParams.get('slug')

    // Nejdřív stránky BEZ dat (nová destinace), pak nejstarší — data starší než
    // rok se přepočítají (okno se posunulo), čerstvá se přeskočí zadarmo.
    const staleBefore = new Date(now.getTime() - REFRESH_AFTER_DAYS * 86_400_000)
    const candidates = pages
      .map((page) => {
        const stored = page.climateNormals as { updatedAt?: unknown } | null | undefined
        const updatedAt =
          stored && typeof stored.updatedAt === 'string' ? new Date(stored.updatedAt) : null
        return { page, updatedAt }
      })
      .filter(({ page }) => !slugFilter || page.fullSlug === slugFilter)
      .filter(({ updatedAt }) => force || !updatedAt || updatedAt < staleBefore)
      .sort((a, b) => (a.updatedAt?.getTime() ?? 0) - (b.updatedAt?.getTime() ?? 0))

    const upToDate = pages.length - candidates.length
    const queue = candidates.slice(0, maxPlaces)
    const deferred = candidates.length - queue.length

    // Sekvenčně s rozestupy (rate limit RapidAPI). Kdyby víc stránek sdílelo
    // souřadnice, druhá se obslouží z cache — kvóta je jen 500 dotazů/měsíc.
    const normalsCache = new Map<string, ClimateNormals | Error>()
    for (const { page } of queue) {
      const parentId = typeof page.parent === 'object' ? page.parent?.id : page.parent
      const parent = typeof parentId === 'number' ? parentById.get(parentId) : undefined
      const lat = Number.parseFloat(parent?.detail?.latitude ?? '')
      const lon = Number.parseFloat(parent?.detail?.longitude ?? '')
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        skipped++
        errors.push(`${page.fullSlug}: rodičovské místo nemá souřadnice`)
        continue
      }

      const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)}`
      if (!normalsCache.has(cacheKey)) {
        try {
          normalsCache.set(cacheKey, await fetchRollingAverages(lat, lon, now))
        } catch (err) {
          normalsCache.set(cacheKey, err instanceof Error ? err : new Error(String(err)))
        }
      }
      const cached = normalsCache.get(cacheKey)
      if (!cached || cached instanceof Error) {
        // Selhání nemaže minulá data — stránka si nechá poslední úspěšný sync.
        skipped++
        errors.push(
          `${page.fullSlug} meteostat(${cacheKey}): ${cached instanceof Error ? cached.message : 'bez dat'}`,
        )
        continue
      }
      results.push({ id: page.id, fullSlug: page.fullSlug ?? null, normals: cached })
    }

    if (dryRun) {
      return Response.json({
        ok: true,
        dryRun: true,
        pages: results,
        upToDate,
        deferred,
        skipped,
        errors,
      })
    }

    // Přímý SQL zápis mimo hooky (viz hlavička souboru) — v jedné transakci
    // s try-advisory lockem proti souběhu (curl --retry umí poslat druhý běh).
    const db = req.payload.db as unknown as { drizzle: DrizzleLike }
    await db.drizzle.transaction(async (tx) => {
      const lockResult = (await tx.execute(
        sql`SELECT pg_try_advisory_xact_lock(hashtext('aracze:sync-climate-normals')) AS acquired`,
      )) as { rows: { acquired: boolean }[] }
      if (!lockResult.rows[0]?.acquired) {
        throw new APIError('Sync už běží (souběžný požadavek) — zkus to za chvíli znovu', 409)
      }
      for (const r of results) {
        await tx.execute(
          sql`UPDATE pages SET climate_normals = ${JSON.stringify(r.normals)}::jsonb WHERE id = ${r.id}`,
        )
      }
    })

    // Zápis šel mimo hooky → invalidace cache stránek ručně (vzor revalidation.ts).
    await safeRevalidate([
      'pages',
      ...results.filter((r) => r.fullSlug).map((r) => 'page_' + r.fullSlug),
    ])

    return Response.json({
      ok: true,
      pages: pages.length,
      updated: results.length,
      upToDate,
      deferred,
      skipped,
      errors,
    })
  }
}
