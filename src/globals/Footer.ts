import type { GlobalConfig } from 'payload'
import { imageLinkFields } from '../fields/imageLink'
import { linkFields } from '../fields/link'

export const Footer: GlobalConfig = {
  slug: 'footer',
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'logo',
      type: 'group',
      fields: imageLinkFields,
    },
    {
      name: 'navItems',
      type: 'array',
      fields: linkFields,
    },
    {
      name: 'copyright',
      type: 'text',
    },
  ],
}
