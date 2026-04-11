import type { CollectionConfig } from 'payload'
import { imageFields } from '../fields/image'
import { slugField } from '../fields/slug'
import { 
  convertLexicalToMarkdown, 
  editorConfigFactory,
} from '@payloadcms/richtext-lexical'

export const Pages: CollectionConfig = {
  slug: 'pages',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'updatedAt'],
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
        if (!id) return true
        return {
          id: {
            not_equals: id,
          },
        }
      },
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'fullSlug',
      type: 'text',
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        components: {
          Field: '/components/FinalUrl#FinalUrl',
        },
      },
      hooks: {
        beforeChange: [
          ({ data, originalDoc }) => {
            // Použijeme breadcrumbs, které spravuje nestedDocsPlugin
            const breadcrumbs = data?.breadcrumbs || originalDoc?.breadcrumbs || []
            if (breadcrumbs.length > 0) {
              return breadcrumbs[breadcrumbs.length - 1].url
            }
            return undefined
          },
        ],
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
      name: 'breadcrumbs',
      type: 'array',
      fields: [
        {
          name: 'doc',
          type: 'relationship',
          relationTo: 'pages',
          hasMany: false,
          admin: {
            disabled: true,
          },
        },
        {
          type: 'row',
          fields: [
            {
              name: 'url',
              label: 'URL',
              type: 'text',
              admin: {
                width: '50%',
              },
            },
            {
              name: 'label',
              type: 'text',
              admin: {
                width: '50%',
              },
            },
          ],
        },
      ],
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'text',
      type: 'richText',
      hooks: {
        afterRead: [
          async ({ value, req }) => {
            // Only convert to markdown if we are in the REST API and NOT the admin panel
            // This prevents the Admin UI editor from crashing
            const isApiRequest = req.url?.includes('/api/') && !req.url?.includes('/admin')

            if (value && typeof value === 'object' && isApiRequest) {
              try {
                const editorConfig = await editorConfigFactory.default({
                  config: req.payload.config,
                })
                const markdown = await convertLexicalToMarkdown({
                  data: value as any,
                  editorConfig,
                })
                return markdown
              } catch (e) {
                console.error('--- CONVERSION FAILED ---', e)
                return value
              }
            }
            return value
          },
        ],
      },
    },
    {
      name: 'children',
      type: 'join',
      collection: 'pages',
      on: 'parent',
      hooks: {
        afterRead: [({ value }) => value || { docs: [] }],
      },
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
      defaultValue: [],
    },
  ],
}
