import { type BuildResult, codes, type Diagnostic, join } from '@hozu/core/ir'

export interface ComponentBundle {
  urls: Record<string, string>
  files: Record<string, string>
  diagnostics: Diagnostic[]
  /** Each feature's fetch module for the browser (ADR 0049), by feature id. */
  fetches: Record<string, string>
  /** Every file esbuild read, absolute: `hozu dev` reloads when one changes (ADR 0062). */
  inputs: string[]
}

const base = '/_hozu/c'

/** Node and esbuild load only when a bundle is built, so an edge bundle that imports this module stays web-only. */
const load = (name: string) => import(/* @vite-ignore */ name)
const tools = async (): Promise<typeof import('node:path') & { build: typeof import('esbuild').build }> => ({
  ...(await load('node:path')),
  build: (await load('esbuild')).build,
})

const inputsOf = (metafile: { inputs: Record<string, unknown> }, resolve: (...paths: string[]) => string) =>
  Object.keys(metafile.inputs)
    .filter((path) => !path.includes('node_modules/') && !path.includes(':'))
    .map((path) => resolve(process.cwd(), path))

export async function bundleComponents(
  project: BuildResult,
  { minify = true }: { minify?: boolean } = {},
): Promise<ComponentBundle> {
  const entries = Object.entries(project.bindings.clients)
  const out: ComponentBundle = { urls: {}, files: {}, diagnostics: [], fetches: {}, inputs: [] }
  await bundleFetches(project, out, minify)
  if (!entries.length) return out
  out.inputs.push(...entries.map(([, file]) => file))
  const { build, relative, resolve } = await tools()
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
  out.inputs.push(...inputsOf(result.metafile, resolve))
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

/** Each feature's fetch.ts, for the browser: one entry per feature, so a Node-only import names its feature (HZ081). */
async function bundleFetches(project: BuildResult, out: ComponentBundle, minify: boolean): Promise<void> {
  const fetches = Object.entries(project.bindings.fetches ?? {})
  if (!fetches.length) return
  const { build, resolve } = await tools()
  for (const [feature, file] of fetches.sort(([a], [b]) => a.localeCompare(b))) {
    out.inputs.push(file)
    try {
      const result = await build({
        entryPoints: { [`fetch-${feature}`]: file },
        bundle: true,
        format: 'esm',
        platform: 'browser',
        target: 'es2022',
        minify,
        outdir: base,
        entryNames: '[name]-[hash]',
        define: { 'process.env.NODE_ENV': '"production"' },
        metafile: true,
        write: false,
        logLevel: 'silent',
      })
      for (const f of result.outputFiles) out.files[f.path.slice(f.path.indexOf(base))] = f.text
      out.inputs.push(...inputsOf(result.metafile, resolve))
      const entry = Object.entries(result.metafile.outputs).find(([, meta]) => meta.entryPoint)
      if (entry) out.fetches[feature] = entry[0].slice(entry[0].indexOf(base))
    } catch (error) {
      const message =
        (error as { errors?: { text: string }[] }).errors?.map((e) => e.text).join('; ') ?? String(error)
      out.diagnostics.push({
        code: 'HZ081',
        severity: codes.HZ081.severity,
        message: `fetch.ts of ${feature} does not bundle for the browser: ${message}`,
        location: { feature, pointer: join('', 'features', feature, 'fetch'), source: null },
        cause:
          "fetch.ts runs in the browser (and on the server for runs: 'either'), so it cannot import Node-only modules.",
        fix: {
          summary:
            "Move what needs Node (a database, node:fs, a secret) into a server resolver and mark that effect runs: 'server'",
          snippet: "runs: 'server'",
          patch: null,
        },
      })
    }
  }
}

/** What `bundleServer` reports: the files it read, and the Node built-ins an import asked for (ADR 0075 A1). */
export interface ServerBundle {
  inputs: string[]
  /** One line per app file that pulls Node in: `server/db.ts → mysql2 → net, tls`. Empty when the bundle is web-only. */
  node: string[]
}

const packageOf = (file: string) => {
  const at = file.lastIndexOf('/node_modules/')
  if (at < 0) return null
  const rest = file.slice(at + '/node_modules/'.length).split('/')
  return rest[0]!.startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0]!
}

/** Records which app file, through which packages, asks for each Node built-in; built-ins stay out of the bundle. */
async function nodeTrace(root: string) {
  const { builtinModules } = await load('node:module')
  const { relative } = await load('node:path')
  const builtin = new RegExp(
    `^(node:)?(${(builtinModules as string[]).map((m) => m.replace(/[/]/g, '\\/')).join('|')})(/|$)`,
  )
  const usedBy = new Map<string, Set<string>>()
  const wants = new Map<string, Set<string>>()
  const apps = new Set<string>()
  const add = (map: Map<string, Set<string>>, key: string, value: string) =>
    map.set(key, (map.get(key) ?? new Set()).add(value))
  const plugin = {
    name: 'hozu-node-trace',
    setup(build: {
      onResolve(o: { filter: RegExp }, f: (a: { path: string; importer: string }) => unknown): void
    }) {
      build.onResolve({ filter: /^[^./]/ }, ({ path, importer }) => {
        const pkg = packageOf(importer)
        const from = pkg ?? relative(root, importer)
        if (!pkg) apps.add(from)
        if (builtin.test(path)) {
          add(wants, from, path.replace(/^node:/, ''))
          return { path, external: true }
        }
        const name = path.startsWith('@') ? path.split('/').slice(0, 2).join('/') : path.split('/')[0]!
        if (name !== from) add(usedBy, name, from)
        return undefined
      })
    },
  }
  const chains = () => {
    const out = new Set<string>()
    for (const [from, mods] of wants) {
      const walk = (at: string, trail: string[]) => {
        if (trail.includes(at) || out.size > 20) return
        const parents = usedBy.get(at)
        if (apps.has(at) || !parents?.size) {
          out.add(`${[at, ...trail].join(' → ')} → ${[...mods].sort().join(', ')}`)
          return
        }
        for (const p of parents) walk(p, [at, ...trail])
      }
      walk(from, [])
    }
    return [...out].sort()
  }
  return { plugin, chains }
}

/**
 * Bundles a server entry for a platform without a file system (Workers, Vercel Edge; ADR 0073 A1): every import is
 * inlined, app files get their builder callbacks lowered and their own `import.meta.url` (`@hozu/transform`). A Node
 * built-in is not bundled: `node` says which app file asked for it (ADR 0075 A1), and nothing is written then.
 */
export async function bundleServer(options: {
  source: string
  resolveDir: string
  outfile: string
  conditions: string[]
  write?: boolean
}): Promise<ServerBundle> {
  const { build, resolve } = await tools()
  const { hozuTransform } = await load('@hozu/transform/esbuild')
  const trace = await nodeTrace(options.resolveDir)
  const result = await build({
    stdin: { contents: options.source, resolveDir: options.resolveDir, sourcefile: 'entry.ts', loader: 'ts' },
    outfile: options.outfile,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    mainFields: ['module', 'main'],
    conditions: options.conditions,
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [trace.plugin, hozuTransform()],
    metafile: true,
    write: false,
    logLevel: 'silent',
  })
  const node = trace.chains()
  if (!node.length && options.write !== false) {
    const { mkdir, writeFile } = await load('node:fs/promises')
    const { dirname } = await load('node:path')
    for (const f of result.outputFiles) {
      await mkdir(dirname(f.path), { recursive: true })
      await writeFile(f.path, f.contents)
    }
  }
  return { inputs: inputsOf(result.metafile, resolve), node }
}
