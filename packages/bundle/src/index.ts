import { relative } from 'node:path'
import { type BuildResult, codes, type Diagnostic, join } from '@hozu/core/ir'
import { build } from 'esbuild'

export interface ComponentBundle {
  urls: Record<string, string>
  files: Record<string, string>
  diagnostics: Diagnostic[]
}

const base = '/_hozu/c'

export async function bundleComponents(
  project: BuildResult,
  { minify = true }: { minify?: boolean } = {},
): Promise<ComponentBundle> {
  const entries = Object.entries(project.bindings.clients)
  const out: ComponentBundle = { urls: {}, files: {}, diagnostics: [] }
  if (!entries.length) return out
  const result = await build({
    entryPoints: Object.fromEntries(entries.map(([ref, file]) => [ref.replace('.', '-'), file])),
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify,
    outdir: base,
    entryNames: '[name]-[hash]',
    chunkNames: 'chunk-[hash]',
    define: { 'process.env.NODE_ENV': '"production"' },
    metafile: true,
    write: false,
    logLevel: 'silent',
  })
  for (const file of result.outputFiles) out.files[file.path.slice(file.path.indexOf(base))] = file.text
  for (const [path, meta] of Object.entries(result.metafile.outputs)) {
    if (!meta.entryPoint) continue
    const ref = entries.find(([, file]) => relative(process.cwd(), file) === meta.entryPoint)?.[0]
    if (!ref) continue
    out.urls[ref] = path.slice(path.indexOf(base))
    if (meta.exports.includes('default')) continue
    const [owner, symbol] = ref.split('.') as [string, string]
    const kit = !project.ir.features[owner]
    out.diagnostics.push({
      code: 'HZ029',
      severity: codes.HZ029.severity,
      message: `Client module of component ${ref} has no default export`,
      location: {
        feature: owner,
        pointer: join('', kit ? 'kits' : 'features', owner, 'components', symbol, 'client'),
        source: null,
      },
      cause: 'The runtime mounts the default export of the client module of a client component.',
      fix: {
        summary: 'Export the setup function',
        snippet: `export default implement<typeof ${symbol}>(({ el, props, emit, signal }) => ({ update(next) {}, destroy() {} }))`,
        patch: null,
      },
    })
  }
  return out
}
