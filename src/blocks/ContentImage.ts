import type { Block } from 'payload'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export const ContentImage: Block = {
  slug: 'contentImage',
  labels: {
    singular: 'Obrázek v obsahu',
    plural: 'Obrázky v obsahu',
  },
  fields: [
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      required: true,
    },
    {
      name: 'caption',
      type: 'text',
      label: 'Popisek pod obrázkem (nepovinný)',
    },
  ],
  jsx: {
    export: ({ fields }) => {
      const image = fields.image as Record<string, unknown> | undefined
      const caption = String(fields.caption ?? '')
      const src = String(image?.url ?? '')
      const alt = escapeHtml(String(image?.alt ?? ''))
      if (!src) return ''
      let html = `<img src="${escapeHtml(src)}" alt="${alt}" />`
      if (caption) {
        html = `<figure>${html}<figcaption>${escapeHtml(caption)}</figcaption></figure>`
      }
      return html
    },
    import: () => false,
  },
}
