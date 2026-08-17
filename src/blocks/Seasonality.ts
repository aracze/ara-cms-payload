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
      // Kalendářní měsíc nese `monthNumber`, ne pořadí řádku — vykreslování si
      // podle něj řádky srovná (monthsByCalendar). Aby ale nešlo uložit blok,
      // ve kterém některý měsíc chybí a jiný je dvakrát, musí sada dát přesně
      // 1–12; jinak by se tiše zobrazil měsíc, který redaktor nezadal.
      validate: (value: unknown) => {
        if (!Array.isArray(value)) return true
        const cisla = value.map((row) => (row as { monthNumber?: unknown })?.monthNumber)
        const platna = cisla.filter(
          (n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 12,
        )
        if (platna.length !== cisla.length) return 'Čísla měsíců musí být celá čísla 1 až 12.'
        if (new Set(platna).size !== platna.length)
          return 'Každý měsíc smí být v seznamu jen jednou.'
        return true
      },
      fields: [
        {
          name: 'monthNumber',
          type: 'number',
          label: 'Číslo měsíce',
          required: true,
          min: 1,
          max: 12,
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
    // Pole „Legenda" tu bývalo jako ruční seznam popisků. Odstraněné 17. 8.
    // 2026: legenda se skládá sama ze zaškrtnutých měsíců a ze škály
    // v `lib/climate.ts` (viz seasonalityLegendHtml), takže je všude stejná
    // jako u klimatického grafu a nemůže se s ním rozejít. Ručně psaná se
    // rozcházela — u Chorvatska pojmenovala jedna položka dva různé stupně,
    // ale nesla barvu jen toho horšího.
  ],
}
