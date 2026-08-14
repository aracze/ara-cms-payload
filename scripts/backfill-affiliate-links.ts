import 'dotenv/config'
import { writeFileSync } from 'node:fs'
import { getPayload } from 'payload'
import configPromise from '../src/payload.config'

/**
 * Jednorázový doběh: doplní místům k navštívení PŘESNÉ affiliate odkazy na
 * ubytování (Booking), půjčení auta (DiscoverCars) a zájezdy (Invia).
 *
 *   pnpm backfill:affiliate                # dry-run: jen zjistí a vypíše, co by zapsal
 *   pnpm backfill:affiliate -- --apply     # zapíše výsledky do CMS
 *   pnpm backfill:affiliate -- --tours-only  # řeší jen zájezdy (Booking/DiscoverCars nechá být)
 *
 * Postup (viz sekce „Příprava do …" v README):
 *  1. Země se určuje z NÁZVU kořenové stránky země (dítě kontinentu) přes
 *     slovník COUNTRIES — NE ze starých odkazů (legacy data měla u Egypta
 *     chybný kód `ec`, tedy Ekvádor). Invia slug země se bere z existujícího
 *     odkazu v CMS (dovolena/<země>), případně se zkusí přepis názvu.
 *  2. U podřazených míst se zkouší stránka města/regionu přímo na webu
 *     partnera (kandidáti: český exonym → anglický název, přepis bez
 *     diakritiky, název bez prefixu „Ostrov/Národní park/…"; Invia má slugy
 *     ČESKY, takže bez exonym). Booking neexistující město sám přesměruje —
 *     cíl na /city|/region|/district se bere jako oprava, přesměrování na
 *     /country jako neexistence. Invia přesměrovává neexistující lokalitu
 *     na zemi — hit je jen přímé 200.
 *  3. Kde přesná stránka není, dědí se odkaz NADŘAZENÉ stránky (rodičovské
 *     země/regionu) — zapisuje se explicitně do CMS, ať je v adminu vidět,
 *     kam karta skutečně vede.
 *
 * Zapisují se ČISTÉ cílové adresy bez provizních parametrů — tracking
 * (CJ ?url=, a_aid, aid) doplňují až redirecty /go/ubytovani, /go/auta
 * a /go/zajezdy. Po běhu na PRODUKCI je potřeba force-recreate cms (cache
 * mimo hooky).
 */

const APPLY = process.argv.includes('--apply')
const TOURS_ONLY = process.argv.includes('--tours-only')
const REPORT_ARG = process.argv.find((a) => a.startsWith('--report='))
const REPORT_PATH = REPORT_ARG ? REPORT_ARG.slice('--report='.length) : null

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'
const BOOKING_DELAY_MS = 300
const DISCOVER_DELAY_MS = 250
const INVIA_DELAY_MS = 300

/**
 * Kořenové země podle českého názvu → kód země na Bookingu (ISO) + slug na
 * DiscoverCars. `dc: null` = DiscoverCars zemi nemá (klik povede na homepage),
 * `cc: null` = Booking zemi nenabízí. Slugy ověřeny proti webům 14. 8. 2026.
 */
const COUNTRIES: Record<string, { cc: string | null; dc: string | null }> = {
  Albánie: { cc: 'al', dc: 'albania' },
  Argentina: { cc: 'ar', dc: 'argentina' },
  Bělorusko: { cc: null, dc: null },
  'Bosna a Hercegovina': { cc: 'ba', dc: 'bosnia-and-herzegovina' },
  Belgie: { cc: 'be', dc: 'belgium' },
  Brazílie: { cc: 'br', dc: 'brazil' },
  Bulharsko: { cc: 'bg', dc: 'bulgaria' },
  'Černá Hora': { cc: 'me', dc: 'montenegro' },
  'Česká republika': { cc: 'cz', dc: 'czech-republic' },
  Čína: { cc: 'cn', dc: 'china' },
  Dánsko: { cc: 'dk', dc: 'denmark' },
  Egypt: { cc: 'eg', dc: 'egypt' },
  Ekvádor: { cc: 'ec', dc: 'ecuador' },
  Estonsko: { cc: 'ee', dc: 'estonia' },
  Filipíny: { cc: 'ph', dc: 'philippines' },
  Finsko: { cc: 'fi', dc: 'finland' },
  Francie: { cc: 'fr', dc: 'france' },
  Chorvatsko: { cc: 'hr', dc: 'croatia' },
  Irsko: { cc: 'ie', dc: 'ireland' },
  Island: { cc: 'is', dc: 'iceland' },
  Itálie: { cc: 'it', dc: 'italy-mainland' },
  Japonsko: { cc: 'jp', dc: 'japan' },
  Kapverdy: { cc: 'cv', dc: null },
  Kazachstán: { cc: 'kz', dc: 'kazakhstan' },
  Kypr: { cc: 'cy', dc: 'cyprus' },
  Kyrgyzstán: { cc: 'kg', dc: null },
  Lichtenštejnsko: { cc: 'li', dc: null },
  Litva: { cc: 'lt', dc: 'lithuania' },
  Lotyšsko: { cc: 'lv', dc: 'latvia' },
  Lucembursko: { cc: 'lu', dc: 'luxembourg' },
  Maďarsko: { cc: 'hu', dc: 'hungary' },
  Makedonie: { cc: 'mk', dc: 'macedonia' },
  Malta: { cc: 'mt', dc: 'malta' },
  Maroko: { cc: 'ma', dc: 'morocco' },
  Monako: { cc: 'mc', dc: 'monaco' },
  Myanmar: { cc: 'mm', dc: null },
  Německo: { cc: 'de', dc: 'germany' },
  Nizozemsko: { cc: 'nl', dc: 'netherlands' },
  Norsko: { cc: 'no', dc: 'norway' },
  'Nový Zéland': { cc: 'nz', dc: 'new-zealand' },
  Paraguay: { cc: 'py', dc: 'paraguay' },
  Peru: { cc: 'pe', dc: 'peru' },
  Polsko: { cc: 'pl', dc: 'poland' },
  Portugalsko: { cc: 'pt', dc: 'portugal' },
  Rakousko: { cc: 'at', dc: 'austria' },
  Rumunsko: { cc: 'ro', dc: 'romania' },
  Rusko: { cc: 'ru', dc: null },
  Řecko: { cc: 'gr', dc: 'greece' },
  Slovensko: { cc: 'sk', dc: 'slovakia' },
  Slovinsko: { cc: 'si', dc: 'slovenia' },
  'Spojené království': { cc: 'gb', dc: 'united-kingdom' },
  Srbsko: { cc: 'rs', dc: 'serbia' },
  'Srí Lanka': { cc: 'lk', dc: 'sri-lanka' },
  Španělsko: { cc: 'es', dc: 'spain' },
  Švédsko: { cc: 'se', dc: 'sweden' },
  Švýcarsko: { cc: 'ch', dc: 'switzerland' },
  Thajsko: { cc: 'th', dc: 'thailand' },
  Tunisko: { cc: 'tn', dc: 'tunisia' },
  Turecko: { cc: 'tr', dc: 'turkey' },
  Ukrajina: { cc: 'ua', dc: 'ukraine' },
  USA: { cc: 'us', dc: null },
  Vietnam: { cc: 'vn', dc: null },
}

/**
 * České exonymy → anglický slug u partnerů. Klíč je název po `fold()`.
 * Jen názvy, kde se čeština liší od mezinárodního tvaru — zbytek vyřeší
 * přepis bez diakritiky (a u Bookingu i jeho opravné přesměrování).
 * Invia je česky, exonyma NEpoužívá (viz candidateSlugs).
 */
const EXONYMS: Record<string, string> = {
  aljaska: 'alaska',
  anglie: 'england',
  antverpy: 'antwerp',
  ateny: 'athens',
  bamberk: 'bamberg',
  basilej: 'basel',
  belehrad: 'belgrade',
  benatky: 'venice',
  brusel: 'brussels',
  budysin: 'bautzen',
  bukurest: 'bucharest',
  curych: 'zurich',
  fez: 'fes',
  gdansk: 'gdansk',
  goteborg: 'gothenburg',
  haag: 'the-hague',
  hamburk: 'hamburg',
  helsinky: 'helsinki',
  'ho ci minovo mesto': 'ho-chi-minh-city',
  istrie: 'istria',
  jasy: 'iasi',
  jekaterinburg: 'yekaterinburg',
  kahira: 'cairo',
  kalifornie: 'california',
  'kanarske ostrovy': 'canary-islands',
  kappadokie: 'cappadocia',
  kodan: 'copenhagen',
  konstance: 'constanta',
  korfu: 'corfu',
  krakov: 'krakow',
  kreta: 'crete',
  larnaka: 'larnaca',
  lesbos: 'lesvos',
  lesno: 'leszno',
  lipsko: 'leipzig',
  lisabon: 'lisbon',
  londyn: 'london',
  lublan: 'ljubljana',
  lucemburk: 'luxembourg',
  marrakes: 'marrakech',
  marseilles: 'marseille',
  mnichov: 'munich',
  moskva: 'moscow',
  neapol: 'naples',
  nikosie: 'nicosia',
  ostrihom: 'esztergom',
  pariz: 'paris',
  pasov: 'passau',
  peking: 'beijing',
  petrohrad: 'saint-petersburg',
  'plitvicka jezera': 'plitvice-lakes',
  postupim: 'potsdam',
  poznan: 'poznan',
  praha: 'prague',
  premysl: 'przemysl',
  resov: 'rzeszow',
  rim: 'rome',
  sanghaj: 'shanghai',
  sandomer: 'sandomierz',
  sardinie: 'sardinia',
  'severni irsko': 'northern-ireland',
  sevilla: 'seville',
  sicilie: 'sicily',
  skotsko: 'scotland',
  solun: 'thessaloniki',
  stetin: 'szczecin',
  temesvar: 'timisoara',
  terst: 'trieste',
  varsava: 'warsaw',
  vatikan: 'vatican-city',
  viden: 'vienna',
  zahreb: 'zagreb',
  zakinthos: 'zakynthos',
}

/** Obecné prefixy názvů — po jejich odtržení bývá zbytek jménem místa. */
const STRIP_PREFIXES = [
  'ostrov ',
  'ostruvek ',
  'narodni park ',
  'prirodni park ',
  'narodni ',
  'jezero ',
  'poloostrov ',
  'pohori ',
  'region ',
  'mesto ',
  'vesnice ',
  'soutesky ',
  'udoli ',
]

/** Přepis na malá písmena bez diakritiky; mezery zůstávají (slug dělá slugify). */
function fold(title: string): string {
  return title
    .split('(')[0]
    .toLowerCase()
    .replace(/[ł]/g, 'l')
    .replace(/[đð]/g, 'd')
    .replace(/[þ]/g, 'th')
    .replace(/[ß]/g, 'ss')
    .replace(/[æ]/g, 'ae')
    .replace(/[øœ]/g, 'o')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9 -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function slugify(folded: string): string {
  return folded.replace(/ /g, '-')
}

/**
 * Kandidátní slugy pro hledání stránky místa u partnerů (v pořadí pokusů).
 * `withExonyms: false` pro Invii — má slugy česky (viden, kreta…).
 */
function candidateSlugs(title: string, withExonyms = true): { slug: string; stripped: boolean }[] {
  const folded = fold(title)
  const out: { slug: string; stripped: boolean }[] = []
  const push = (slug: string, stripped: boolean) => {
    if (slug && !out.some((c) => c.slug === slug)) out.push({ slug, stripped })
  }
  if (withExonyms && EXONYMS[folded]) push(EXONYMS[folded], false)
  push(slugify(folded), false)
  for (const prefix of STRIP_PREFIXES) {
    if (folded.startsWith(prefix)) {
      const rest = folded.slice(prefix.length)
      if (withExonyms && EXONYMS[rest]) push(EXONYMS[rest], true)
      push(slugify(rest), true)
    }
  }
  return out
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function fetchStatus(url: string): Promise<{ status: number; location: string }> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'user-agent': UA, 'accept-language': 'cs' },
    })
    // Tělo nečteme — zavřít, ať se nehromadí otevřená spojení.
    await res.body?.cancel()
    return { status: res.status, location: res.headers.get('location') ?? '' }
  } catch {
    return { status: 0, location: '' }
  }
}

/**
 * Booking: /city/<cc>/<slug>.cs.html, u „krajinných" názvů dřív /region/.
 * 200 = trefa; přesměrování na /city|/region|/district = Bookingem opravený
 * slug (bere se cíl); přesměrování na /country = stránka neexistuje.
 */
async function probeBooking(cc: string, cand: { slug: string; stripped: boolean }) {
  const kinds = cand.stripped ? ['region', 'city'] : ['city', 'region']
  for (const kind of kinds) {
    const url = `https://www.booking.com/${kind}/${cc}/${cand.slug}.cs.html`
    const { status, location } = await fetchStatus(url)
    await sleep(BOOKING_DELAY_MS)
    if (status === 200) return url
    if (status >= 300 && status < 400) {
      // Location bývá i RELATIVNÍ (/region/hr/mljet-sland.cs.html) — absolutní
      // prefix je proto volitelný. Cíl na /country znamená „stránka neexistuje".
      const m = location.match(
        /^(?:https:\/\/www\.booking\.com)?(\/(?:city|region|district)\/[^?]+)/,
      )
      if (m) return `https://www.booking.com${m[1]}`
    }
  }
  return null
}

/** DiscoverCars: /cz/<země>/<místo> — existuje jen jako 200, jinak 404. */
async function probeDiscover(dcCountry: string, cand: { slug: string }) {
  const url = `https://www.discovercars.com/cz/${dcCountry}/${cand.slug}`
  const { status } = await fetchStatus(url)
  await sleep(DISCOVER_DELAY_MS)
  return status === 200 ? url : null
}

/**
 * Invia: /dovolena/<země>/<lokalita>/ (slugy ČESKY). Neexistující lokalitu
 * Invia přesměruje na zemi → trefa je jen přímé 200. Stejně tak země:
 * /dovolena/<země>/.
 */
async function probeInvia(pathSegments: string[]) {
  const url = `https://www.invia.cz/dovolena/${pathSegments.join('/')}/`
  const { status } = await fetchStatus(url)
  await sleep(INVIA_DELAY_MS)
  return status === 200 ? url : null
}

type PageRow = {
  id: number
  title: string
  fullSlug: string
  parent: number | { id: number } | null
  affiliate?: {
    toursUrl?: string | null
    accommodationUrl?: string | null
    carRentalUrl?: string | null
    kiwiIataCode?: string | null
  } | null
}

type Resolved = {
  booking: string
  discover: string
  tours: string
  bookingSource: string
  discoverSource: string
  toursSource: string
  cc: string | null
  dc: string | null
  /** Invia slug země (dovolena/<slug>) pro hledání lokalit u dětí. */
  invia: string | null
}

const run = async () => {
  const payload = await getPayload({ config: configPromise })

  const res = await payload.find({
    collection: 'pages',
    where: { category: { equals: 'Místo k navštívení' } },
    limit: 1000,
    depth: 0,
    select: { title: true, fullSlug: true, parent: true, affiliate: true },
    overrideAccess: true,
  })
  const pages = res.docs as unknown as PageRow[]
  console.log(
    `Míst k navštívení: ${pages.length}${APPLY ? '' : ' (DRY-RUN, nic se nezapíše)'}${TOURS_ONLY ? ' — jen zájezdy' : ''}`,
  )

  const byId = new Map<number, PageRow>()
  const childrenOf = new Map<number | null, PageRow[]>()
  for (const p of pages) {
    byId.set(Number(p.id), p)
  }
  for (const p of pages) {
    const rawParent = typeof p.parent === 'object' && p.parent ? p.parent.id : p.parent
    // Rodič mimo množinu míst (nemělo by nastat) se chová jako kořen.
    const parentId = rawParent && byId.has(Number(rawParent)) ? Number(rawParent) : null
    const list = childrenOf.get(parentId) ?? []
    list.push(p)
    childrenOf.set(parentId, list)
  }

  const resolved = new Map<number, Resolved>()
  const EMPTY: Resolved = {
    booking: '',
    discover: '',
    tours: '',
    bookingSource: 'none',
    discoverSource: 'none',
    toursSource: 'none',
    cc: null,
    dc: null,
    invia: null,
  }

  // BFS od kontinentů (kořenů) — rodič je vyřešený dřív než děti, takže
  // dědění bere už NOVĚ vyřešené odkazy rodiče.
  const queue: { page: PageRow; parentResolved: Resolved; isCountry: boolean }[] = []
  for (const continent of childrenOf.get(null) ?? []) {
    resolved.set(Number(continent.id), EMPTY)
    for (const country of childrenOf.get(Number(continent.id)) ?? []) {
      queue.push({ page: country, parentResolved: EMPTY, isCountry: true })
    }
  }

  let probed = 0
  while (queue.length > 0) {
    const { page, parentResolved, isCountry } = queue.shift()!
    let r: Resolved

    // Při --tours-only se Booking/DiscoverCars vůbec neřeší — projdou beze
    // změny současné hodnoty stránky (diff je pak nevidí).
    const keepBooking = page.affiliate?.accommodationUrl ?? ''
    const keepDiscover = page.affiliate?.carRentalUrl ?? ''

    if (isCountry) {
      const country = COUNTRIES[page.title]
      if (!country && !TOURS_ONLY) {
        console.warn(`! Neznámá země pod kontinentem: ${page.title} (${page.fullSlug})`)
      }
      // Invia slug země: z existujícího odkazu v CMS, jinak zkusit přepis názvu.
      let inviaSlug = (page.affiliate?.toursUrl ?? '').match(/dovolena\/([a-z0-9-]+)/)?.[1] ?? null
      if (!inviaSlug) {
        const cand = slugify(fold(page.title))
        if (await probeInvia([cand])) inviaSlug = cand
      }
      r = {
        booking: TOURS_ONLY
          ? keepBooking
          : country?.cc
            ? `https://www.booking.com/country/${country.cc}.cs.html`
            : '',
        discover: TOURS_ONLY
          ? keepDiscover
          : country?.dc
            ? `https://www.discovercars.com/cz/${country.dc}`
            : '',
        tours: inviaSlug ? `https://www.invia.cz/dovolena/${inviaSlug}/` : '',
        bookingSource: TOURS_ONLY ? 'keep' : country?.cc ? 'country' : 'none',
        discoverSource: TOURS_ONLY ? 'keep' : country?.dc ? 'country' : 'none',
        toursSource: inviaSlug ? 'country' : 'none',
        cc: country?.cc ?? null,
        dc: country?.dc ?? null,
        invia: inviaSlug,
      }
    } else if (!parentResolved.cc && !parentResolved.dc && !parentResolved.invia) {
      r = {
        ...parentResolved,
        booking: TOURS_ONLY ? keepBooking : parentResolved.booking,
        discover: TOURS_ONLY ? keepDiscover : parentResolved.discover,
        bookingSource: TOURS_ONLY ? 'keep' : 'parent',
        discoverSource: TOURS_ONLY ? 'keep' : 'parent',
        toursSource: 'parent',
      }
    } else {
      let booking: string | null = null
      let discover: string | null = null
      if (!TOURS_ONLY) {
        for (const cand of candidateSlugs(page.title)) {
          if (!booking && parentResolved.cc) booking = await probeBooking(parentResolved.cc, cand)
          if (!discover && parentResolved.dc)
            discover = await probeDiscover(parentResolved.dc, cand)
          if ((booking || !parentResolved.cc) && (discover || !parentResolved.dc)) break
        }
      }
      let tours: string | null = null
      if (parentResolved.invia) {
        for (const cand of candidateSlugs(page.title, false)) {
          tours = await probeInvia([parentResolved.invia, cand.slug])
          if (tours) break
        }
      }
      probed++
      if (probed % 25 === 0) console.log(`  …ověřeno ${probed} míst`)
      r = {
        booking: TOURS_ONLY ? keepBooking : (booking ?? parentResolved.booking),
        discover: TOURS_ONLY ? keepDiscover : (discover ?? parentResolved.discover),
        tours: tours ?? parentResolved.tours,
        bookingSource: TOURS_ONLY ? 'keep' : booking ? 'exact' : 'parent',
        discoverSource: TOURS_ONLY ? 'keep' : discover ? 'exact' : 'parent',
        toursSource: tours ? 'exact' : 'parent',
        cc: parentResolved.cc,
        dc: parentResolved.dc,
        invia: parentResolved.invia,
      }
    }

    resolved.set(Number(page.id), r)
    for (const child of childrenOf.get(Number(page.id)) ?? []) {
      queue.push({ page: child, parentResolved: r, isCountry: false })
    }
  }

  // Diff proti současnému stavu CMS.
  const changes: {
    id: number
    title: string
    fullSlug: string
    booking: { old: string; new: string; source: string }
    discover: { old: string; new: string; source: string }
    tours: { old: string; new: string; source: string }
  }[] = []
  const counts = {
    bookingExact: 0,
    discoverExact: 0,
    toursExact: 0,
    bookingParent: 0,
    discoverParent: 0,
    toursParent: 0,
  }
  for (const p of pages) {
    const r = resolved.get(Number(p.id))
    if (!r) continue
    if (r.bookingSource === 'exact') counts.bookingExact++
    if (r.discoverSource === 'exact') counts.discoverExact++
    if (r.toursSource === 'exact') counts.toursExact++
    if (r.bookingSource === 'parent' && r.booking) counts.bookingParent++
    if (r.discoverSource === 'parent' && r.discover) counts.discoverParent++
    if (r.toursSource === 'parent' && r.tours) counts.toursParent++
    const oldBooking = p.affiliate?.accommodationUrl ?? ''
    const oldDiscover = p.affiliate?.carRentalUrl ?? ''
    const oldTours = p.affiliate?.toursUrl ?? ''
    if (oldBooking !== r.booking || oldDiscover !== r.discover || oldTours !== r.tours) {
      changes.push({
        id: Number(p.id),
        title: p.title,
        fullSlug: p.fullSlug,
        booking: { old: oldBooking, new: r.booking, source: r.bookingSource },
        discover: { old: oldDiscover, new: r.discover, source: r.discoverSource },
        tours: { old: oldTours, new: r.tours, source: r.toursSource },
      })
    }
  }

  console.log('')
  if (!TOURS_ONLY) {
    console.log(
      `Booking:      přesná stránka ${counts.bookingExact}×, zděděno ${counts.bookingParent}×`,
    )
    console.log(
      `DiscoverCars: přesná stránka ${counts.discoverExact}×, zděděno ${counts.discoverParent}×`,
    )
  }
  console.log(`Invia:        přesná lokalita ${counts.toursExact}×, zděděno ${counts.toursParent}×`)
  console.log(`Ke změně: ${changes.length} stránek`)

  if (REPORT_PATH) {
    writeFileSync(REPORT_PATH, JSON.stringify(changes, null, 2))
    console.log(`Report: ${REPORT_PATH}`)
  }

  if (!APPLY) {
    console.log('\nDRY-RUN hotov — zápis provede `pnpm backfill:affiliate -- --apply`.')
    return
  }

  let written = 0
  for (const ch of changes) {
    const p = byId.get(ch.id)!
    await payload.update({
      collection: 'pages',
      id: ch.id,
      depth: 0,
      overrideAccess: true,
      data: {
        affiliate: {
          // Skupinu posíláme CELOU včetně polí, která neměníme (spread) —
          // nespoléháme na merge chování a hlavně nesmíme smazat pole
          // doplňovaná jinými větvemi práce (např. `deals` z denního syncu).
          ...(p.affiliate ?? {}),
          toursUrl: ch.tours.new || null,
          accommodationUrl: ch.booking.new || null,
          carRentalUrl: ch.discover.new || null,
        },
      },
    })
    written++
    if (written % 50 === 0) console.log(`  …zapsáno ${written}/${changes.length}`)
  }
  console.log(`Zapsáno ${written} stránek. Na produkci nezapomeň na force-recreate cms.`)
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
