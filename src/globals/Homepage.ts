import type { GlobalConfig } from 'payload'
import { revalidateGlobalsAfterChange } from '../hooks/revalidation'

export const Homepage: GlobalConfig = {
  slug: 'homepage',
  access: {
    read: () => true,
  },
  hooks: {
    afterChange: [revalidateGlobalsAfterChange],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      // Nepovinné ZÁMĚRNĚ: prázdné pole = věta pod herem se na webu skryje
      // (homepage.tsx ji vykresluje jen když je vyplněná).
      required: false,
      label: 'Věta pod úvodní fotkou',
      admin: {
        description:
          'Krátký text pod vyhledáváním na homepage (např. „Objevuj stovky turistických cílů a míst po celém světě."). Nech prázdné, když se nemá zobrazovat nic.',
      },
    },
  ],
}
