import type { CollectionConfig } from 'payload'
import { imageFields } from '../fields/image'
import { slugField } from '../fields/slug'

export const Articles: CollectionConfig = {
  slug: 'articles',
  admin: {
    useAsTitle: 'title',
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    slugField(),
    {
      name: 'category',
      type: 'select',
      options: [
        { label: 'Článek', value: 'Článek' },
        { label: 'Průvodce', value: 'Průvodce' },
        { label: 'Rady na cestu', value: 'RadyNaCestu' },
      ],
    },
    {
      name: 'mainPage',
      type: 'relationship',
      relationTo: 'pages',
      hasMany: false,
    },
    {
      name: 'pages',
      type: 'relationship',
      relationTo: 'pages',
      hasMany: true,
    },
    {
      name: 'text',
      type: 'richText',
    },
    {
      name: 'featuredImage',
      type: 'group',
      fields: imageFields,
    },
  ],
}
