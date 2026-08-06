import type { GlobalConfig } from 'payload'
import { revalidateGlobalsAfterChange } from '../hooks/revalidation'
import { lexicalEditor, LinkFeature } from '@payloadcms/richtext-lexical'
import { imageLinkFields } from '../fields/imageLink'

export const Footer: GlobalConfig = {
  slug: 'footer',
  access: {
    read: () => true,
  },
  hooks: {
    afterChange: [revalidateGlobalsAfterChange],
  },
  fields: [
    {
      name: 'logo',
      type: 'group',
      fields: imageLinkFields,
    },
    {
      name: 'lede',
      label: 'Úvodní věta',
      type: 'textarea',
      admin: {
        description: 'Krátká výzva vedle loga — např. „Rádi uslyšíme tvůj názor na naše stránky."',
      },
    },
    {
      name: 'contact',
      label: 'Kontakt',
      type: 'group',
      fields: [
        {
          name: 'email',
          label: 'E-mail',
          type: 'email',
        },
        {
          name: 'personName',
          label: 'Kontaktní osoba',
          type: 'text',
          admin: { description: 'Jméno pod e-mailem. Prázdné = řádek se nezobrazí.' },
        },
        {
          name: 'personHref',
          label: 'Odkaz na profil kontaktní osoby',
          type: 'text',
          admin: {
            description: 'Např. /profil/jankonas. Prázdné = jméno se vypíše bez odkazu.',
            condition: (_, siblingData) => Boolean(siblingData?.personName),
          },
        },
      ],
    },
    {
      name: 'navItems',
      label: 'Navigační položky',
      type: 'array',
      fields: [
        {
          name: 'label',
          label: 'Popisek',
          type: 'text',
          required: true,
        },
        {
          name: 'href',
          label: 'URL',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      name: 'copyrightText',
      label: 'Copyright text (celý odstavec včetně odkazů)',
      type: 'richText',
      editor: lexicalEditor({
        features: ({ defaultFeatures }) => [
          ...defaultFeatures.filter((f: any) => f?.key !== 'link'),
          LinkFeature({ enabledCollections: ['pages'] }),
        ],
      }),
    },
  ],
}
