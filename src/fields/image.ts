import type { Field } from 'payload'

export const imageFields: Field[] = [
  {
    name: 'image',
    type: 'upload',
    relationTo: 'media',
  },
  {
    type: 'row',
    fields: [
      {
        name: 'featureImageStyleCss',
        type: 'text',
        admin: {
          width: '50%',
        },
      },
      {
        name: 'cloudinarySetting',
        type: 'text',
        admin: {
          width: '50%',
        },
      },
    ],
  },
  {
    name: 'isCreativeCommons',
    label: 'Obrázek je Creative Commons',
    type: 'checkbox',
    defaultValue: false,
  },
  {
    type: 'row',
    admin: {
      condition: (data, siblingData) => siblingData?.isCreativeCommons,
    },
    fields: [
      {
        name: 'author',
        type: 'text',
        admin: {
          width: '50%',
        },
      },
      {
        name: 'description',
        type: 'text',
        admin: {
          width: '50%',
        },
      },
    ],
  },
  {
    type: 'row',
    admin: {
      condition: (data, siblingData) => siblingData?.isCreativeCommons,
    },
    fields: [
      {
        name: 'source',
        type: 'text',
        admin: {
          width: '33%',
        },
      },
      {
        name: 'sourceLink',
        type: 'text',
        admin: {
          width: '33%',
        },
      },
      {
        name: 'creativeCommonsLicense',
        type: 'text',
        admin: {
          width: '33%',
        },
      },
    ],
  },
  {
    name: 'svgCode',
    type: 'textarea',
    admin: {
      condition: (data, siblingData) => siblingData?.isCreativeCommons,
      description: 'Zde vložte kód SVG (volitelné)',
    },
  },
]
