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
      // Block nodes are extracted from Lexical JSON before markdown conversion
      // (see Pages.ts afterRead hook), so this is just a fallback.
      return ''
    },
    import: () => false,
  },
}
