import type { MetadataRoute } from 'next'
import { DEFAULT_DESCRIPTION } from '@/lib/seo'

/**
 * Web app manifest — ikona a barvy pro „Přidat na plochu" (Android/Chrome)
 * a Lighthouse. Ikony jsou papoušek z loga (public/icon-*.png, generované
 * z SVG loga v CMS); maskable varianta má větší okraj, aby znak přežil ořez
 * do kruhu.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Ara.cz – Cestovní průvodce',
    short_name: 'Ara.cz',
    description: DEFAULT_DESCRIPTION,
    start_url: '/',
    display: 'minimal-ui',
    lang: 'cs',
    background_color: '#ffffff',
    theme_color: '#215491',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
