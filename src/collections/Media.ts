import type { CollectionConfig } from 'payload'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: () => true,
  },
  hooks: {
    beforeChange: [
      async ({ data, req, operation }) => {
        if ((operation === 'create' || operation === 'update') && req.file) {
          try {
            req.payload.logger.info(`Zahajuji zálohování do R2 pro soubor: ${req.file.name}`)
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
                Key: req.file.name,
                Body: req.file.data,
                ContentType: req.file.mimetype,
                Metadata: {
                  alt: encodeURIComponent(data.alt || ''),
                },
              }),
            )
            req.payload.logger.info(`Záloha souboru ${req.file.name} do R2 proběhla úspěšně.`)
          } catch (error) {
            req.payload.logger.error(
              `Chyba při zálohování do R2: ${error instanceof Error ? error.message : String(error)}`,
            )
          }
        }
        return data
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
