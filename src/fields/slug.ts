import type { Field } from 'payload'
import { formatSlug } from '../utilities/formatSlug'

export const slugField = (fieldToUse: string = 'title'): Field => ({
  name: 'slug',
  type: 'text',
  index: true,
  admin: {
    position: 'sidebar',
  },
  hooks: {
    beforeValidate: [formatSlug(fieldToUse)],
  },
})
