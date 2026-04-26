import type { Block } from 'payload'

export const MapBlock: Block = {
  slug: 'mapBlock',
  interfaceName: 'MapBlock',
  labels: {
    singular: 'Mapa (Iframe)',
    plural: 'Mapy (Iframe)',
  },
  fields: [
    {
      name: 'iframeUrl',
      type: 'text',
      label: 'Zdrojová URL mapy (src z iframe)',
      required: true,
    },
    {
      name: 'caption',
      type: 'text',
      label: 'Popisek pod mapou (nepovinný)',
    },
  ],
}
