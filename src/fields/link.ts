import type { Field } from 'payload'

export const linkFields: Field[] = [
  {
    name: 'title',
    type: 'text',
  },
  {
    name: 'href',
    type: 'text',
  },
  {
    name: 'isExternal',
    type: 'checkbox',
    defaultValue: false,
  },
  {
    name: 'isButtonLink',
    type: 'checkbox',
    defaultValue: false,
  },
]
