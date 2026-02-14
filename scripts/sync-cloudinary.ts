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

  console.log('Fetching resources from Cloudinary (TEST MODE: 5 items reset limits)...')

  // Pro testování stáhneme jen jednu dávku o 5 položkách
  const result = await cloudinary.api.resources({
    max_results: 10,
    resource_type: 'image',
    type: 'upload',
    context: true,
    tags: true,
  })

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

    const filename = resource.public_id.split('/').pop() + '.' + resource.format

    // Mapování dat
    const mediaData = {
      alt: resource.context?.custom?.alt || resource.context?.alt || resource.public_id,
      cloudinaryPublicId: resource.public_id,
      cloudinaryUrl: resource.secure_url,
      cloudinaryResourceType: resource.resource_type,
      cloudinaryFormat: resource.format,
      cloudinaryVersion: resource.version,
      originalUrl: resource.secure_url,
      transformedUrl: resource.secure_url,
      url: resource.secure_url,
      filename: filename,
      mimeType: `image/${resource.format}`,
      filesize: resource.bytes,
      width: resource.width,
      height: resource.height,
      updatedAt: new Date().toISOString(),
      createdAt: new Date(resource.created_at).toISOString(),
    }

    try {
      const db = payload.db
      // @ts-ignore
      if (db.drizzle && db.schema && db.schema.media) {
        // @ts-ignore
        await db.drizzle.insert(db.schema.media).values(mediaData)
        console.log(`Inserted ${resource.public_id}`)
        inserted++
      } else {
        console.error('Could not access Drizzle schema for media table.')
        process.exit(1)
      }
    } catch (err) {
      console.error(`Error inserting ${resource.public_id}:`, err)
    }
  }

  console.log(
    `Sync complete. Total processed: ${count}, Inserted: ${inserted}, Skipped: ${skipped}`,
  )
  process.exit(0)
}

syncCloudinaryToPayload()
