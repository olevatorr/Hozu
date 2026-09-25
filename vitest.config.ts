import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const src = (pkg: string) => fileURLToPath(new URL(`./packages/${pkg}/src/`, import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@tenon\/core\/ir$/, replacement: `${src('core')}ir.ts` },
      { find: /^@tenon\/core$/, replacement: `${src('core')}index.ts` },
      { find: /^@tenon\/schema-zod$/, replacement: `${src('schema-zod')}index.ts` },
      { find: /^@tenon\/validator$/, replacement: `${src('validator')}index.ts` },
    ],
  },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
  },
})
