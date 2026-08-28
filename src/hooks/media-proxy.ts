import type { CollectionAfterReadHook, CollectionBeforeChangeHook } from 'payload'
import { fromMediaProxy, toMediaProxy } from '@/lib/cloudinary-loader'

/**
 * Adresy fotek (`url`, `thumbnailURL`) se na media proxy (media.ara.cz)
 * přepisují UŽ PŘI ČTENÍ z CMS — ne až při vykreslení obrázku.
 *
 * Důvod: Next.js přibaluje props serverových komponent do RSC payloadu každé
 * stránky. S přepisem až v loaderu tam zůstávaly surové res.cloudinary.com
 * adresy ORIGINÁLŮ (na titulce ~49 kusů) — prohlížeč je nestahuje, ale
 * scrapeři/AI boti si je z HTML vytáhnou a stahují plné originály přímo
 * z Cloudinary, mimo proxy i Cloudflare keš (srpen 2026: deaktivace účtu za
 * překročení kreditů). Přepis u zdroje pokryje props, virtuální pole
 * (createdByPublic/authorPublic), search index, og:image i admin náhledy
 * najednou — a `toMediaProxy` v loaderech zůstává jako idempotentní no-op.
 *
 * V dev (bez NEXT_PUBLIC_MEDIA_BASE_URL) i pro dev cloud je toMediaProxy
 * no-op, takže se nic nemění. Kód, který z adresy něco odvozuje, normalizuje
 * vstup přes `fromMediaProxy` (rich-text-html, maplibre-map, R2 záloha).
 */
export const rewriteUploadUrlsToMediaProxy: CollectionAfterReadHook = ({ doc }) => {
  if (!doc) return doc
  if (typeof doc.url === 'string') doc.url = toMediaProxy(doc.url)
  if (typeof doc.thumbnailURL === 'string') doc.thumbnailURL = toMediaProxy(doc.thumbnailURL)
  return doc
}

/**
 * Pojistka kanonické podoby v DB: cloudinary plugin při update bez nového
 * souboru kopíruje `url` z originalDoc — kdyby tam přitekla proxy adresa,
 * uložila by se. V databázi mají zůstat adresy res.cloudinary.com (dev
 * s prod dumpem nemá proxy env a spoléhá na ně).
 */
export const normalizeUploadUrlsToCloudinary: CollectionBeforeChangeHook = ({ data }) => {
  if (typeof data.url === 'string') data.url = fromMediaProxy(data.url)
  if (typeof data.thumbnailURL === 'string') data.thumbnailURL = fromMediaProxy(data.thumbnailURL)
  return data
}
