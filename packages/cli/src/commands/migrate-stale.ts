import { existsSync, readFileSync } from 'node:fs'
import { createRequire, register } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

export interface StaleEntry {
  feature: string
  id: string
  kind: 'missing' | 'removed' | 'behavior' | 'contracts'
  was: string | null
  now: string | null
}

export interface Stale07 {
  core: string | null
  irVersion: number | null
  skipped: string | null
  stale: StaleEntry[]
  routes: Record<string, Record<string, unknown>>
  errors: string[]
  ir: unknown
}

type Entry = { behavior: string; summary?: string; contracts: Record<string, string> }
type Lock = { features: Record<string, Record<string, Entry>> } | null

export function staleEntries(committed: Lock, computed: NonNullable<Lock>): StaleEntry[] {
  const out: StaleEntry[] = []
  const features = new Set([...Object.keys(committed?.features ?? {}), ...Object.keys(computed.features)])
  for (const feature of [...features].sort()) {
    const before = committed?.features[feature] ?? {}
    const after = computed.features[feature] ?? {}
    for (const id of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
      const b = before[id]
      const a = after[id]
      const entry = (kind: StaleEntry['kind']) =>
        out.push({ feature, id, kind, was: b?.summary ?? null, now: a?.summary ?? null })
      if (!b && a) entry('missing')
      else if (b && !a) entry('removed')
      else if (b && a) {
        if (b.behavior !== a.behavior) entry('behavior')
        if (JSON.stringify(b.contracts) !== JSON.stringify(a.contracts)) entry('contracts')
      }
    }
  }
  return out
}

function resolveFrom(req: NodeJS.Require, id: string): string | null {
  try {
    return req.resolve(id)
  } catch {}
  try {
    return createRequire(req.resolve('@hozu/cli')).resolve(id)
  } catch {
    return null
  }
}

/** Runs in its own process: loads the app with its installed 0.7 packages (ADR 0043 Migration, step 1). */
export async function stale07(config: string): Promise<Stale07> {
  const req = createRequire(config)
  const empty = (skipped: string, core: string | null = null, irVersion: number | null = null): Stale07 => ({
    core,
    irVersion,
    skipped,
    stale: [],
    routes: {},
    errors: [],
    ir: null,
  })
  const corePath = resolveFrom(req, '@hozu/core/ir')
  if (!corePath) return empty('@hozu/core is not installed')
  const version = JSON.parse(readFileSync(join(dirname(corePath), '../package.json'), 'utf8'))
    .version as string
  if (!/^0\.[0-7]\./.test(version))
    return empty(
      `the installed @hozu/core is ${version}; the stale check runs on 0.7, before the upgrade`,
      version,
      2,
    )
  const validatorPath = resolveFrom(req, '@hozu/validator')
  const hook = resolveFrom(req, '@hozu/transform/hook')
  if (!validatorPath || !hook) return empty('@hozu/validator or @hozu/transform is not installed', version)
  register(pathToFileURL(hook))
  const core = await import(pathToFileURL(corePath).href)
  const validator = await import(pathToFileURL(validatorPath).href)
  const built = core.buildProject((await import(pathToFileURL(config).href)).default, { sources: false })
  if (built.ir.irVersion !== 1)
    return empty(
      'the installed Hozu already builds IR v2 (0.8): the stale check runs on 0.7, before the upgrade',
      version,
      built.ir.irVersion,
    )
  const lockPath = join(dirname(config), 'hozu.lock.json')
  const committed = existsSync(lockPath) ? (JSON.parse(readFileSync(lockPath, 'utf8')) as Lock) : null
  const verified = validator.verify(built.ir, { bindings: built.bindings, lock: null, accept: true })
  const errors = [...built.diagnostics, ...verified.diagnostics]
    .filter((d: { severity: string }) => d.severity === 'error')
    .map((d: { code: string; message: string }) => `${d.code} ${d.message}`)
  const routes: Stale07['routes'] = {}
  for (const r of Object.values(built.ir.routes) as { path: string; search: any }[]) {
    const defaults: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(r.search?.properties ?? {}) as [string, any][])
      if (v && typeof v === 'object' && 'default' in v) defaults[k] = v.default
    routes[r.path] = defaults
  }
  return {
    core: version,
    irVersion: 1,
    skipped: committed ? null : 'no hozu.lock.json',
    stale: committed && verified.lock ? staleEntries(committed, verified.lock) : [],
    routes,
    errors,
    ir: built.ir,
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const result = await stale07(process.argv[2]!).catch(
    (error: unknown): Stale07 => ({
      core: null,
      irVersion: null,
      skipped: `the 0.7 app did not load: ${error instanceof Error ? error.message : String(error)}`,
      stale: [],
      routes: {},
      errors: [],
      ir: null,
    }),
  )
  process.stdout.write(JSON.stringify(result), () => process.exit(0))
}
