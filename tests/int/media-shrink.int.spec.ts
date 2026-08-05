import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { CLOUDINARY_MAX_BYTES, Media, shrinkToFitCloudinary } from '@/collections/Media'

/**
 * Regresní test na automatické zmenšování obrázků nad limit Cloudinary.
 *
 * Cloudinary odmítne soubor nad 10 MiB, což se v adminu projevilo jen jako
 * nicneříkající „Something went wrong" (HTTP 500). Hook v kolekci Media proto
 * velký obrázek sám zmenší. Ta logika není nikde vidět, takže by se dala tiše
 * rozbít (jiná verze sharpu, přeskládané hooky) — proto tenhle test.
 *
 * Testujeme funkci PŘÍMO, ne přes `payload.create()`. Integrační varianta by
 * musela inicializovat Payload, který v tomhle projektu sdílí `.env` s vývojovou
 * databází (a spustil by dotaz na push schématu), a navíc by nahrávala testovací
 * soubory na skutečný Cloudinary účet. Funkce si vystačí s loggerem, takže je to
 * zbytečné.
 */

const logger = { info: () => {} }

/** JPEG ze šumu — nedá se zkomprimovat na nic, takže velikost je předvídatelná. */
async function noisyJpeg(
  width: number,
  height: number,
  opts?: { quality?: number; orientation?: number },
): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3)
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) % 256

  let pipeline = sharp(raw, { raw: { width, height, channels: 3 } })
  if (opts?.orientation) pipeline = pipeline.withMetadata({ orientation: opts.orientation })
  return pipeline.jpeg({ quality: opts?.quality ?? 95 }).toBuffer()
}

function fileFrom(buffer: Buffer, name: string, mimetype: string) {
  return { data: buffer, mimetype, name, size: buffer.length }
}

/**
 * Volá `beforeOperation` hook kolekce přímo. Tím se testuje i PODMÍNKA, která
 * chrání originály — kdyby ji někdo odstranil, testy samotné funkce by to
 * nezachytily, protože ta se volá až po ní.
 */
type HookArgs = {
  args: { req: { file?: unknown; payload: { logger: { info: (msg: string) => void } } } }
  operation: string
}
const runBeforeOperation = Media.hooks?.beforeOperation?.[0] as unknown as (
  a: HookArgs,
) => Promise<unknown>

describe('zmenšování obrázků nad limit Cloudinary', () => {
  it('velký JPEG zmenší pod limit a zachová typ souboru', async () => {
    const buffer = await noisyJpeg(6000, 4000)
    expect(buffer.length).toBeGreaterThan(CLOUDINARY_MAX_BYTES)

    const file = fileFrom(buffer, 'velka-fotka.jpg', 'image/jpeg')
    await shrinkToFitCloudinary(logger, file)

    expect(file.size).toBeLessThanOrEqual(CLOUDINARY_MAX_BYTES)
    expect(file.size).toBe(file.data.length)
    expect(file.size).toBeLessThan(buffer.length)

    // Pořád JPEG — změna formátu by rozbila příponu v URL.
    const meta = await sharp(file.data).metadata()
    expect(meta.format).toBe('jpeg')
  }, 60_000)

  it('zapeče EXIF orientaci do pixelů (fotka z mobilu se nesmí otočit)', async () => {
    // Orientace 6 = na displeji na výšku, v pixelech na šířku. Sharp při
    // překódování metadata zahazuje, takže bez `.rotate()` by se otočila.
    const buffer = await noisyJpeg(6000, 4000, { orientation: 6 })
    const file = fileFrom(buffer, 'otocena-fotka.jpg', 'image/jpeg')

    await shrinkToFitCloudinary(logger, file)

    const meta = await sharp(file.data).metadata()
    expect(meta.height).toBeGreaterThan(meta.width!)
  }, 60_000)

  it('velké PNG zmenší a nechá ho PNG (nepřevádí na JPEG kvůli průhlednosti)', async () => {
    const raw = Buffer.alloc(4000 * 3000 * 3)
    for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) % 256
    const buffer = await sharp(raw, { raw: { width: 4000, height: 3000, channels: 3 } })
      .png({ compressionLevel: 0 })
      .toBuffer()
    expect(buffer.length).toBeGreaterThan(CLOUDINARY_MAX_BYTES)

    const file = fileFrom(buffer, 'velky-obrazek.png', 'image/png')
    await shrinkToFitCloudinary(logger, file)

    expect(file.size).toBeLessThanOrEqual(CLOUDINARY_MAX_BYTES)
    const meta = await sharp(file.data).metadata()
    expect(meta.format).toBe('png')
  }, 60_000)

  it('u nezmenšitelného typu vyhodí chybu 400 s českou zprávou, ne 500', async () => {
    const buffer = Buffer.alloc(12 * 1024 * 1024, 0x41)
    const file = fileFrom(buffer, 'velky-dokument.pdf', 'application/pdf')

    await expect(shrinkToFitCloudinary(logger, file)).rejects.toMatchObject({
      status: 400,
    })
    await expect(shrinkToFitCloudinary(logger, file)).rejects.toThrow(/příliš velký/)

    // Soubor zůstal nedotčený — nemá smysl posílat na Cloudinary zmrzačené PDF.
    expect(file.size).toBe(buffer.length)
  }, 30_000)
})

describe('hook kolekce Media', () => {
  it('soubor POD limitem nechá bajt v bajt (originály se nepřekódovávají)', async () => {
    const buffer = await noisyJpeg(3000, 2000, { quality: 92 })
    expect(buffer.length).toBeLessThan(CLOUDINARY_MAX_BYTES)

    const file = fileFrom(buffer, 'bezna-fotka.jpg', 'image/jpeg')
    await runBeforeOperation({
      args: { req: { file, payload: { logger } } },
      operation: 'create',
    })

    // Ne `toEqual` na obsah, ale totožnost bufferu: nesmí dojít ani k překódování
    // se shodnou velikostí.
    expect(file.data).toBe(buffer)
    expect(file.size).toBe(buffer.length)
  }, 60_000)

  it('soubor NAD limitem zmenší', async () => {
    const buffer = await noisyJpeg(6000, 4000)
    const file = fileFrom(buffer, 'velka-fotka.jpg', 'image/jpeg')

    await runBeforeOperation({
      args: { req: { file, payload: { logger } } },
      operation: 'create',
    })

    expect(file.size).toBeLessThanOrEqual(CLOUDINARY_MAX_BYTES)
    expect(file.data).not.toBe(buffer)
  }, 60_000)

  it('sanitizuje název souboru (české znaky, mezery)', async () => {
    const buffer = await noisyJpeg(100, 100, { quality: 60 })
    const file = fileFrom(buffer, 'Žluťoučký kůň.JPG', 'image/jpeg')

    await runBeforeOperation({
      args: { req: { file, payload: { logger } } },
      operation: 'create',
    })

    expect(file.name).toBe('zlutoucky-kun.jpg')
  }, 30_000)
})
