import type { Block } from 'payload'

export const NiceToKnowBlock: Block = {
  slug: 'niceToKnowBlock',
  interfaceName: 'NiceToKnowBlock',
  labels: {
    singular: 'Praktické informace (Nice to Know)',
    plural: 'Praktické informace (Nice to Know)',
  },
  fields: [
    {
      name: 'items',
      type: 'array',
      label: 'Informační karty',
      fields: [
        {
          name: 'type',
          type: 'select',
          label: 'Typ karty',
          required: true,
          options: [
            { label: 'Jazyk', value: 'language' },
            { label: 'Elektřina', value: 'electricity' },
            { label: 'Měna', value: 'currency' },
            { label: 'Počasí', value: 'weather' },
            { label: 'Čas', value: 'time' },
            { label: 'Počet obyvatel', value: 'population' },
            { label: 'Doprava (řízení)', value: 'drivingSide' },
          ],
        },
        {
          name: 'headerText',
          type: 'text',
          label: 'Hlavní text v bublině (např. „Dobar dan“)',
          admin: {
            condition: (_, siblingData) => siblingData?.type === 'language',
          },
        },
        {
          name: 'headerSubtext',
          type: 'text',
          label: 'Podtext v bublině (např. (Dobar dan))',
          admin: {
            condition: (_, siblingData) => siblingData?.type === 'language',
          },
        },
        {
          name: 'title',
          type: 'text',
          label: 'Titulek dole (šedý, např. „DOBRÝ DEN“ V:)',
          required: true,
        },
        {
          name: 'value',
          type: 'text',
          label: 'Hodnota dole (černá, např. Chorvatštině)',
          required: true,
        },
        {
          name: 'secondaryValue',
          type: 'text',
          label: 'Sekundární hodnota (např. 230V, Kuna)',
        },
        {
          name: 'timezone',
          type: 'text',
          label: 'Časová zóna (např. Europe/Zagreb)',
          admin: {
            condition: (_, siblingData) => siblingData?.type === 'time',
            description: 'Pokud zůstane prázdné, použije se nastavení z detailu stránky.',
          },
        },
      ],
    },
  ],
}
