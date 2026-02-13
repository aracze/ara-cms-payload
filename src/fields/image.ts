import type { Field } from 'payload'

export const imageFields: Field[] = [
  {
    name: 'image',
    type: 'upload',
    relationTo: 'media',
    required: true,
  },
  {
    name: 'description',
    type: 'text',
  },
  {
    name: 'author',
    type: 'text',
  },
  {
    name: 'source',
    type: 'text',
  },
  {
    name: 'sourceLink',
    type: 'text',
  },
  {
    name: 'creativeCommonsLicense',
    type: 'text',
  },
  {
    name: 'featureImageStyleCss',
    type: 'text',
  },
  {
    name: 'cloudinarySetting',
    type: 'text',
  },
  {
    name: 'svgCode',
    type: 'textarea',
  },
]
