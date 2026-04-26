import type { Block } from 'payload'

export const SeasonalityBlock: Block = {
  slug: 'seasonalityBlock',
  interfaceName: 'SeasonalityBlock',
  labels: {
    singular: 'Sezónnost (Kdy jet)',
    plural: 'Sezónnosti (Kdy jet)',
  },
  fields: [
    {
      name: 'prefixText',
      type: 'text',
      label: 'Úvodní text (např. Ideální doba do Chorvatska je:)',
    },
    {
      name: 'idealMonthsText',
      type: 'text',
      label: 'Měsíce (např. Květen - Září)',
    },
    {
      name: 'months',
      type: 'array',
      label: 'Měsíce (1-12)',
      minRows: 12,
      maxRows: 12,
      fields: [
        {
          name: 'monthNumber',
          type: 'number',
          label: 'Číslo měsíce',
          required: true,
        },
        {
          name: 'status',
          type: 'select',
          label: 'Status sezóny',
          required: true,
          options: [
            { label: 'Mimo sezónu', value: 'off' },
            { label: 'Vedlejší sezóna', value: 'mid' },
            { label: 'Hlavní sezóna', value: 'peak' },
          ],
        },
      ],
    },
    {
      name: 'legend',
      type: 'array',
      label: 'Legenda',
      fields: [
        {
          name: 'status',
          type: 'select',
          label: 'Status sezóny',
          required: true,
          options: [
            { label: 'Mimo sezónu', value: 'off' },
            { label: 'Vedlejší sezóna', value: 'mid' },
            { label: 'Hlavní sezóna', value: 'peak' },
          ],
        },
        {
          name: 'label',
          type: 'text',
          label: 'Text legendy',
          required: true,
        },
      ],
    },
  ],
}
