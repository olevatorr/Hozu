import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const src = (pkg: string) => fileURLToPath(new URL(`./packages/${pkg}/src/`, import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@tenonkit\/core\/ir$/, replacement: `${src('core')}ir.ts` },
      { find: /^@tenonkit\/core$/, replacement: `${src('core')}index.ts` },
      { find: /^@tenonkit\/schema-zod$/, replacement: `${src('schema-zod')}index.ts` },
      { find: /^@tenonkit\/compiler$/, replacement: `${src('compiler')}index.ts` },
      { find: /^@tenonkit\/runtime-client$/, replacement: `${src('runtime-client')}index.ts` },
      { find: /^@tenonkit\/core\/canonical$/, replacement: `${src('core')}canonical/stringify.ts` },
      { find: /^@tenonkit\/runtime-server$/, replacement: `${src('runtime-server')}index.ts` },
      { find: /^@tenonkit\/adapter-node$/, replacement: `${src('adapter-node')}index.ts` },
      { find: /^@tenonkit\/adapter-static$/, replacement: `${src('adapter-static')}index.ts` },
      { find: /^@tenonkit\/data$/, replacement: `${src('data')}index.ts` },
      { find: /^@tenonkit\/machine$/, replacement: `${src('machine')}index.ts` },
      { find: /^@tenonkit\/validator$/, replacement: `${src('validator')}index.ts` },
      { find: /^create-tenon$/, replacement: `${src('create-tenon')}index.ts` },
    ],
  },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
  },
})
