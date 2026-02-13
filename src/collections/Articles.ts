import type { CollectionConfig } from 'payload'
import { imageFields } from '../fields/image'

export const Articles: CollectionConfig = {
  slug: 'articles',
  admin: {
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text', // In a real app, use a hook to generate this from title
      unique: true,
      admin: {
        position: 'sidebar',
      },
    },
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
