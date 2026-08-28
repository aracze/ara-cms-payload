import type { CollectionConfig, Payload } from 'payload'
import { APIError } from 'payload'
import sharp from 'sharp'
import { isAdmin } from '../access/isAdmin'
import { isAdminOrEditor } from '../access/isAdminOrEditor'
import { isR2Configured, r2ObjectExists, r2Put, resolveR2Key } from '../lib/r2-backup'

const sanitizeFilename = (name: string): string => {
  const parts = name.split('.')

  let baseName = ''
  let extension = ''

  if (name.startsWith('.') && parts.length === 2) {
    // Dotfile case: ".htaccess" -> baseName: "htaccess", extension: ""
    baseName = parts[1]
    extension = ''
  } else {
    extension = parts.length > 1 ? parts.pop() || '' : ''
    baseName = parts.join('.')
  }

  let sanitizedBase = baseName
    .toLowerCase()
    .normalize('NFD') // Rozloží české znaky (např. 'š' -> 's' + háček)
    .replace(/[\u0300-\u036f]/g, '') // Odstraní háčky a čárky
    .replace(/[^a-z0-9]/g, '-') // Vše kromě písmen a čísel nahradí pomlčkou
    .replace(/-+/g, '-') // Odstraní vícenásobné pomlčky
    .replace(/^-|-$/g, '') // Odstraní pomlčku na začátku/konci

  if (sanitizedBase === '') {
    sanitizedBase = `file-${Date.now()}`
  }

  return extension ? `${sanitizedBase}.${extension.toLowerCase()}` : sanitizedBase
}

// Nejnovější „generace" R2 zálohy pro daný doc (in-memory, per-proces). Detached
// zálohy téhož média mohou doběhnout mimo pořadí; před zápisem statusu proto
// ověříme, že tahle záloha je pořád ta nejnovější — jinak by starší doběhnutí
// přepsalo status novější. Paměť jednoho procesu stačí (stejně jako u samotné
// detached zálohy), žádná změna DB schématu.
const latestBackupGen = new Map<string | number, number>()
let backupGenCounter = 0

// Kolik nedodělaných záloh dohnat za jedno nahrání (dorovnání), ať se to při
// větším nevyřízeném zbytku nerozjede najednou.
const R2_RECONCILE_BATCH = 20

// Timeout stažení z Cloudinary. Obrázky se tahají v jednotkách sekund; 15 s je
// pojistka proti zaseknutému spojení — bez ní by záloha nikdy nedoběhla (status
// by zůstal `pending` a položka by visela v `latestBackupGen`). Po timeoutu se
// zapíše `error` a dorovnání to zkusí příště znovu.
const R2_FETCH_TIMEOUT_MS = 15_000

type R2BackupMedia = {
  id: string | number
  cloudinaryPublicId: string
  url: string
  mimeType?: string | null
  cloudinaryFormat?: string | null
  alt?: string | null
}

// Záloha JEDNOHO média do R2. Volá se `void`em (DETACHED, bez `req`): stažení
// z Cloudinary + upload je pomalé síťové I/O a nesmí držet DB spojení requestu.
// Generation-guard (latestBackupGen) brání staršímu doběhnutí přepsat status
// novější zálohy téhož média. Nahrání do R2 jde pod stejný klíč → idempotentní.
async function backupMediaToR2(
  payload: Payload,
  media: R2BackupMedia,
  opts?: { skipIfInR2?: boolean },
): Promise<void> {
  const { id, cloudinaryPublicId, url, mimeType, cloudinaryFormat, alt } = media
  const r2Key = resolveR2Key(cloudinaryPublicId, mimeType, cloudinaryFormat)

  const backupGen = ++backupGenCounter
  latestBackupGen.set(id, backupGen)
  const isStale = () => latestBackupGen.get(id) !== backupGen

  try {
    if (!isR2Configured()) {
      throw new Error('Chybí konfigurace R2 (environment variables)')
    }

    // Dorovnání (`skipIfInR2`): když objekt v R2 UŽ je, přeskočíme stažení+upload
    // a jen narovnáme status — šetří přenos i Cloudinary requesty (klíčové při
    // hromadném narovnání backlogu). Při čerstvém nahrání (bez `skipIfInR2`)
    // nahráváme vždy, ať se aktuální soubor do R2 opravdu dostane.
    const alreadyInR2 = opts?.skipIfInR2 ? await r2ObjectExists(r2Key) : false

    if (alreadyInR2) {
      payload.logger.info(`R2: ${r2Key} už existuje — jen dorovnávám status na success.`)
    } else {
      payload.logger.info(`Zahajuji zálohování do R2 (stahuji z Cloudinary): ${r2Key}`)

      const response = await fetch(url, { signal: AbortSignal.timeout(R2_FETCH_TIMEOUT_MS) })
      if (!response.ok) {
        throw new Error(`Načtení z Cloudinary selhalo: ${response.statusText}`)
      }

      const buffer = Buffer.from(await response.arrayBuffer())

      await r2Put({
        key: r2Key,
        body: buffer,
        contentType: mimeType,
        metadata: { alt: encodeURIComponent(alt || '') },
      })

      payload.logger.info(`Záloha souboru ${r2Key} do R2 proběhla úspěšně.`)
    }

    // Status zapíšeme jen když je tahle záloha pořád nejnovější (jinak přepisujeme
    // výsledek novější). Zápis BEZ `req` = vlastní krátká transakce; `skipR2Backup`
    // brání rekurzi afterChange.
    if (isStale()) {
      payload.logger.info(`R2 status pro ${r2Key} přeskočen — běží novější záloha.`)
      return
    }
    await payload.update({
      collection: 'media',
      id,
      data: { r2BackupStatus: 'success' },
      context: { skipR2Backup: true },
    })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    payload.logger.error(`Chyba při zálohování do R2 (${r2Key}): ${errorMsg}`)

    if (isStale()) return
    await payload
      .update({
        collection: 'media',
        id,
        data: { r2BackupStatus: 'error' },
        context: { skipR2Backup: true },
      })
      .catch(() => {})
  } finally {
    // Úklid: pokud je tahle záloha pořád nejnovější, odregistrujeme ji (mapa tak
    // drží jen běžící zálohy).
    if (latestBackupGen.get(id) === backupGen) latestBackupGen.delete(id)
  }
}

// Dorovnání: dožene média, jejichž záloha nedoběhla (`r2BackupStatus` `pending`
// nebo `error` — výpadek při nahrávání, restart serveru…). Spouští se při každém
// nahrání (viz afterChange), takže není potřeba cron — cena je, že se nedodělané
// zálohy dorovnají až s dalším uploadem (časová záruka není potřeba). Bere jen
// malou dávku.
async function reconcilePendingBackups(payload: Payload): Promise<void> {
  try {
    const res = await payload.find({
      collection: 'media',
      where: { r2BackupStatus: { in: ['pending', 'error'] } },
      limit: R2_RECONCILE_BATCH,
      depth: 0,
      overrideAccess: true,
    })

    for (const media of res.docs as unknown as Array<Record<string, unknown>>) {
      const id = media.id as string | number
      const cloudinaryPublicId = media.cloudinaryPublicId as string | undefined
      const url = media.url as string | undefined
      if (!cloudinaryPublicId || !url) continue // nemá co zálohovat
      if (latestBackupGen.has(id)) continue // už se právě zálohuje
      void backupMediaToR2(
        payload,
        {
          id,
          cloudinaryPublicId,
          url,
          mimeType: media.mimeType as string | undefined,
          cloudinaryFormat: media.cloudinaryFormat as string | undefined,
          alt: media.alt as string | undefined,
        },
        { skipIfInR2: true },
      )
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    payload.logger.error(`R2 dorovnání (reconcile) selhalo: ${errorMsg}`)
  }
}

// Cloudinary odmítne soubor nad 10 MiB — limit našeho tarifu. Vrátí 400
// („File size too large. Got 11212782. Maximum is 10485760."), plugin z toho
// udělá výjimku a admin ukáže jen nicneříkající „Something went wrong". Proto to
// řešíme dřív, než se soubor k nahrání vůbec dostane.
// Exportované kvůli regresnímu testu (tests/int/media-shrink.int.spec.ts).
export const CLOUDINARY_MAX_BYTES = 10 * 1024 * 1024

// Cíl zmenšení držíme pod stropem s rezervou: JPEG encoder výslednou velikost
// dopředu nezná, takže mířit přesně na hranici by znamenalo občas přestřelit.
const DOWNSCALE_TARGET_BYTES = Math.floor(CLOUDINARY_MAX_BYTES * 0.92)

// Formáty, které umíme zmenšit BEZ změny typu souboru. SVG schválně chybí —
// rasterizací by přišlo o to, čím je (vektor), a SVG nad 10 MB je stejně
// patologie, ne běžný případ.
const DOWNSCALABLE_MIME: readonly string[] = ['image/jpeg', 'image/png', 'image/webp']

// Kolik pokusů na zmenšení. První jen překóduje, další korigují rozměry podle
// toho, o kolik předchozí výsledek přestřelil — dvě tři iterace stačí i na extrémy.
const DOWNSCALE_MAX_ATTEMPTS = 5

const formatMb = (bytes: number): string => (bytes / 1024 / 1024).toFixed(1)

/** Zakóduje zmenšený obrázek ZPĚT do původního formátu (typ souboru se nemění). */
function encodeSameFormat(pipeline: sharp.Sharp, mimetype: string): Promise<Buffer> {
  if (mimetype === 'image/png') return pipeline.png({ compressionLevel: 9 }).toBuffer()
  if (mimetype === 'image/webp') return pipeline.webp({ quality: 88 }).toBuffer()
  return pipeline.jpeg({ quality: 88 }).toBuffer()
}

/**
 * Zmenší PŘÍLIŠ VELKÝ obrázek tak, aby ho Cloudinary přijalo — a jen takový.
 * Soubory pod limitem se touhle cestou vůbec nevydají a jdou nahoru bit v bit,
 * protože `media: true` v payload.config.ts drží originály schválně (smazaný
 * záznam nesmí znamenat ztrátu originálu).
 *
 * Postup je od nejmenší ztráty k největší: nejdřív úspornější překódování
 * v plném rozlišení, a teprve když to nestačí, zmenšování rozměrů. Ani to není
 * vidět — web plné rozlišení nikdy neservíruje, varianty dělá Cloudinary přes URL.
 * Mutuje `file` na místě, stejně jako sanitizace názvu výš.
 *
 * Bere jen `logger`, ne celý `Payload`: nic jiného z něj nepotřebuje a díky tomu
 * se dá otestovat bez databáze i bez Cloudinary (viz regresní test). Testy jinak
 * sdílejí `.env` s vývojovou databází, takže inicializace Payloadu v testu je
 * v tomhle projektu nežádoucí.
 */
export async function shrinkToFitCloudinary(
  logger: { info: (msg: string) => void },
  file: { data: Buffer; mimetype: string; name: string; size: number },
): Promise<void> {
  const originalMb = formatMb(file.size)

  if (!DOWNSCALABLE_MIME.includes(file.mimetype)) {
    // `APIError` s kódem 400, ne obyčejná výjimka — ta by z API vypadla jako
    // chyba serveru (500), i když je to chyba na straně volajícího.
    throw new APIError(
      `Soubor „${file.name}" je příliš velký (${originalMb} MB). Nahrát lze nejvýš 10 MB a tenhle typ souboru za vás zmenšit neumíme — zmenšete ho prosím ručně.`,
      400,
    )
  }

  // Chybu sharpu MUSÍME přeložit na 400. MIME typ posílá prohlížeč podle
  // přípony, takže přejmenovaný nebo nedotažený soubor kontrolu typu výš projde
  // a spadne až tady — a neošetřená výjimka by z API vypadla jako 500, tedy zas
  // ta „Something went wrong", kterou tímhle celým odstraňujeme.
  const unprocessable = () =>
    new APIError(
      `Soubor „${file.name}" je příliš velký (${originalMb} MB) a nepodařilo se ho zpracovat jako obrázek — může být poškozený nebo mít jinou příponu, než čemu odpovídá obsah. Zmenšete ho prosím ručně na méně než 10 MB.`,
      400,
    )

  let width: number | undefined
  let height: number | undefined
  try {
    ;({ width, height } = await sharp(file.data).metadata())
  } catch {
    throw unprocessable()
  }
  if (!width || !height) throw unprocessable()

  const longestEdge = Math.max(width, height)
  let scale = 1
  let buffer = file.data

  for (let attempt = 1; attempt <= DOWNSCALE_MAX_ATTEMPTS; attempt++) {
    // První pokus zkusí JEN překódovat, v původním rozlišení. Fotky z fotoaparátu
    // bývají uložené v maximální kvalitě, takže úspornější překódování je často
    // dostane pod limit samo — a rozlišení pak zůstane plné. Teprve když to
    // nestačí, jdeme na rozměry.
    if (attempt > 1) {
      // Odmocnina, protože bajty rostou s PLOCHOU, ne s délkou hrany. Koeficient
      // 0,98 je rezerva, ať se netrefujeme těsně nad cíl a nemusíme iterovat zbytečně.
      scale *= Math.sqrt(DOWNSCALE_TARGET_BYTES / buffer.length) * 0.98
    }
    const maxEdge = Math.max(1, Math.round(longestEdge * scale))

    // Zmenšujeme vždy z PŮVODNÍHO souboru (`file.data`), ne z výsledku
    // předchozího pokusu — jinak by se generační ztráta kvality sčítala.
    // `.rotate()` musí být před `resize`: zapeče orientaci z EXIFu do pixelů.
    // Bez toho by se u fotek z mobilu ztratila (sharp metadata při re-enkódu
    // zahazuje) a obrázek by se zobrazoval otočený.
    try {
      buffer = await encodeSameFormat(
        sharp(file.data)
          .rotate()
          .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true }),
        file.mimetype,
      )
    } catch {
      // Hlavička se přečetla, ale dekódování pixelů selhalo (typicky nedotažený
      // soubor). Zase 400, ne 500.
      throw unprocessable()
    }

    // Přijímáme na SKUTEČNÉM limitu, ne na cíli s rezervou. Kdyby překódování
    // vyšlo třeba na 9,8 MB, Cloudinary to bez řečí vezme — a jít do další
    // iterace by znamenalo obětovat rozlišení úplně zbytečně. Rezerva
    // (DOWNSCALE_TARGET_BYTES) slouží jen k MÍŘENÍ při výpočtu měřítka.
    if (buffer.length <= CLOUDINARY_MAX_BYTES) {
      file.data = buffer
      file.size = buffer.length
      logger.info(
        `Obrázek „${file.name}" (${originalMb} MB) přesahoval limit Cloudinary, zmenšen na ${formatMb(buffer.length)} MB — ${
          attempt === 1
            ? `rozlišení zachováno (${width}x${height})`
            : `nejdelší hrana ${maxEdge} px, ${attempt}. pokus`
        }.`,
      )
      return
    }
  }

  throw new APIError(
    `Soubor „${file.name}" (${originalMb} MB) se nepodařilo zmenšit pod limit 10 MB. Zmenšete ho prosím ručně.`,
    400,
  )
}

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: () => true,
    // Nahrávání/úpravy médií jen admin/editor; mazání jen admin. Bez těchto
    // pravidel by Payload povolil zápis KAŽDÉMU přihlášenému (i roli `user`).
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdmin,
  },
  hooks: {
    beforeOperation: [
      async ({ args, operation }) => {
        if ((operation === 'create' || operation === 'update') && args.req?.file) {
          const original = args.req.file.name
          const sanitized = sanitizeFilename(original)
          if (sanitized !== original) {
            args.req.file.name = sanitized
          }

          // Až po sanitizaci, ať případná chyba i log zmiňují ten název, který
          // opravdu půjde do Cloudinary.
          if (args.req.file.size > CLOUDINARY_MAX_BYTES) {
            await shrinkToFitCloudinary(args.req.payload.logger, args.req.file)
          }
        }
        return args
      },
    ],
    afterChange: [
      async ({ doc, req }) => {
        // Zabezpečíme inicializaci kontextu pro konzistentní přístup
        req.context = req.context || {}

        // R2 záloha běží JEN v produkci. V dev režimu (`pnpm dev`) se obrázky
        // nahrávají na dev Cloudinary účet a do produkčního R2 bucketu nepatří.
        if (process.env.NODE_ENV !== 'production') return

        // Zabráníme nekonečnému cyklu při aktualizaci statusu
        if (req.context.skipR2Backup) return

        // Cloudinary plugin po dokončení uploadu spustí interní update s tímto příznakem.
        // To je moment, kdy jsou všechna metadata v DB a můžeme spustit zálohu do R2.
        const isSecondCycle = req.context.skipCloudStorage === true
        if (!isSecondCycle) return

        const { payload } = req

        const cloudinaryPublicId = doc.cloudinaryPublicId as string | undefined
        const cloudinaryUrl = doc.url as string | undefined

        // 1) Záloha právě nahraného souboru (detached — nedrží DB spojení requestu).
        if (cloudinaryPublicId && cloudinaryUrl) {
          void backupMediaToR2(payload, {
            id: doc.id,
            cloudinaryPublicId,
            url: cloudinaryUrl,
            mimeType: doc.mimeType as string | undefined,
            cloudinaryFormat: doc.cloudinaryFormat as string | undefined,
            alt: doc.alt as string | undefined,
          })
        } else {
          payload.logger.warn({
            msg: 'R2 afterChange: Druhý cyklus detekován, ale chybí Cloudinary data pro zálohu.',
            docId: doc.id,
            cloudinaryPublicId,
            hasUrl: !!cloudinaryUrl,
          })
        }

        // 2) Dorovnání: každé nahrání zároveň dožene případné dřívější nedodělané
        //    zálohy (pending/error) — díky tomu není potřeba cron.
        void reconcilePendingBackups(payload)
      },
    ],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
    },
    {
      name: 'isCreativeCommons',
      label: 'Obrázek je Creative Commons',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'author',
      type: 'text',
      admin: {
        condition: (data) => data?.isCreativeCommons,
      },
    },
    {
      type: 'row',
      admin: {
        condition: (data) => data?.isCreativeCommons,
      },
      fields: [
        {
          name: 'source',
          type: 'text',
          admin: {
            width: '33%',
          },
        },
        {
          name: 'sourceLink',
          type: 'text',
          admin: {
            width: '33%',
          },
        },
        {
          name: 'creativeCommonsLicense',
          type: 'text',
          admin: {
            width: '33%',
          },
        },
      ],
    },
    {
      name: 'r2BackupStatus',
      type: 'select',
      access: {
        update: () => false,
      },
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Success', value: 'success' },
        { label: 'Error', value: 'error' },
      ],
      defaultValue: 'pending',
    },
  ],
  upload: {
    disableLocalStorage: true,
    adminThumbnail: ({ doc }) => (doc.thumbnailURL as string) || (doc.url as string) || null,
  },
}
