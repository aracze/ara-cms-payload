import type { CollectionConfig } from 'payload'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const s3Endpoint = process.env.S3_ENDPOINT || ''
const s3Bucket = process.env.S3_BUCKET || ''
const s3AccessKeyId = process.env.S3_ACCESS_KEY_ID || ''
const s3Secret = process.env.S3_SECRET || ''

// Validace S3/R2 konfigurace při inicializaci modulu
if (
  process.env.NODE_ENV !== 'development' &&
  (!s3Endpoint || !s3Bucket || !s3AccessKeyId || !s3Secret)
) {
  console.warn(
    'Missing R2 environment variables. Presence of S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET is highly recommended for Media collection.',
  )
}

const cleanedEndpoint = s3Endpoint.endsWith(`/${s3Bucket}`)
  ? s3Endpoint.replace(`/${s3Bucket}`, '')
  : s3Endpoint

// Vytvoření sdíleného S3 klienta pro celou aplikaci
const s3Client = new S3Client({
  region: 'auto',
  endpoint: cleanedEndpoint || 'https://placeholder-endpoint.com', // Placeholder pro případ chybějícího env, aby aplikace nespadla při startu
  credentials: {
    accessKeyId: s3AccessKeyId || 'missing',
    secretAccessKey: s3Secret || 'missing',
  },
})

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

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: () => true,
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
        }
        return args
      },
    ],
    afterChange: [
      async ({ doc, req }) => {
        // Zabezpečíme inicializaci kontextu pro konzistentní přístup
        req.context = req.context || {}

        // Zabráníme nekonečnému cyklu při aktualizaci statusu
        if (req.context.skipR2Backup) return

        // Cloudinary plugin po dokončení uploadu spustí interní update s tímto příznakem.
        // To je moment, kdy jsou všechna metadata v DB a můžeme spustit zálohu do R2.
        const isSecondCycle = req.context.skipCloudStorage === true
        if (!isSecondCycle) return

        const cloudinaryPublicId = doc.cloudinaryPublicId as string | undefined
        const cloudinaryUrl = doc.url as string | undefined
        const mimeType = doc.mimeType as string | undefined

        // Pokud nemáme ID nebo URL, nejde o nahrání souboru, které bychom chtěli zálohovat
        if (!cloudinaryPublicId || !cloudinaryUrl) {
          req.payload.logger.warn({
            msg: 'R2 afterChange: Druhý cyklus detekován, ale chybí Cloudinary data pro zálohu.',
            docId: doc.id,
            cloudinaryPublicId,
            hasUrl: !!cloudinaryUrl,
          })
          return
        }

        const cloudinaryFormat = doc.cloudinaryFormat as string | undefined

        // Definice čistých přípon pro běžné MIME typy (R2 backup)
        const mimeMap: Record<string, string> = {
          'image/jpeg': 'jpg',
          'image/png': 'png',
          'image/svg+xml': 'svg',
          'image/webp': 'webp',
          'application/pdf': 'pdf',
          'application/octet-stream': 'bin',
        }

        const extension =
          cloudinaryFormat ||
          (mimeType ? mimeMap[mimeType] || mimeType.split('/')[1]?.split('+')[0] : 'bin') ||
          'bin'

        const safeExtension = extension === 'jpeg' ? 'jpg' : extension
        const r2Key = `${cloudinaryPublicId}.${safeExtension}`

        try {
          if (!s3Endpoint || !s3Bucket || !s3AccessKeyId || !s3Secret) {
            throw new Error('Chybí konfigurace R2 (environment variables)')
          }

          req.payload.logger.info(`Zahajuji zálohování do R2 (stahuji z Cloudinary): ${r2Key}`)

          const response = await fetch(cloudinaryUrl)
          if (!response.ok) {
            throw new Error(`Načtení z Cloudinary selhalo: ${response.statusText}`)
          }

          const arrayBuffer = await response.arrayBuffer()
          const buffer = Buffer.from(arrayBuffer)

          await s3Client.send(
            new PutObjectCommand({
              Bucket: s3Bucket,
              Key: r2Key,
              Body: buffer,
              ContentType: mimeType || 'application/octet-stream',
              Metadata: {
                alt: encodeURIComponent((doc.alt as string) || ''),
              },
            }),
          )

          req.payload.logger.info(`Záloha souboru ${r2Key} do R2 proběhla úspěšně.`)

          // Aktualizace statusu zálohy v DB
          await req.payload.update({
            collection: 'media',
            id: doc.id,
            data: { r2BackupStatus: 'success' },
            req,
            context: { skipR2Backup: true },
          })
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          req.payload.logger.error(`Chyba při zálohování do R2: ${errorMsg}`)

          // Záznam chyby pro pozdější opravu
          await req.payload.update({
            collection: 'media',
            id: doc.id,
            data: { r2BackupStatus: 'error' },
            req,
            context: { skipR2Backup: true },
          })
        }
      },
    ],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
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
