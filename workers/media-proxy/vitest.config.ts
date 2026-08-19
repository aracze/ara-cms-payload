import { defineConfig } from 'vitest/config'

// Bez vlastního configu by si vitest našel kořenový vitest.config.mts
// (include tests/int/**) a testy Workeru by nikdy nespustil.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
