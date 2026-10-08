import { type BuildResult, hashJson, type ProjectIR } from '@hozu/core/ir'
import { renderBuild } from './shared.ts'

/** One browser module of `fn` implementations (ADR 0050 C). */
export interface FnModule {
  path: string
  source: string
}

/**
 * Framework builtins (`%…` operators, `#…` formats and messages, which server lowering may add to an island) share
 * one module that every island page loads; a feature's `fn`s go in its own.
 */
export const moduleOfFn = (ref: string) => (/^[%#]/.test(ref) ? 'hozu' : ref.slice(0, ref.indexOf('.')))

/** Every `fn` reference in an IR value: `{ fn, arg }` values and `{ op: 'fn', fn, arg }` guards. */
export function fnRefs(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const v of value) fnRefs(v, out)
  else if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>
    if (typeof o.fn === 'string' && 'arg' in o) out.add(o.fn)
    for (const v of Object.values(o)) fnRefs(v, out)
  }
  return out
}

/** The `fn`s the browser can call: those in machines and in views bound to a machine. */
export function clientFns(ir: ProjectIR): Set<string> {
  const out = new Set<string>()
  for (const f of Object.values(ir.features)) {
    if (f.machine) fnRefs(f.machine, out)
    for (const view of Object.values(f.views)) if (view.machine) fnRefs(view.root, out)
    for (const q of Object.values(f.queries)) if (q.runs !== 'server') fnRefs(q.tags, out)
    for (const m of Object.values(f.mutations)) if (m.runs !== 'server') fnRefs(m.invalidates, out)
  }
  return out
}

/** The routes and endpoints an island can reach: `ui.link(route | endpoint, …)` values in nodes and machines (ADR 0050 E). */
export function linkTargets(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const v of value) linkTargets(v, out)
  else if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>
    if (typeof o.link === 'string' && 'params' in o) out.add(o.link)
    if (typeof o.endpoint === 'string' && 'input' in o) out.add(o.endpoint)
    for (const v of Object.values(o)) linkTargets(v, out)
  }
  return out
}

const routeModules = new WeakMap<ProjectIR, Map<string, string[]>>()

/** The fn modules a page's islands can call: its machine-bound views and their machines, plus builtins. */
export function modulesOfPage(ir: ProjectIR, views: string[], available: Record<string, string>): string[] {
  const memo = routeModules.get(ir) ?? new Map<string, string[]>()
  routeModules.set(ir, memo)
  const key = views.join(' ')
  let names = memo.get(key)
  if (!names) {
    const refs = new Set<string>()
    for (const ref of views) {
      const dot = ref.indexOf('.')
      const feature = ir.features[ref.slice(0, dot)]
      const view = feature?.views[ref.slice(dot + 1)]
      if (!feature || !view?.machine) continue
      fnRefs(view.root, refs)
      fnRefs(ir.features[view.machine]?.machine ?? null, refs)
      for (const q of Object.values(feature.queries)) if (q.runs !== 'server') fnRefs(q.tags, refs)
      for (const m of Object.values(feature.mutations)) if (m.runs !== 'server') fnRefs(m.invalidates, refs)
    }
    names = [...new Set(['hozu', ...[...refs].map(moduleOfFn)])].sort()
    memo.set(key, names)
  }
  return names.flatMap((n) => (available[n] ? [available[n]] : []))
}

const expressionOf = (impl: unknown) => {
  const source = String(impl)
  return /^(async\s+)?(function\b|\(|[A-Za-z_$][\w$]*\s*=>)/.test(source) ? source : `function ${source}`
}

function moduleSource(build: BuildResult, refs: string[]): string {
  const helpers = new Map<string, string>()
  const clashing = new Set<string>()
  for (const ref of refs)
    for (const [name, src] of Object.entries(build.bindings.fnHelpers[ref] ?? {})) {
      const seen = helpers.get(name)
      if (seen === undefined) helpers.set(name, src)
      else if (seen !== src) clashing.add(name)
    }
  const shared = [...helpers].filter(([name]) => !clashing.has(name))
  const entries = refs.map((ref) => {
    const own = Object.entries(build.bindings.fnHelpers[ref] ?? {}).filter(([name]) => clashing.has(name))
    const expression = expressionOf(build.bindings.fns[ref])
    if (!own.length) return `  ${JSON.stringify(ref)}: ${expression},`
    const locals = own.map(([name, src]) => `const ${name} = ${src};`).join(' ')
    return `  ${JSON.stringify(ref)}: (() => { ${locals} return ${expression} })(),`
  })
  return `${shared.map(([name, src]) => `const ${name} = ${src};\n`).join('')}export const fns = {\n${entries.join('\n')}\n}\n;(globalThis.__hozuFns ??= {})[import.meta.url] = fns\n`
}

/** The browser `fn` modules of a build, by module name, at content-hashed paths under `/_hozu/f/`. */
export function fnModules(built: BuildResult): Record<string, FnModule> {
  const build = renderBuild(built)
  const groups = new Map<string, string[]>()
  const builtins = Object.keys(build.bindings.fns).filter((ref) => moduleOfFn(ref) === 'hozu')
  for (const ref of [...new Set([...clientFns(build.ir), ...builtins])].sort()) {
    if (!(ref in build.bindings.fns)) continue
    const name = moduleOfFn(ref)
    groups.set(name, [...(groups.get(name) ?? []), ref])
  }
  const out: Record<string, FnModule> = {}
  for (const [name, refs] of groups) {
    const source = moduleSource(build, refs)
    out[name] = { path: `/_hozu/f/${name}-${hashJson(source).slice(0, 10)}.js`, source }
  }
  return out
}
