import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const dist = (file: string) => fileURLToPath(new URL(`../dist/${file}`, import.meta.url))

await build({
  entryPoints: [dist('browser.js')],
  outfile: dist('browser.bundle.js'),
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
})
