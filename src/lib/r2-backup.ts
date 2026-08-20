import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'

// Sdílený klient a pomocníci pro zálohu souborů do R2 (Cloudflare, S3 API).
// Používá kolekce Media (plná záloha se statusem) i Avatars (zrcadlo bez
// statusu — záloha drží jen aktuální avatar, staré verze se mažou kvůli
// soukromí: bucket je veřejně čitelný přes media-backup.ara.cz).

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
    'Missing R2 environment variables. Presence of S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET is highly recommended for media/avatar backups.',
  )
}

const cleanedEndpoint = s3Endpoint.endsWith(`/${s3Bucket}`)
  ? s3Endpoint.replace(`/${s3Bucket}`, '')
  : s3Endpoint

// Sdílený S3 klient pro celou aplikaci
const s3Client = new S3Client({
  region: 'auto',
  endpoint: cleanedEndpoint || 'https://placeholder-endpoint.com', // Placeholder pro případ chybějícího env, aby aplikace nespadla při startu
  credentials: {
    accessKeyId: s3AccessKeyId || 'missing',
    secretAccessKey: s3Secret || 'missing',
  },
  // Zálohy běží detached — zaseknuté spojení bez limitu by viselo navěky
  // (média by zůstala `pending`, fronta avatarů by se nikdy neuvolnila).
  requestHandler: { connectionTimeout: 5_000, requestTimeout: 30_000 },
})

export function isR2Configured(): boolean {
  return Boolean(s3Endpoint && s3Bucket && s3AccessKeyId && s3Secret)
}

// Čisté přípony pro běžné MIME typy (klíč v R2).
const R2_MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/octet-stream': 'bin',
}

/**
 * Klíč objektu v R2: `<cloudinary public_id>.<přípona>`. Stejný tvar očekává
 * media proxy (workers/media-proxy) při nouzovém podávání zálohy.
 */
export function resolveR2Key(
  cloudinaryPublicId: string,
  mimeType?: string | null,
  cloudinaryFormat?: string | null,
): string {
  const extension =
    cloudinaryFormat ||
    (mimeType ? R2_MIME_EXTENSIONS[mimeType] || mimeType.split('/')[1]?.split('+')[0] : 'bin') ||
    'bin'
  const safeExtension = extension === 'jpeg' ? 'jpg' : extension
  return `${cloudinaryPublicId}.${safeExtension}`
}

/** True, pokud objekt v R2 existuje; NotFound/404 vrací false, jiné chyby letí dál. */
export async function r2ObjectExists(key: string): Promise<boolean> {
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: s3Bucket, Key: key }))
    return true
  } catch (error) {
    const name = (error as { name?: string })?.name
    const httpStatus = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata
      ?.httpStatusCode
    if (name === 'NotFound' || httpStatus === 404) return false
    throw error
  }
}

export async function r2Put(options: {
  key: string
  body: Buffer
  contentType?: string | null
  metadata?: Record<string, string>
}): Promise<void> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: s3Bucket,
      Key: options.key,
      Body: options.body,
      ContentType: options.contentType || 'application/octet-stream',
      Metadata: options.metadata,
    }),
  )
}

/** Smazání je idempotentní — neexistující klíč není chyba. */
export async function r2Delete(key: string): Promise<void> {
  await s3Client.send(new DeleteObjectCommand({ Bucket: s3Bucket, Key: key }))
}

/** Všechny klíče pod prefixem (stránkuje; pro malé množiny jako avatars/). */
export async function r2ListKeys(prefix: string): Promise<string[]> {
  const keys: string[] = []
  let continuationToken: string | undefined
  do {
    const page = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: s3Bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    )
    for (const item of page.Contents ?? []) {
      if (item.Key) keys.push(item.Key)
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (continuationToken)
  return keys
}
