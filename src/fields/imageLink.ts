import type { Field } from 'payload'
import { linkFields } from './link'

export const imageLinkFields: Field[] = [
  {
    name: 'link',
    type: 'group',
    fields: linkFields,
  },
  {
    name: 'image',
    type: 'upload',
    relationTo: 'media',
    required: true,
  },
  {
    name: 'svgCode',
    type: 'textarea',
  },
]
