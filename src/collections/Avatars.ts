import type { Access, CollectionConfig, FieldAccess, Payload } from 'payload'
import { APIError } from 'payload'
import { AVATAR_MIME, MAX_AVATAR_BYTES } from '../lib/profile-limits'
import { isR2Configured, r2Delete, r2Put, resolveR2Key } from '../lib/r2-backup'

/**
 * Profilové fotky uživatelů — ZÁMĚRNĚ mimo kolekci Media.
 *
 * Media je redakční knihovna (~3300 souborů) a vkládat do ní smí jen redakce.
 * Kdybychom ji otevřeli i běžným uživatelům kvůli avatarům, promíchaly by se
 * osobní fotky s obsahem webu a redakce by v tom hledala. Vlastní kolekce dává
 * avatarům vlastní pravidla: nahrát smí každý přihlášený, ale sáhnout jen na
 * svůj vlastní.
 *
 * Soubory jdou na Cloudinary úplně stejně jako Media (viz `cloudinaryStorage`
 * v payload.config.ts) — lokálně se nic neukládá, protože kontejner se při
 * každém nasazení zahazuje.
 */

// Meze sdílené s formulářem profilu — viz src/lib/profile-limits.ts.
const MAX_BYTES = MAX_AVATAR_BYTES
const ALLOWED_MIME: readonly string[] = AVATAR_MIME
/**
 * Kolik avatarů smí jeden účet mít.
 *
 * Uživatel potřebuje právě jeden — starý se při výměně z profilu maže. Strop je
 * proti přímému volání API, kterým by šlo nahrát neomezeně souborů; tři místo
 * jednoho proto, aby při souběhu (výměna fotky) nikdo nenarazil na hranici.
 */
const MAX_PER_USER = 3

function isAdminUser(user: unknown): boolean {
  const roles = (user as { roles?: string[] } | null)?.roles
  return Array.isArray(roles) && roles.includes('admin')
}

/** Cloudinary data avataru potřebná pro klíč v R2 (viz resolveR2Key). */
type AvatarR2Doc = {
  cloudinaryPublicId?: string | null
  mimeType?: string | null
  cloudinaryFormat?: string | null
}

function avatarR2Key(doc: AvatarR2Doc): string | null {
  if (!doc.cloudinaryPublicId) return null
  const key = resolveR2Key(doc.cloudinaryPublicId, doc.mimeType, doc.cloudinaryFormat)
  // Zrcadlo spravuje VÝHRADNĚ složku avatars/. Staré migrované avatary sdílejí
  // soubor s kolekcí Media (public_id bez složky) — jejich zálohu vlastní Media
  // a mirror-delete by ji smazal i médiím.
  return key.startsWith('avatars/') ? key : null
}

// Detached operace nad STEJNÝM klíčem musí běžet v pořadí, v jakém přišly:
// nahrání a okamžité smazání téhož avataru by se jinak mohly předběhnout
// (DELETE doběhne dřív, pomalejší PUT pak smazanou fotku vrátí do veřejného
// bucketu). Fronta per klíč v paměti procesu — stejný přístup jako
// latestBackupGen u Media. Úlohy nikdy nerejectují (chyby logují uvnitř).
const avatarR2Queue = new Map<string, Promise<void>>()

function enqueueAvatarR2(key: string, task: () => Promise<void>): void {
  const previous = avatarR2Queue.get(key) ?? Promise.resolve()
  const run = previous.then(task)
  avatarR2Queue.set(key, run)
  void run.finally(() => {
    if (avatarR2Queue.get(key) === run) avatarR2Queue.delete(key)
  })
}

// Záloha avataru do R2 je ZRCADLO, ne archiv: drží vždy jen aktuální soubor.
// Staré verze se mažou ze dvou důvodů: (1) uživatel po výměně/smazání čeká,
// že fotka zmizí, (2) bucket je veřejně čitelný přes media-backup.ara.cz
// (nouzový režim media proxy), takže odložené avatary nesmí zůstat dostupné.
// Detached (`void`, bez `req`) stejně jako u Media — síťové I/O nesmí držet
// DB spojení requestu. Bez status pole: avatarů je málo, selhání se loguje
// a dorovná ho skript scripts/backup-avatars-r2.ts.
async function mirrorAvatarToR2(payload: Payload, doc: AvatarR2Doc & { url?: string | null }) {
  const r2Key = avatarR2Key(doc)
  if (!r2Key || !doc.url) return
  try {
    if (!isR2Configured()) throw new Error('Chybí konfigurace R2 (environment variables)')
    const response = await fetch(doc.url, { signal: AbortSignal.timeout(15_000) })
    if (!response.ok) throw new Error(`Načtení z Cloudinary selhalo: ${response.statusText}`)
    await r2Put({
      key: r2Key,
      body: Buffer.from(await response.arrayBuffer()),
      contentType: doc.mimeType,
    })
    payload.logger.info(`R2 avatar: záloha ${r2Key} proběhla úspěšně.`)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    payload.logger.error(`R2 avatar: záloha ${r2Key} selhala: ${errorMsg}`)
  }
}

async function removeAvatarFromR2(payload: Payload, doc: AvatarR2Doc) {
  const r2Key = avatarR2Key(doc)
  if (!r2Key) return
  try {
    if (!isR2Configured()) throw new Error('Chybí konfigurace R2 (environment variables)')
    await r2Delete(r2Key)
    payload.logger.info(`R2 avatar: ${r2Key} smazán ze zálohy.`)
  } catch (error) {
    // Selhání = starý avatar zůstane v (veřejné) záloze — proto výrazný log;
    // dorovnání řeší scripts/backup-avatars-r2.ts (maže osiřelé klíče).
    const errorMsg = error instanceof Error ? error.message : String(error)
    payload.logger.error(`R2 avatar: smazání ${r2Key} selhalo: ${errorMsg}`)
  }
}

/** Nahrát smí každý přihlášený — i role `user`. To je smysl téhle kolekce. */
const canCreate: Access = ({ req }) => Boolean(req.user)

/**
 * Měnit a mazat smí jen vlastník (a admin). Vrací QUERY, ne boolean, takže
 * omezení platí i pro hromadné operace a výpis v adminu.
 */
const ownerOnly: Access = ({ req }) => {
  if (!req.user) return false
  if (isAdminUser(req.user)) return true
  return { owner: { equals: req.user.id } }
}

/** Vlastníka nastavuje server z přihlášení, nikdo ho nesmí přepsat z formuláře. */
const noOneCanWrite: FieldAccess = () => false

export const Avatars: CollectionConfig = {
  slug: 'avatars',
  labels: { singular: 'Avatar', plural: 'Avatary' },
  admin: {
    useAsTitle: 'filename',
    defaultColumns: ['filename', 'owner', 'updatedAt'],
    description: 'Profilové fotky uživatelů. Nahrávají si je lidé sami ze svého profilu.',
  },
  access: {
    // Avatar je veřejný — zobrazuje se u komentářů, recenzí i na profilu.
    read: () => true,
    create: canCreate,
    update: ownerOnly,
    delete: ownerOnly,
  },
  upload: {
    // Soubory drží Cloudinary, ne disk kontejneru (ten nasazení nepřežije).
    disableLocalStorage: true,
    // Whitelist v prohlížeči; skutečnou kontrolu dělá hook níž (klientu nevěřit).
    mimeTypes: [...ALLOWED_MIME],
    // Ořez na čtverec děláme ZA uživatele — starý web po lidech chtěl, ať si
    // čtvercovou fotku připraví sami, jinak se avatar deformoval.
    resizeOptions: { width: 512, height: 512, position: 'centre', fit: 'cover' },
    // Zmenšování do konkrétních velikostí řeší Cloudinary přes URL
    // (viz cloudinary-loader), takže tu žádné imageSizes nepotřebujeme.
    crop: false,
    focalPoint: false,
    adminThumbnail: ({ doc }) => (doc.url as string) || null,
  },
  hooks: {
    beforeOperation: [
      async ({ args, operation }) => {
        if (operation !== 'create' && operation !== 'update') return args
        const file = args.req?.file
        if (!file) return args

        // Limity kontrolujeme na SERVERU. `mimeTypes` výš jen filtruje dialog
        // pro výběr souboru — ten se dá obejít, tohle ne.
        if (!ALLOWED_MIME.includes(file.mimetype)) {
          throw new Error('Avatar musí být JPEG, PNG nebo WebP.')
        }
        if (file.size > MAX_BYTES) {
          throw new Error('Avatar může mít nejvýš 2 MB.')
        }

        // Původní název souboru zahazujeme — bývá v něm jméno, datum nebo cesta
        // z cizího počítače a byl by veřejně v URL.
        const ext =
          file.mimetype === 'image/png' ? 'png' : file.mimetype === 'image/webp' ? 'webp' : 'jpg'
        const userId = args.req?.user?.id ?? 'x'
        file.name = `avatar-${userId}-${Date.now()}.${ext}`
        return args
      },
    ],
    beforeValidate: [
      async ({ req, operation }) => {
        if (operation !== 'create' || !req.user) return
        // `count`, ne `find` s limitem 0: netahá dokumenty, jen číslo.
        const { totalDocs } = await req.payload.count({
          collection: 'avatars',
          where: { owner: { equals: req.user.id } },
          // `req` kvůli transakci; overrideAccess proto, že jde o interní
          // kontrolu limitu, ne o čtení dat pro uživatele.
          req,
          overrideAccess: true,
        })
        if (totalDocs >= MAX_PER_USER) {
          // `APIError` s kódem 400 — obyčejná výjimka by z API vypadla jako
          // chyba serveru (500), i když je to chyba na straně volajícího.
          throw new APIError('Máš nahraných příliš mnoho fotek. Zkus to prosím za chvíli.', 400)
        }
      },
    ],
    beforeChange: [
      ({ data, req, operation }) => {
        // Vlastník se bere ze session, ne z dat — jinak by šlo nahrát avatar
        // „za někoho jiného" a pak mu ho měnit.
        if (operation === 'create' && req.user) {
          return { ...data, owner: req.user.id }
        }
        return data
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, req }) => {
        // Zrcadlo do R2 běží JEN v produkci (dev nahrává na dev Cloudinary účet,
        // který do produkčního bucketu nepatří) — stejná pravidla jako u Media.
        if (process.env.NODE_ENV !== 'production') return
        // Cloudinary plugin po dokončení uploadu spustí interní druhý cyklus
        // s tímto příznakem — až v něm jsou metadata (public_id) v dokumentu.
        if (req.context.skipCloudStorage !== true) return

        const { payload } = req
        const current = doc as AvatarR2Doc & { url?: string | null }
        const currentKey = avatarR2Key(current)
        if (currentKey) {
          enqueueAvatarR2(currentKey, () => mirrorAvatarToR2(payload, current))
        }

        // Výměna souboru pod stejným dokumentem: starý objekt v R2 nesmí zůstat.
        const previous = previousDoc as AvatarR2Doc | undefined
        const previousKey = previous ? avatarR2Key(previous) : null
        if (previousKey && previousKey !== currentKey) {
          enqueueAvatarR2(previousKey, () => removeAvatarFromR2(payload, previous as AvatarR2Doc))
        }
      },
    ],
    afterDelete: [
      async ({ doc, req }) => {
        // Smazání avataru (výměna z profilu maže celý dokument) → pryč i z R2.
        if (process.env.NODE_ENV !== 'production') return
        const { payload } = req
        const removed = doc as AvatarR2Doc
        const key = avatarR2Key(removed)
        if (key) {
          enqueueAvatarR2(key, () => removeAvatarFromR2(payload, removed))
        }
      },
    ],
  },
  fields: [
    {
      name: 'owner',
      type: 'relationship',
      relationTo: 'users',
      label: 'Patří uživateli',
      index: true,
      maxDepth: 0,
      admin: { readOnly: true, position: 'sidebar' },
      access: { update: noOneCanWrite },
    },
    {
      name: 'alt',
      type: 'text',
      label: 'Alternativní text',
      admin: { readOnly: true, position: 'sidebar' },
      access: { update: noOneCanWrite },
    },
  ],
}
