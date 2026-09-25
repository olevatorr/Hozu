import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

const files = Object.fromEntries(
  readdirSync(dist('browser')).map((name) => [name, readFileSync(dist(`browser/${name}`), 'utf8')]),
)
writeFileSync(dist('files.js'), `export const files = ${JSON.stringify(files)}\n`)
