import type { Block } from 'payload'

/**
 * Čtyři stupně, shodné se škálou klimatického grafu (SUITABILITY_LABEL
 * v `lib/climate.ts`) — pruh u zemí a graf u měst pak mluví stejnou řečí.
 * Popisky nesou obojí názvosloví: sezónní pro redaktora, škálové kvůli
 * grafu, na který pruh odkazuje. Hodnoty se nepřejmenovávají, jinak by
 * dosavadní bloky v obsahu spadly na výchozí „mimo sezónu".
 */
const SEASON_STATUS_OPTIONS = [
  { label: 'Mimo sezónu (nevhodné)', value: 'off' },
  { label: 'Přechodné období (průměrné)', value: 'shoulder' },
  { label: 'Vedlejší sezóna (dobré)', value: 'mid' },
  { label: 'Hlavní sezóna (ideální)', value: 'peak' },
]

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
          options: SEASON_STATUS_OPTIONS,
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
          options: SEASON_STATUS_OPTIONS,
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
