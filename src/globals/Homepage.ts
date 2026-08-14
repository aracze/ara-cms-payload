import type { GlobalConfig } from 'payload'
import { revalidateGlobalsAfterChange } from '../hooks/revalidation'
import { AFFILIATE_FALLBACKS } from '../lib/affiliate-defaults'

/**
 * Redirecty /go/* posílají návštěvníka na uloženou adresu — kontrola tu hlídá,
 * že jde o absolutní https:// URL (relativní cesta nebo překlep by přesměrování
 * rozbily). Prázdné pole je v pořádku, platí výchozí odkaz z kódu.
 */
const validateAbsoluteHttpsUrl = (value: string | null | undefined) => {
  if (!value) return true
  try {
    return new URL(value).protocol === 'https:' || 'Musí být absolutní https:// adresa.'
  } catch {
    return 'Musí být absolutní https:// adresa.'
  }
}

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
    {
      // Obecné partnerské odkazy pro karty „Připrav se na cestu" / „Příprava
      // do …". Čtou je redirecty /go/pojisteni, /go/zajezdy, /go/ubytovani
      // a /go/auta — prázdné pole = výchozí odkaz z kódu (viz
      // src/lib/affiliate.ts), takže smazáním hodnoty se nic nerozbije.
      name: 'affiliate',
      label: 'Připrav se na cestu (partnerské odkazy)',
      type: 'group',
      fields: [
        {
          name: 'insuranceUrl',
          defaultValue: AFFILIATE_FALLBACKS.insuranceUrl,
          validate: validateAbsoluteHttpsUrl,
          label: 'Cestovní pojištění (URL)',
          type: 'text',
          admin: {
            description:
              'Cíl přesměrování /go/pojisteni. Výchozí: CJ odkaz na Klik.cz (https://www.anrdoezrs.net/click-101533587-15024030).',
          },
        },
        {
          name: 'toursUrl',
          defaultValue: AFFILIATE_FALLBACKS.toursUrl,
          validate: validateAbsoluteHttpsUrl,
          label: 'Zájezdy (URL)',
          type: 'text',
          admin: {
            description:
              'Cíl přesměrování /go/zajezdy — obecný odkaz; konkrétní destinace mají vlastní odkaz na své stránce (záložka Affiliate). Výchozí: https://www.invia.cz/?aid=4745582.',
          },
        },
        {
          name: 'accommodationUrl',
          defaultValue: AFFILIATE_FALLBACKS.accommodationUrl,
          validate: validateAbsoluteHttpsUrl,
          label: 'Rezervace ubytování (URL)',
          type: 'text',
          admin: {
            description:
              'Cíl přesměrování /go/ubytovani. Musí to být CJ „click" odkaz na Booking, jinak přestanou fungovat odkazy na konkrétní země. Výchozí: https://www.kqzyfj.com/click-101533587-13386171.',
          },
        },
        {
          name: 'carRentalUrl',
          defaultValue: AFFILIATE_FALLBACKS.carRentalUrl,
          validate: validateAbsoluteHttpsUrl,
          label: 'Půjčení auta (URL)',
          type: 'text',
          admin: {
            description:
              'Cíl přesměrování /go/auta. Musí to být adresa discovercars.com s ?a_aid=, jinak přestanou fungovat odkazy na konkrétní země. Výchozí: https://www.discovercars.com/cz?a_aid=aracz.',
          },
        },
      ],
    },
  ],
}
