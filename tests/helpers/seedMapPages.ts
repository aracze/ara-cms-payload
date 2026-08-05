import { getPayload } from 'payload'
import config from '../../src/payload.config'

/**
 * Testovací data pro e2e test mapy: rodičovská stránka se dvěma místy
 * se souřadnicemi — přesně to, co potřebuje sekce „Co vidět…" k vykreslení
 * mapy s piny. CI databáze je prázdná, test si obsah seje a uklízí sám.
 */
export const mapParent = {
  title: 'Testovací země E2E',
  slug: 'testovaci-zeme-e2e',
}

export const mapPlaces = [
  { title: 'Testovací místo Alfa', slug: 'testovaci-misto-alfa', lat: '45.1', lng: '15.1' },
  { title: 'Testovací místo Beta', slug: 'testovaci-misto-beta', lat: '44.9', lng: '16.4' },
]

export async function seedMapPages(): Promise<void> {
  const payload = await getPayload({ config })
  await cleanupMapPages()

  const parent = await payload.create({
    collection: 'pages',
    draft: false,
    data: {
      title: mapParent.title,
      slug: mapParent.slug,
      category: 'Místa',
      _status: 'published',
      detail: { latitude: '45.0', longitude: '15.5', googleMapsZoom: 7 },
    },
  })

  for (const place of mapPlaces) {
    await payload.create({
      collection: 'pages',
      draft: false,
      data: {
        title: place.title,
        slug: place.slug,
        category: 'Místo k navštívení',
        parent: parent.id,
        _status: 'published',
        detail: { latitude: place.lat, longitude: place.lng },
      },
    })
  }
}

export async function cleanupMapPages(): Promise<void> {
  const payload = await getPayload({ config })
  // Děti první (cizí klíč parent), pak rodič.
  await payload.delete({
    collection: 'pages',
    where: { slug: { in: mapPlaces.map((p) => p.slug) } },
  })
  await payload.delete({
    collection: 'pages',
    where: { slug: { equals: mapParent.slug } },
  })
}
