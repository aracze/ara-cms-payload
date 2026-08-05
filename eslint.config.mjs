import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          args: 'after-used',
          ignoreRestSiblings: false,
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^(_|ignore)',
        },
      ],
    },
  },
  {
    // grails/ = lokální kopie legacy webu (git-ignored, na CI neexistuje);
    // playwright-report/ a test-results/ = generované výstupy testů;
    // public/maplibre/ = zkopírovaný dist MapLibre workeru (viz
    // scripts/build-map-style.mjs), cizí minifikovaný kód nelintujeme.
    ignores: ['.next/', 'grails/', 'playwright-report/', 'test-results/', 'public/maplibre/'],
  },
]

export default eslintConfig
