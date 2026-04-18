import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
dotenv.config({ path: path.resolve(dirname, '../.env') })

import { v2 as cloudinary } from 'cloudinary'

// --- Config ---
const dirArg = process.argv.find((a) => a.startsWith('--dir='))
const SOURCE_DIR = dirArg
  ? path.resolve(process.cwd(), dirArg.slice(6))
  : path.resolve(dirname, '../../ara-nextjs-frontend/grails/cms/images')
const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']
const DRY_RUN = process.argv.includes('--dry-run')

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

/**
 * Recursively collects image files from sourceDir.
 * Returns { filePath, publicId } pairs.
 * publicId is the path relative to sourceDir, without extension, using forward slashes.
 * e.g. "0ab/caf35e0e2c3f6be2b9218a72aceae"
 */
function collectImages(dir: string, baseDir: string = dir): { filePath: string; publicId: string }[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const result: { filePath: string; publicId: string }[] = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      result.push(...collectImages(fullPath, baseDir))
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase()
      if (!SUPPORTED_EXTENSIONS.includes(ext)) continue

      const relative = path.relative(baseDir, fullPath)
      // public_id without extension, forward slashes
      const publicId = relative.replace(/\\/g, '/').replace(/\.[^.]+$/, '')
      result.push({ filePath: fullPath, publicId })
    }
  }

  return result
}

/**
 * Check whether a public_id already exists in Cloudinary.
 */
async function existsInCloudinary(publicId: string): Promise<boolean> {
  try {
    await cloudinary.api.resource(publicId)
    return true
  } catch (err: any) {
    if (err?.http_code === 404 || err?.error?.http_code === 404) return false
    throw err
  }
}

async function run() {
  console.log(`Source dir: ${SOURCE_DIR}`)
  console.log(`Dry run: ${DRY_RUN}`)
  console.log('')

  // Verify Cloudinary connection
  try {
    await cloudinary.api.ping()
    console.log('✓ Connected to Cloudinary\n')
  } catch {
    console.error('✗ Could not connect to Cloudinary — check credentials')
    process.exit(1)
  }

  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`✗ Source directory not found: ${SOURCE_DIR}`)
    process.exit(1)
  }

  const images = collectImages(SOURCE_DIR)
  console.log(`Found ${images.length} image(s)\n`)

  let uploaded = 0
  let skipped = 0
  let failed = 0

  for (const { filePath, publicId } of images) {
    process.stdout.write(`  ${publicId} ... `)

    if (DRY_RUN) {
      // In dry run, check existence without uploading
      const exists = await existsInCloudinary(publicId)
      if (exists) {
        console.log('skipped (already exists)')
        skipped++
      } else {
        console.log('would upload')
        uploaded++
      }
      continue
    }

    try {
      const result = await cloudinary.uploader.upload(filePath, {
        public_id: publicId,
        overwrite: false,
        invalidate: false,
        resource_type: 'image',
      })
      // When overwrite=false and asset already exists, Cloudinary returns 200
      // with the existing resource — detect this by comparing created_at vs current time
      const createdAt = new Date(result.created_at).getTime()
      const isNew = Date.now() - createdAt < 10_000
      if (isNew) {
        console.log('uploaded ✓')
        uploaded++
      } else {
        console.log('skipped (already exists)')
        skipped++
      }
    } catch (err: any) {
      // Cloudinary returns 409 when overwrite=false and asset already exists
      if (err?.http_code === 409 || err?.error?.http_code === 409) {
        console.log('skipped (already exists)')
        skipped++
      } else {
        console.error(`failed: ${err?.message ?? err}`)
        failed++
      }
    }
  }

  console.log('')
  console.log('--- Summary ---')
  console.log(`  Uploaded : ${uploaded}`)
  console.log(`  Skipped  : ${skipped}`)
  console.log(`  Failed   : ${failed}`)
}

run().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
