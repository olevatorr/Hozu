import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'
import { type BuildResult, codes, type Diagnostic } from '@hozu/core/ir'
import type { AddOutput } from '../contract.ts'
import { HozuCliError } from '../errors.ts'
import type { Loaded } from '../load.ts'
import { addImport, append } from './add.ts'

interface Tokens {
  theme: string[]
  utilities: string[]
  functional: string[]
}

interface Css {
  stylesSource(build: BuildResult): string
  designTokens(source: string, base: string): Promise<Tokens>
}

interface Config {
  twMergeConfigOf(tokens: Tokens): unknown
  tvModule(kit: string, config: unknown): string
  configStatus(source: string, kit: string, config: unknown): 'current' | 'stale' | 'none'
  syncConfig(source: string, kit: string, config: unknown): string | null
  configLine(source: string, kit: string): number | null
}

const load = async <T>(from: string, id: string): Promise<T | null> => {
  try {
    return (await import(pathToFileURL(createRequire(from).resolve(id)).href)) as T
  } catch {
    return null
  }
}

/** The tailwind-merge config of the project's current design system, or null without @hozu/css and @hozu/variants. */
async function generated(build: BuildResult, root: string, from: string, tokens: Tokens | null = null) {
  const [css, config] = await Promise.all([
    load<Css>(from, '@hozu/css'),
    load<Config>(from, '@hozu/variants/config'),
  ])
  if (!css || !config) return null
  return {
    config,
    value: config.twMergeConfigOf(tokens ?? (await css.designTokens(css.stylesSource(build), root))),
  }
}

/** HZ078 for every kit whose `<kit>/tv.ts` has a marked block that differs from the design system. */
export async function kitConfigDiagnostics(
  build: BuildResult,
  root: string,
  from = join(root, 'hozu.config.ts'),
  tokens: Tokens | null = null,
): Promise<Diagnostic[]> {
  const files = Object.keys(build.ir.kits)
    .map((kit) => [kit, join(root, kit, 'tv.ts')] as const)
    .filter(([, file]) => existsSync(file))
  if (!files.length) return []
  const gen = await generated(build, root, from, tokens)
  if (!gen) return []
  const out: Diagnostic[] = []
  for (const [kit, file] of files) {
    const source = await readFile(file, 'utf8')
    if (gen.config.configStatus(source, kit, gen.value) !== 'stale') continue
    out.push({
      code: 'HZ078',
      severity: codes.HZ078.severity,
      message: `${kit}/tv.ts has a tailwind-merge config that differs from the project's design system`,
      location: {
        feature: kit,
        pointer: `/kits/${kit}`,
        source: { file, line: gen.config.configLine(source, kit) ?? 1, column: 1 },
      },
      cause:
        'The config between the hozu:variants-config markers is generated from the @theme namespaces and @utility names; a stale one lets tailwind-merge drop a class it misreads, such as text-hero for a colour (ADR 0045 D).',
      fix: {
        summary: `Regenerate the block: hozu add kit ${kit} --sync`,
        snippet: `hozu add kit ${kit} --sync`,
        patch: null,
      },
    })
  }
  return out
}

interface ThemeDefinition {
  file: string
  line: number
  value: string
}

/** The `--name: value` declarations directly inside each `@theme` block of a stylesheet, with their lines. */
export function themeVariables(text: string, file: string): Map<string, ThemeDefinition> {
  const out = new Map<string, ThemeDefinition>()
  const blank = (m: string) => m.replace(/[^\n]/g, ' ')
  const css = text.replace(/\/\*[\s\S]*?\*\//g, blank)
  const shape = css
    .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, (m) => `"${blank(m.slice(2))}"`)
    .replace(/url\([^)]*\)/gi, (m) => `url(${blank(m.slice(4, -1))})`)
  for (const m of shape.matchAll(/@theme\b[^{;]*\{/g)) {
    let depth = 1
    let from = m.index + m[0].length
    for (let i = from; i < shape.length && depth; i++) {
      const ch = shape[i]
      if (ch === '{') {
        depth++
        from = i + 1
      } else if (ch === '}') {
        depth--
        from = i + 1
      } else if (ch === ';' || (depth === 1 && shape[i + 1] === '}')) {
        if (depth === 1) {
          const end = ch === ';' ? i : i + 1
          const d = /^\s*(--[\w-]+)\s*:\s*([\s\S]+?)\s*$/.exec(css.slice(from, end))
          if (d && !d[1]!.includes('*'))
            out.set(d[1]!, {
              file,
              line: css.slice(0, from + css.slice(from, end).indexOf(d[1]!)).split('\n').length,
              value: d[2]!.replace(/\s+/g, ' '),
            })
        }
        if (ch === ';') from = i + 1
      }
    }
  }
  return out
}

/** HZ094: two stylesheets of the project define one `@theme` variable with different values (ADR 0079 A4). */
export async function themeDiagnostics(build: BuildResult, root: string): Promise<Diagnostic[]> {
  const { entry, kits, features } = build.bindings.styles
  const files = [
    ...new Set(
      [entry, ...Object.values(kits), ...Object.values(features).flat()].filter((f): f is string => !!f),
    ),
  ].filter((f) => existsSync(f))
  const seen = new Map<string, ThemeDefinition[]>()
  for (const file of files)
    for (const [name, d] of themeVariables(await readFile(file, 'utf8'), file))
      seen.set(name, [...(seen.get(name) ?? []), d])
  const out: Diagnostic[] = []
  for (const [name, defs] of seen) {
    if (new Set(defs.map((d) => d.value)).size < 2) continue
    const winner = defs.at(-1)!
    const where = (d: ThemeDefinition) => `${relative(root, d.file)}:${d.line} (${d.value})`
    out.push({
      code: 'HZ094',
      severity: codes.HZ094.severity,
      message: `${name} is defined by ${defs.length} stylesheets with different values; ${relative(root, winner.file)} wins`,
      location: {
        feature: null,
        pointer: '/styles',
        source: { file: winner.file, line: winner.line, column: 1 },
      },
      cause: `${defs.map(where).join(', ')}. The stylesheet imported last wins (the project's, then each kit's, then each feature's), so one of them changes the other's colours without a word (ADR 0079 A4).`,
      fix: {
        summary: `Rename ${name} in one stylesheet, or remove the copy that should not apply; keep an intended override with project({ accept })`,
        snippet: `accept: [{ code: 'HZ094', at: '${name}', reason: '…' }]`,
        patch: null,
      },
    })
  }
  return out
}

const spec = (core: string | undefined) =>
  core === undefined
    ? 'latest'
    : core.startsWith('file:')
      ? core.replace(/hozu-core-/, 'hozu-variants-')
      : core

const KIT = (id: string) => `import { ui } from '@hozu/core'

export const kit = ui.kit({ id: '${id}', components: [] })
`

export async function addKit(loaded: Loaded, cwd: string, id: string | undefined, sync: boolean) {
  if (!id || !/^[a-z][A-Za-z0-9]*$/.test(id))
    throw new HozuCliError('usage', 'Give the kit a lower-case identifier', ['hozu add kit ui'])
  const root = dirname(loaded.path)
  const build = loaded.build(false)
  const gen = await generated(build, root, loaded.path)
  if (!gen)
    throw new HozuCliError('usage', 'hozu add kit needs @hozu/css and @hozu/variants in this app', [
      'npm install @hozu/css @hozu/variants',
    ])
  const out: AddOutput = { created: [], edited: [], manual: [], declarations: { kit: [id] }, texts: [] }
  const tv = join(root, id, 'tv.ts')
  const syncOthers = async () => {
    for (const other of Object.keys(build.ir.kits)) {
      const file = join(root, other, 'tv.ts')
      if (other === id || !existsSync(file)) continue
      const source = await readFile(file, 'utf8')
      const next = gen.config.syncConfig(source, other, gen.value)
      if (next !== null && next !== source) {
        await writeFile(file, next)
        out.edited.push(relative(cwd, file))
      }
    }
  }
  if (sync) {
    const source = existsSync(tv) ? await readFile(tv, 'utf8') : null
    const next = source === null ? null : gen.config.syncConfig(source, id, gen.value)
    if (next === null)
      throw new HozuCliError('usage', `${relative(cwd, tv)} has no hozu:variants-config ${id} block`, [
        `hozu add kit ${id}`,
      ])
    if (next !== source) {
      await writeFile(tv, next)
      out.edited.push(relative(cwd, tv))
    }
    await syncOthers()
    return out
  }
  const kitFile = join(root, id, 'kit.ts')
  for (const f of [kitFile, tv])
    if (existsSync(f))
      throw new HozuCliError('usage', `${relative(cwd, f)} already exists`, [`hozu add kit ${id} --sync`])
  await mkdir(join(root, id), { recursive: true })
  await writeFile(tv, gen.config.tvModule(id, gen.value))
  await writeFile(kitFile, KIT(id))
  out.created.push(relative(cwd, tv), relative(cwd, kitFile))
  await syncOthers()
  const edit = async (path: string, change: (s: string) => string | null, manual: string) => {
    const source = existsSync(path) ? await readFile(path, 'utf8') : null
    const next = source === null ? null : change(source)
    if (next === null) out.manual.push(`${relative(cwd, path)}: ${manual}`)
    else if (next !== source) {
      await writeFile(path, next)
      out.edited.push(relative(cwd, path))
    }
  }
  const name = `${id}Kit`
  await edit(
    loaded.path,
    (s) => {
      let next = addImport(s, `import { kit as ${name} } from './${id}/kit.ts'\n`)
      if (!next) return null
      next = /\bkits:\s*\[/.test(next)
        ? append(next, /kits:\s*\[([^\]]*)\]/, name)
        : next.replace(/^(\s*)features:/m, `$1kits: [${name}],\n$1features:`)
      return next?.includes(`kits: [`) ? next : null
    },
    `import { kit as ${name} } from './${id}/kit.ts' and add kits: [${name}] to project()`,
  )
  await edit(
    join(root, 'package.json'),
    (s) => {
      const json = JSON.parse(s) as { dependencies?: Record<string, string> }
      const deps = json.dependencies ?? {}
      if (deps['@hozu/variants']) return s
      json.dependencies = Object.fromEntries(
        Object.entries({
          ...deps,
          '@hozu/variants': spec(deps['@hozu/core']),
        }).sort(([a], [b]) => a.localeCompare(b)),
      )
      return `${JSON.stringify(json, null, 2)}\n`
    },
    'add @hozu/variants to dependencies',
  )
  return out
}

type Added = { out: AddOutput } | { error: ReturnType<HozuCliError['toJSON']>['error'] }

/** Runs in a worker so the app modules it imports never enter this process's module cache. */
export const runAddKit = (config: string | undefined, cwd: string, id: string | undefined, sync: boolean) =>
  new Promise<AddOutput>((resolve, reject) => {
    const self = fileURLToPath(import.meta.url)
    const worker = new Worker(join(dirname(self), `add-kit${extname(self)}`), {
      workerData: { config, cwd, id, sync },
    })
    worker.once('message', (r: Added) =>
      'out' in r
        ? resolve(r.out)
        : reject(new HozuCliError(r.error.code, r.error.message, r.error.suggestions)),
    )
    worker.once('error', reject)
    worker.once('exit', () => reject(new HozuCliError('config', 'hozu add kit stopped')))
  })

export function describeAddKit(out: AddOutput, id: string, sync: boolean): string {
  return `${[
    ...out.created.map((f) => `created   ${f}`),
    ...out.edited.map((f) => `edited    ${f}`),
    ...out.manual.map((m) => `todo      ${m}`),
    sync
      ? out.edited.length
        ? `next      hozu check`
        : `current   ${id}/tv.ts already matches the design system`
      : `next      add a component module to ${id}/kit.ts (components: [button]), use it with ui.use(Button, {}), then hozu check`,
  ].join('\n')}\n`
}
