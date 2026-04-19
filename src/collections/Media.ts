import type { CollectionConfig } from 'payload'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const sanitizeFilename = (name: string): string => {
  const parts = name.split('.')
  const extension = parts.length > 1 ? parts.pop() : ''
  const baseName = parts.join('.')

  const sanitizedBase = baseName
    .toLowerCase()
    .normalize('NFD') // Rozloží české znaky (např. 'š' -> 's' + háček)
    .replace(/[\u0300-\u036f]/g, '') // Odstraní háčky a čárky
    .replace(/[^a-z0-9]/g, '-') // Vše kromě písmen a čísel nahradí pomlčkou
    .replace(/-+/g, '-') // Odstraní vícenásobné pomlčky
    .replace(/^-|-$/g, '') // Odstraní pomlčku na začátku/konci

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
        // Cloudinary upload probíhá v afterChange pluginu PO nás.
        // Plugin po dokončení uploadu spustí interní update s req.context.skipCloudStorage = true.
        // V tomto druhém cyklu je doc.cloudinaryPublicId již znám — teprve zde zálohujeme do R2.
        const isSecondCycle = req.context?.skipCloudStorage === true
        const cloudinaryPublicId = doc.cloudinaryPublicId as string | undefined

        // První cyklus: Máme soubor, ale nemáme Cloudinary ID. Uložíme si data do paměti requestu.
        if (!isSecondCycle && req.file) {
          req.context.r2FileBackup = req.file.data
          req.context.r2MimeBackup = req.file.mimetype
          return
        }

        // Druhý cyklus (spuštěný pluginem): Máme Cloudinary ID, a získáme soubor z paměti.
        const fileBuffer = req.context?.r2FileBackup as Buffer | undefined
        const mimeType = req.context?.r2MimeBackup as string | undefined

        if (!isSecondCycle || !cloudinaryPublicId || !fileBuffer || !mimeType) {
          return
        }

        const cloudinaryFormat = doc.cloudinaryFormat as string | undefined
        const r2Key = `${cloudinaryPublicId}.${cloudinaryFormat || mimeType.split('/')[1]}`

        try {
          req.payload.logger.info(`Zahajuji zálohování do R2 pro soubor: ${r2Key}`)
          const rawEndpoint = process.env.S3_ENDPOINT as string
          const cleanedEndpoint = rawEndpoint.endsWith(`/${process.env.S3_BUCKET}`)
            ? rawEndpoint.replace(`/${process.env.S3_BUCKET}`, '')
            : rawEndpoint

          const s3 = new S3Client({
            region: 'auto',
            endpoint: cleanedEndpoint,
            credentials: {
              accessKeyId: process.env.S3_ACCESS_KEY_ID as string,
              secretAccessKey: process.env.S3_SECRET as string,
            },
          })

          await s3.send(
            new PutObjectCommand({
              Bucket: process.env.S3_BUCKET as string,
              Key: r2Key,
              Body: fileBuffer,
              ContentType: mimeType,
              Metadata: {
                alt: encodeURIComponent((doc.alt as string) || ''),
              },
            }),
          )
          req.payload.logger.info(`Záloha souboru ${r2Key} do R2 proběhla úspěšně.`)
        } catch (error) {
          req.payload.logger.error(
            `Chyba při zálohování do R2: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      },
    ],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
    },
  ],
  upload: {
    disableLocalStorage: true,
    adminThumbnail: ({ doc }) => (doc.thumbnailURL as string) || (doc.url as string) || null,
  },
}
