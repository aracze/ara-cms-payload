import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

// 1. Načtení environment proměnných MUSÍ být první (před importem configu)
const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

// 2. Teprve nyní můžeme importovat Payload a Cloudinary
import { getPayload } from 'payload'
import { v2 as cloudinary } from 'cloudinary'

async function syncCloudinaryToPayload() {
  console.log('Starting sync process...')

  // Importujeme config dynamicky, aby se načetl až po dotenv
  const config = (await import('../src/payload.config')).default

  // Inicializace Payload
  const payload = await getPayload({ config })

  // Konfigurace Cloudinary
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  })

  // Zkontrolujeme spojení s Cloudinary
  try {
    await cloudinary.api.ping()
    console.log('Connected to Cloudinary successfully.')
  } catch (error) {
    console.error('Failed to connect to Cloudinary:', error)
    process.exit(1)
  }

  let next_cursor = null
  let count = 0
  let skipped = 0
  let inserted = 0
  let failures = 0

  console.log('Fetching all resources from Cloudinary...')

  do {
    const result = await cloudinary.api.resources({
      max_results: 500, // Maximum allowed by Cloudinary Admin API
      next_cursor: next_cursor,
      resource_type: 'image',
      type: 'upload',
      context: true,
      tags: true,
    })

    next_cursor = result.next_cursor

    for (const resource of result.resources) {
      count++

      // Zkontrolujeme, zda již existuje v DB
      const existing = await payload.find({
        collection: 'media',
        where: {
          cloudinaryPublicId: { equals: resource.public_id },
        },
        limit: 1,
      })

      if (existing.totalDocs > 0) {
        console.log(`Skipping ${resource.public_id} (already exists)`)
        skipped++
        continue
      }

      let filename = resource.public_id.replace(/\//g, '_') + '.' + resource.format
      if (resource.public_id.startsWith('avatars/')) {
        filename = 'avatar_' + filename.replace('avatars_', '')
      }

      // Generování URL pro thumbnail (150x150)
      const baseUrl = resource.secure_url.split('/upload/')[0] + '/upload/'
      const transformPath = 'c_fill,f_auto,g_auto,h_150,q_auto,w_150/'
      const versionAndId = resource.secure_url.split('/upload/')[1]
      const thumbnailURL = `${baseUrl}${transformPath}${versionAndId}`

      // Mapování dat - musí odpovídat schématu v DB
      const mediaData = {
        alt: resource.context?.custom?.alt || resource.context?.alt || null,
        cloudinaryPublicId: resource.public_id,
        cloudinaryUrl: resource.secure_url,
        cloudinaryResourceType: resource.resource_type,
        cloudinaryFormat: resource.format,
        cloudinaryVersion: resource.version.toString(),
        originalUrl: resource.secure_url,
        transformedUrl: null, // Podle pluginu je NULL, dokud nejsou vybrány presety
        thumbnailURL: thumbnailURL,
        url: resource.secure_url,
        filename: filename,
        mimeType: `image/${resource.format}`,
        filesize: resource.bytes,
        width: resource.width,
        height: resource.height,
        focalX: 50,
        focalY: 50,
        updatedAt: new Date().toISOString(),
        createdAt: new Date(resource.created_at).toISOString(),
      }

      try {
        const db = payload.db
        // @ts-ignore
        if (db.drizzle && db.schema && db.schema.media) {
          // @ts-ignore
          await db.drizzle.insert(db.schema.media).values(mediaData)
          console.log(`Inserted ${resource.public_id} (${count} processed)`)
          inserted++
        } else {
          console.error('Could not access Drizzle schema for media table.')
          process.exit(1)
        }
      } catch (err) {
        console.error(`Error inserting ${resource.public_id}:`, err)
        failures++
      }
    }
  } while (next_cursor)

  console.log(
    `Sync complete. Total processed: ${count}, Inserted: ${inserted}, Skipped: ${skipped}, Failures: ${failures}`,
  )
  process.exit(failures > 0 ? 1 : 0)
}

syncCloudinaryToPayload()
