import type { CollectionConfig } from 'payload'
import { imageFields } from '../fields/image'

export const Pages: CollectionConfig = {
  slug: 'pages',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'updatedAt'],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text', // In Payload, use a hook to generate if needed
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'fullSlug',
      type: 'text',
      unique: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'category',
      type: 'select',
      options: [
        { label: 'Místo k navštívení', value: 'Místo k navštívení' },
        { label: 'Turistický cíl', value: 'Turistický cíl' },
        { label: 'Místa', value: 'Místa' },
        { label: 'Praktické informace', value: 'Praktické informace' },
        { label: 'Vstupní podmínky', value: 'Vstupní podmínky' },
        { label: 'Cesta', value: 'Cesta' },
        { label: 'Počasí', value: 'Počasí' },
        { label: 'Doprava', value: 'Doprava' },
        { label: 'Měna a ceny', value: 'Měna a ceny' },
        { label: 'Zdraví a bezpečí', value: 'Zdraví a bezpečí' },
        { label: 'Jazyk a kultura', value: 'Jazyk a kultura' },
        { label: 'Jídlo a pití', value: 'Jídlo a pití' },
        { label: 'Ubytování', value: 'Ubytování' },
        { label: 'Články', value: 'Články' },
      ],
      required: true,
      defaultValue: 'Místo k navštívení',
    },
    {
      name: 'parent',
      type: 'relationship',
      relationTo: 'pages',
      hasMany: false,
      filterOptions: ({ id }) => {
        return {
          id: {
            not_equals: id,
          },
        }
      },
    },
    {
      name: 'includeInChildUrlPaths',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'text',
      type: 'richText',
    },
    {
      name: 'children', // Virtual field or actual relationship? In Strapi it's OneToMany mappedBy parent.
      // Payload handles this via the 'parent' field on the child.
      // We can use a join field or just omit it and query by parent.
      // For now, I'll omit it as it's redundant data storage, but if needed for UI, we can use a custom component.
      // However, if the user expects to see children in the API response, we might need a virtual field (afterRead hook).
      // For migration simplicity, I will stick to the 'parent' field establishing the hierarchy.
      type: 'ui',
      admin: {
        components: {
          Field: undefined, // Placeholder if we wanted a custom component
        },
      },
      label: 'Children (Managed via Parent field on child pages)',
    },
    {
      name: 'featuredImage',
      type: 'group',
      fields: imageFields,
    },
    {
      name: 'articles',
      type: 'relationship',
      relationTo: 'articles',
      hasMany: true,
    },
  ],
}
