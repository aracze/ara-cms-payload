import type { CollectionConfig } from 'payload'
import { imageFields } from '../fields/image'
import { slugField } from '../fields/slug'

import {
  MetaDescriptionField,
  MetaTitleField,
  OverviewField,
  PreviewField,
} from '@payloadcms/plugin-seo/fields'

export const Articles: CollectionConfig = {
  slug: 'articles',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'category', 'updatedAt'],
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
    {
      name: 'category',
      type: 'select',
      options: [
        { label: 'Článek', value: 'Článek' },
        { label: 'Průvodce', value: 'Průvodce' },
        { label: 'Rady na cestu', value: 'RadyNaCestu' },
      ],
      defaultValue: 'Článek',
      required: true,
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Content',
          fields: [
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
        },
        {
          name: 'meta',
          label: 'SEO',
          fields: [
            OverviewField({
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
              imagePath: 'featuredImage.image',
            }),
            MetaTitleField({
              hasGenerateFn: true,
            }),
            MetaDescriptionField({}),
            PreviewField({
              hasGenerateFn: true,
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
            }),
          ],
        },
      ],
    },
    slugField(),
    {
      name: 'createdBy',
      label: 'Autor',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        position: 'sidebar',
      },
      hooks: {
        beforeChange: [
          ({ req, operation, value }) => {
            if (operation === 'create' && req.user) {
              return req.user.id
            }
            return value
          },
        ],
      },
    },
    {
      name: 'mainPage',
      label: 'Main Page (Canonical)',
      type: 'relationship',
      relationTo: 'pages',
      hasMany: false,
      admin: {
        position: 'sidebar',
        description: 'Určuje výslednou domovskou URL adresu článku a kanonický odkaz pro Google.',
      },
    },
    {
      name: 'pages',
      label: 'Other Pages',
      type: 'relationship',
      relationTo: 'pages',
      hasMany: true,
      admin: {
        position: 'sidebar',
        description:
          'Vyberte další destinace, ve kterých se má tento článek zobrazit v doporučeném výpisu.',
      },
    },
  ],
}
