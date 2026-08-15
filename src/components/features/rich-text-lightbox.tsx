'use client'

import { useEffect } from 'react'
import type PhotoSwipeLightbox from 'photoswipe/lightbox'
import 'photoswipe/style.css'

/**
 * Lightbox pro fotky v obsahu — napojuje se na odkazy `rel="lightbox"`,
 * které generuje `richTextToHtml` (dřív vedly na surové Cloudinary URL
 * a klik odvedl čtenáře z webu).
 *
 * Poslouchá delegovaně na <body>: pokryje i obsah dorenderovaný později
 * (rozbalovací texty) a přežije klientské přechody mezi stránkami, takže
 * stačí jedna instance v layoutu. Jádro knihovny se stahuje až při prvním
 * kliknutí na fotku (`pswpModule` jako dynamický import); samotný binder
 * je malý a načítá se po hydrataci.
 */
export function RichTextLightbox() {
  useEffect(() => {
    let lightbox: PhotoSwipeLightbox | null = null
    let cancelled = false

    import('photoswipe/lightbox').then(({ default: Lightbox }) => {
      if (cancelled) return

      lightbox = new Lightbox({
        gallery: document.body,
        children: 'a[rel="lightbox"]',
        pswpModule: () => import('photoswipe'),
        wheelToZoom: true,
        closeTitle: 'Zavřít (Esc)',
        zoomTitle: 'Přiblížit',
        arrowPrevTitle: 'Předchozí fotka',
        arrowNextTitle: 'Další fotka',
        errorMsg: 'Fotku se nepodařilo načíst',
      })

      // Titulek v lightboxu přebíráme z popisku pod fotkou v článku
      // (`.image-caption` ve <figcaption>), ať se text neduplikuje v datech.
      lightbox.on('uiRegister', () => {
        lightbox?.pswp?.ui?.registerElement({
          name: 'custom-caption',
          order: 9,
          isButton: false,
          appendTo: 'root',
          onInit: (el, pswp) => {
            pswp.on('change', () => {
              const link = pswp.currSlide?.data?.element
              el.textContent =
                link?.closest('figure')?.querySelector('.image-caption')?.textContent ?? ''
            })
          },
        })
      })

      // Pojistka pro fotky bez rozměrů v datech (bez nich by PhotoSwipe
      // neuměl fotku rozvrhnout): odhad z už načteného náhledu.
      lightbox.addFilter('domItemData', (itemData, element) => {
        if (!itemData.width || !itemData.height) {
          const thumbnail = element.querySelector('img')
          if (thumbnail?.naturalWidth) {
            itemData.width = thumbnail.naturalWidth * 2
            itemData.height = thumbnail.naturalHeight * 2
          }
        }
        return itemData
      })

      lightbox.init()
    })

    return () => {
      cancelled = true
      lightbox?.destroy()
      lightbox = null
    }
  }, [])

  // Bublina s licencí fotky (ⓒ v popisku) se otvírá přes :hover/:focus-within —
  // na iOS Safari ale ťuknutí na tlačítko nedá focus, takže by se nemusela
  // otevřít vůbec. Delegovaný klik přepíná třídu `open` (stejný efekt v CSS)
  // a ťuknutí kamkoli jinam otevřené bubliny zavře.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target
      if (!(target instanceof Element)) return
      // Bublinu hledáme od cíle kliku, ne až od ikonky: klik na text nebo odkaz
      // UVNITŘ bubliny ji tak nezavře (čtenář si potřebuje licenci přečíst).
      const tooltip = target.closest('.image-attribution-tooltip')
      const trigger = target.closest('.image-attribution-trigger')
      document.querySelectorAll('.image-attribution-tooltip.open').forEach((el) => {
        if (el !== tooltip) el.classList.remove('open')
      })
      if (trigger) tooltip?.classList.toggle('open')
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  return null
}
