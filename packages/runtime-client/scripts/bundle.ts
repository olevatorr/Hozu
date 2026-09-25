import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const dist = (file: string) => fileURLToPath(new URL(`../dist/${file}`, import.meta.url))

rmSync(dist('browser'), { recursive: true, force: true })
await build({
  entryPoints: { client: dist('browser.js'), navigate: dist('navigate.js') },
  outdir: dist('browser'),
  entryNames: '[name]',
  chunkNames: 'chunk-[hash]',
  bundle: true,
  splitting: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
})
