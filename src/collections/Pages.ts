import type { CollectionConfig } from 'payload'
import { imageFields } from '../fields/image'
import { slugField } from '../fields/slug'
import { convertLexicalToMarkdown, editorConfigFactory } from '@payloadcms/richtext-lexical'

import {
  MetaDescriptionField,
  MetaTitleField,
  OverviewField,
  PreviewField,
} from '@payloadcms/plugin-seo/fields'

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
      type: 'tabs',
      tabs: [
        {
          label: 'Content',
          fields: [
            {
              name: 'text',
              type: 'richText',
              hooks: {
                afterRead: [
                  async ({ value, req }) => {
                    const referer = req.headers?.get('referer')
                    const isApiRequest = req.url?.includes('/api/') && !referer?.includes('/admin')

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

                    if (!isApiRequest && typeof value === 'string') {
                      return null
                    }

                    return value
                  },
                ],
              },
            },
            {
              name: 'featuredImage',
              type: 'group',
              fields: imageFields,
            },
          ],
        },
        {
          name: 'detail',
          label: 'Detail',
          admin: {
            condition: (data) =>
              ['Místo k navštívení', 'Turistický cíl', 'Místa'].includes(data?.category),
          },
          fields: [
            {
              type: 'row',
              fields: [
                {
                  name: 'googleMapsAddress',
                  label: 'Adresa v Google Maps',
                  type: 'text',
                  admin: { width: '50%' },
                },
                {
                  name: 'latitude',
                  label: 'Latitude',
                  type: 'text',
                  admin: { width: '25%' },
                },
                {
                  name: 'longitude',
                  label: 'Longitude',
                  type: 'text',
                  admin: { width: '25%' },
                },
              ],
            },
            {
              name: 'googleMapsZoom',
              label: 'Google Maps Zoom Level',
              type: 'number',
              defaultValue: 10,
              admin: { width: '50%' },
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'locative',
                  label: 'Šestý pád (v kom, v čem)',
                  type: 'text',
                  admin: { width: '50%' },
                },
                {
                  name: 'genitive',
                  label: 'Druhý pád (do koho, do čeho)',
                  type: 'text',
                  admin: { width: '50%' },
                },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'timezone',
                  label: 'Název čas. pásma (např. Europe/London)',
                  type: 'text',
                  admin: { width: '50%' },
                },
                {
                  name: 'currencyCode',
                  label: 'Kód měny (např. GBP)',
                  type: 'text',
                  admin: { width: '50%' },
                },
              ],
            },
            {
              name: 'showWeather',
              label: 'Zobrazit přehled počasí',
              type: 'checkbox',
              defaultValue: false,
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
        {
          name: 'affiliate',
          label: 'Affiliate',
          fields: [
            {
              name: 'toursUrl',
              label: 'Zájezdy (URL)',
              type: 'text',
            },
            {
              name: 'accommodationUrl',
              label: 'Rezervace ubytování (URL)',
              type: 'text',
            },
            {
              name: 'carRentalUrl',
              label: 'Půjčení auta (URL)',
              type: 'text',
            },
            {
              name: 'kiwiIataCode',
              label: 'Kiwi Fly To (IATA kód letiště)',
              type: 'text',
            },
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
      name: 'subPages',
      label: 'Sub Pages',
      type: 'join',
      collection: 'pages',
      on: 'parent',
      admin: {
        position: 'sidebar',
        allowCreate: false,
      },
    },
    {
      name: 'primaryArticles',
      label: 'Main Article (Canonical)',
      type: 'join',
      collection: 'articles',
      on: 'mainPage',
      admin: {
        position: 'sidebar',
        allowCreate: false,
      },
    },
    {
      name: 'secondaryArticles',
      label: 'Other Articles',
      type: 'join',
      collection: 'articles',
      on: 'pages',
      admin: {
        position: 'sidebar',
        allowCreate: false,
      },
    },
  ],
}
