import { relative } from 'node:path'
import { type BuildResult, codes, type Diagnostic, join } from '@hozu/core/ir'
import { build } from 'esbuild'

export interface WidgetBundle {
  urls: Record<string, string>
  files: Record<string, string>
  diagnostics: Diagnostic[]
}

const base = '/_hozu/w'

export async function bundleWidgets(
  project: BuildResult,
  { minify = true }: { minify?: boolean } = {},
): Promise<WidgetBundle> {
  const entries = Object.entries(project.bindings.widgets)
  const out: WidgetBundle = { urls: {}, files: {}, diagnostics: [] }
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
    const [feature, symbol] = ref.split('.') as [string, string]
    out.diagnostics.push({
      code: 'HZ029',
      severity: codes.HZ029.severity,
      message: `Widget module for ${ref} has no default export`,
      location: {
        feature,
        pointer: join('', 'features', feature, 'widgets', symbol, 'client'),
        source: null,
      },
      cause: 'The runtime mounts the default export of the widget module.',
      fix: {
        summary: 'Export the setup function',
        snippet: `export default implement<typeof ${symbol}>(({ el, props, emit, signal }) => ({ update(next) {}, destroy() {} }))`,
        patch: null,
      },
    })
  }
  return out
}
