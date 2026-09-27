import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { hozuTransform } from './packages/transform/src/vite.ts'

const src = (pkg: string) => fileURLToPath(new URL(`./packages/${pkg}/src/`, import.meta.url))

export default defineConfig({
  plugins: [hozuTransform()],
  resolve: {
    alias: [
      { find: /^@hozu\/core\/ir$/, replacement: `${src('core')}ir.ts` },
      { find: /^@hozu\/core\/lower$/, replacement: `${src('core')}lower.ts` },
      { find: /^@hozu\/core$/, replacement: `${src('core')}index.ts` },
      { find: /^@hozu\/schema-zod$/, replacement: `${src('schema-zod')}index.ts` },
      { find: /^@hozu\/compiler$/, replacement: `${src('compiler')}index.ts` },
      { find: /^@hozu\/runtime-client$/, replacement: `${src('runtime-client')}index.ts` },
      { find: /^@hozu\/core\/canonical$/, replacement: `${src('core')}canonical/stringify.ts` },
      { find: /^@hozu\/runtime-server$/, replacement: `${src('runtime-server')}index.ts` },
      { find: /^@hozu\/adapter-node$/, replacement: `${src('adapter-node')}index.ts` },
      { find: /^@hozu\/adapter-static$/, replacement: `${src('adapter-static')}index.ts` },
      { find: /^@hozu\/data$/, replacement: `${src('data')}index.ts` },
      { find: /^@hozu\/machine$/, replacement: `${src('machine')}index.ts` },
      { find: /^@hozu\/validator$/, replacement: `${src('validator')}index.ts` },
      { find: /^create-hozu$/, replacement: `${src('create-hozu')}index.ts` },
    ],
  },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
  },
})
