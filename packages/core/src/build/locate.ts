import type { SourceLoc } from '../ir/diagnostic.ts'
import type { Freshness, GuardExpr, Json, JsonSchema, Runs, ValueExpr, ViewNode } from '../ir/types.ts'
import type { BuildResult } from './project.ts'

export interface DevOptions {
  root: string
}

export interface DevLocation {
  file: string
  line: number
  column: number
}

export interface DevCondition {
  kind: 'when' | 'if' | 'query' | 'each'
  detail: string
  location: DevLocation | null
}

export interface DevTransition {
  from: string
  to: string
  guarded: boolean
  navigates: boolean
  location: DevLocation | null
}

export interface DevTextSource {
  kind: 'literal' | 'message' | 'data' | 'context' | 'route' | 'computed'
  detail: string
  location: DevLocation | null
  uses: number | null
}

export interface DevNode {
  id: string
  pointer: string | null
  kind:
    | 'element'
    | 'component'
    | 'text'
    | 'query'
    | 'when'
    | 'if'
    | 'list'
    | 'html'
    | 'embed'
    | 'page'
    | 'other'
  tag: string | null
  owner: { feature: string; view: string } | null
  component: {
    ref: string
    variant: Record<string, string>
    declaration: DevLocation | null
    uses: number
  } | null
  location: DevLocation | null
  classes: string | null
  text: string | null
  source: DevTextSource | null
  events: { dom: string; event: string; transitions: DevTransition[] }[]
  conditions: DevCondition[]
  machine: DevLocation | null
  children: { id: string; kind: string; text: string | null; source: DevTextSource | null }[]
  excerpt: { start: number; lines: string[] } | null
  page: DevPage | null
}

export interface DevPage {
  route: string
  path: string
  routeLocation: DevLocation | null
  views: string[]
  head: {
    title: string | null
    description: string | null
    image: string | null
    type: 'website' | 'article'
    noindex: boolean
    query: string | null
  }
}

interface Entry {
  node: ViewNode
  parents: ViewNode[]
  feature: string
  view: string
}

const indexes = new WeakMap<BuildResult, Map<string, Entry>>()

const childrenOf = (n: ViewNode): ViewNode[] => {
  switch (n.kind) {
    case 'el':
    case 'when':
    case 'component':
      return n.children
    case 'if':
      return [...n.ifTrue, ...n.ifFalse]
    case 'each':
      return [n.item]
    case 'query':
      return [n.ready, ...(n.pending ? [n.pending] : []), ...Object.values(n.failed)]
    default:
      return []
  }
}

const counter = (build: BuildResult) => (test: (n: ViewNode) => boolean) => {
  const places = new Set<string>()
  for (const entry of index(build).values()) {
    if (!test(entry.node)) continue
    const at = (id: string) => {
      const loc = build.sources[build.nodes?.[id] ?? '']
      return loc ? `${loc.file}:${loc.line}:${loc.column}` : null
    }
    places.add(at(entry.node.id) ?? at(entry.parents.at(-1)?.id ?? '') ?? entry.node.id)
  }
  return places.size
}

const useOf = (n: ViewNode) => (n.kind === 'component' || n.kind === 'el' ? n.use : undefined)

function index(build: BuildResult): Map<string, Entry> {
  let map = indexes.get(build)
  if (map) return map
  map = new Map()
  for (const [feature, f] of Object.entries(build.ir.features))
    for (const [view, v] of Object.entries(f.views ?? {})) {
      const walk = (node: ViewNode, parents: ViewNode[]) => {
        map!.set(node.id, { node, parents, feature, view })
        for (const c of childrenOf(node)) walk(c, [...parents, node])
      }
      walk(v.root, [])
    }
  indexes.set(build, map)
  return map
}

const relative = (root: string, loc: SourceLoc | undefined): DevLocation | null => {
  if (!loc) return null
  const base = root.endsWith('/') ? root : `${root}/`
  return {
    file: loc.file.startsWith(base) ? loc.file.slice(base.length) : loc.file,
    line: loc.line,
    column: loc.column,
  }
}

type Provider = Extract<ViewNode, { kind: 'query' } | { kind: 'each' }>

const describeWith = (build: BuildResult, providers: Provider[], root: string) => {
  const count = counter(build)
  const queryOf = (v: ValueExpr): string | null => {
    if (!('ref' in v) || v.ref !== 'binding') return null
    const p = providers[v.depth ?? 0]
    return !p ? null : p.kind === 'query' ? p.query : queryOf(p.source)
  }
  const declared = (owned: string, kind: string) => {
    const dot = owned.indexOf('.')
    return relative(root, build.sources[`/features/${owned.slice(0, dot)}/${kind}/${owned.slice(dot + 1)}`])
  }
  const describe = (v: ValueExpr): string => {
    if ('literal' in v) return typeof v.literal === 'string' ? v.literal : JSON.stringify(v.literal)
    if ('ref' in v && v.ref === 'binding') {
      const p = providers[v.depth ?? 0]
      const base = !p ? 'item' : p.kind === 'query' ? p.query : `${describe(p.source)}[]`
      return [base, ...v.path].join('.')
    }
    if ('ref' in v) return [v.ref === 'context' ? 'ctx' : v.ref, ...v.path].join('.')
    if ('fn' in v && v.fn.startsWith('#msg:')) {
      const name = v.fn.slice(5)
      const dot = name.indexOf('.')
      const messages = build.ir.features[name.slice(0, dot)]?.messages
      const base = messages?.text[messages.base]?.[name.slice(dot + 1)]
      return base === undefined ? `message ${name}` : `${JSON.stringify(base)} · message ${name}`
    }
    if ('fn' in v) return `${v.fn}(…)`
    return '…'
  }
  const source = (v: ValueExpr): DevTextSource => {
    const of = (kind: DevTextSource['kind'], location: DevLocation | null = null) => ({
      kind,
      detail: kind === 'message' && 'fn' in v ? v.fn.slice(5) : describe(v),
      location,
      uses:
        kind === 'message' && 'fn' in v
          ? count((n) => n.kind === 'text' && 'fn' in n.value && n.value.fn === v.fn)
          : null,
    })
    if ('literal' in v) return of('literal')
    if ('fn' in v && v.fn.startsWith('#msg:')) {
      const name = v.fn.slice(5)
      return of(
        'message',
        relative(root, build.sources[`/features/${name.slice(0, name.indexOf('.'))}/messages`]),
      )
    }
    if ('ref' in v && v.ref === 'context') return of('context')
    if ('ref' in v && (v.ref === 'params' || v.ref === 'search')) return of('route')
    if ('ref' in v) {
      const query = queryOf(v)
      return of('data', query ? declared(query, 'queries') : null)
    }
    return of('computed')
  }
  return { describe, source }
}

const kindOf = (n: ViewNode): DevNode['kind'] =>
  n.kind === 'el'
    ? 'element'
    : n.kind === 'each'
      ? 'list'
      : n.kind === 'global'
        ? 'other'
        : (n.kind as DevNode['kind'])

function locatePage(build: BuildResult, route: string, dev: DevOptions): DevNode | null {
  const page = build.ir.pages[route]
  const r = build.ir.routes[route]
  if (!page || !r) return null
  const { describe } = describeWith(build, [], dev.root)
  const value = (v: ValueExpr) =>
    'literal' in v && (v.literal === null || v.literal === '') ? null : describe(v)
  return {
    id: `page:${route}`,
    pointer: `/pages/${route}`,
    kind: 'page',
    tag: null,
    owner: null,
    component: null,
    location: relative(dev.root, build.sources[`/pages/${route}`]),
    classes: null,
    text: null,
    source: null,
    events: [],
    conditions: [],
    machine: null,
    children: [],
    excerpt: null,
    page: {
      route,
      path: r.path,
      routeLocation: relative(dev.root, build.sources[`/routes/${route}`]),
      views: page.views,
      head: {
        title: value(page.head.title),
        description: value(page.head.description),
        image: value(page.head.image),
        type: page.head.type,
        noindex: page.head.noindex,
        query: page.head.query?.ref ?? null,
      },
    },
  }
}

export function locateNode(build: BuildResult, target: string, dev: DevOptions): DevNode | null {
  if (target.startsWith('page:')) return locatePage(build, target.slice(5), dev)
  if (target.startsWith('/pages/')) return locatePage(build, target.slice(7), dev)
  const id = target.startsWith('/')
    ? (Object.entries(build.nodes ?? {}).find(([, p]) => p === target)?.[0] ?? '')
    : target
  const entry = index(build).get(id)
  if (!entry) return null
  const { node, parents, feature, view } = entry
  const providers = parents.filter((p): p is Provider => p.kind === 'query' || p.kind === 'each')
  const { describe, source } = describeWith(build, providers, dev.root)
  const at = (nodeId: string) => {
    const pointer = build.nodes?.[nodeId]
    return pointer ? relative(dev.root, build.sources[pointer]) : null
  }
  const pointer = build.nodes?.[id] ?? null
  let location = at(id)
  for (let i = parents.length - 1; !location && i >= 0; i--) location = at(parents[i]!.id)
  const use = useOf(node)
  const component = use
    ? {
        ref: use.component,
        variant: use.variant,
        declaration: (() => {
          const [owner, name] = use.component.split('.') as [string, string]
          return relative(
            dev.root,
            build.sources[`/kits/${owner}/components/${name}`] ??
              build.sources[`/features/${owner}/components/${name}`],
          )
        })(),
        uses: counter(build)((n) => useOf(n)?.component === use.component),
      }
    : null
  const conditions: DevCondition[] = []
  parents.forEach((p, i) => {
    const child = parents[i + 1] ?? node
    if (p.kind === 'when')
      conditions.push({ kind: 'when', detail: `state in ${p.states.join(' | ')}`, location: at(p.id) })
    if (p.kind === 'if')
      conditions.push({
        kind: 'if',
        detail: p.ifTrue.includes(child) ? 'condition true' : 'condition false',
        location: at(p.id),
      })
    if (p.kind === 'each')
      conditions.push({ kind: 'each', detail: `item of ${describe(p.source)}`, location: at(p.id) })
    if (p.kind === 'query') {
      const branch =
        p.ready === child
          ? 'ready'
          : p.pending === child
            ? 'pending'
            : `failed.${Object.entries(p.failed).find(([, n]) => n === child)?.[0] ?? '?'}`
      conditions.push({ kind: 'query', detail: `${p.query} ${branch}`, location: at(p.id) })
    }
  })
  const states = build.ir.features[feature]?.machine?.states ?? {}
  const transitions = (event: string): DevTransition[] =>
    Object.entries(states).flatMap(([from, state]) =>
      (state.on[event] ?? []).map((t, i) => ({
        from,
        to: t.target,
        guarded: t.guard !== null,
        navigates: t.navigate !== null,
        location: relative(
          dev.root,
          build.sources[`/features/${feature}/machine/states/${from}/on/${event}/${i}`],
        ),
      })),
    )
  const events =
    node.kind === 'el' || node.kind === 'component'
      ? Object.entries(node.on).map(([dom, send]) => ({
          dom,
          event: send.event,
          transitions: transitions(send.event),
        }))
      : []
  const machine = build.ir.features[feature]?.machine
    ? relative(dev.root, build.sources[`/features/${feature}/machine`])
    : null
  return {
    id,
    pointer,
    kind: kindOf(node),
    tag: node.kind === 'el' ? node.tag : null,
    owner: { feature, view },
    component,
    location,
    classes: node.kind === 'el' || node.kind === 'component' ? node.class : null,
    text: node.kind === 'text' ? describe(node.value) : null,
    source: node.kind === 'text' ? source(node.value) : null,
    events,
    conditions,
    machine,
    children: childrenOf(node).map((c) => ({
      id: c.id,
      kind: kindOf(c),
      text: c.kind === 'text' ? describe(c.value) : null,
      source: c.kind === 'text' ? source(c.value) : null,
    })),
    excerpt: null,
    page: null,
  }
}

export interface DevTreeNode {
  id: string
  kind: DevNode['kind']
  label: string
  component: string | null
  children: DevTreeNode[]
}

export type DevPreview =
  | { query: string; branch: string }
  | { feature: string; state: string; context?: { [key: string]: Json } }

export interface DevScenario {
  label: string
  node: string
  preview: DevPreview
}

export interface DevPageTree {
  route: string
  views: DevTreeNode[]
  scenarios: DevScenario[]
}

const spaced = (name: string) => {
  const s = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function sample(schema: JsonSchema | undefined): Json {
  const type = schema?.type
  const types = Array.isArray(type) ? type.filter((t) => t !== 'null') : [type]
  if (Array.isArray(schema?.enum)) return (schema.enum as Json[]).find((v) => v !== null) ?? null
  if (types.includes('number') || types.includes('integer')) return 1
  if (types.includes('boolean')) return true
  if (types.includes('array')) return [sample(schema?.items as JsonSchema | undefined)]
  if (types.includes('object')) {
    const props = (schema?.properties ?? {}) as Record<string, JsonSchema>
    return Object.fromEntries(Object.entries(props).map(([k, v]) => [k, sample(v)]))
  }
  return 'Preview text'
}

const schemaAt = (schema: JsonSchema | undefined, path: string[]): JsonSchema | undefined =>
  path.reduce<JsonSchema | undefined>(
    (s, key) => ((s?.properties as Record<string, JsonSchema> | undefined) ?? {})[key],
    schema,
  )

type Patch = { path: string[]; value: Json }

function solve(g: GuardExpr, want: boolean, schema: JsonSchema | undefined): Patch[] | null {
  if (g.op === 'not') return solve(g.arg, !want, schema)
  if (g.op === 'and' || g.op === 'or') {
    const all = (g.op === 'and') === want
    if (!all) {
      for (const a of g.args) {
        const p = solve(a, want, schema)
        if (p) return p
      }
      return null
    }
    const parts = g.args.map((a) => solve(a, want, schema))
    return parts.every(Boolean) ? (parts.flat() as Patch[]) : null
  }
  if (g.op === 'fn') {
    if (g.fn !== '%truthy' || !('ref' in g.arg) || g.arg.ref !== 'context') return null
    return want ? [{ path: g.arg.path, value: sample(schemaAt(schema, g.arg.path)) }] : null
  }
  if (!('left' in g)) return null
  const [ref, lit] =
    'ref' in g.left && 'literal' in g.right
      ? [g.left, g.right.literal]
      : 'ref' in g.right && 'literal' in g.left
        ? [g.right, g.left.literal]
        : [null, null]
  if (!ref || !('ref' in ref) || ref.ref !== 'context') return null
  const filled = sample(schemaAt(schema, ref.path))
  const equal = g.op === 'eq' ? want : g.op === 'neq' ? !want : null
  if (equal === true) return [{ path: ref.path, value: lit }]
  if (equal === false) return lit === null ? [{ path: ref.path, value: filled }] : null
  if (typeof lit !== 'number') return null
  const above = (g.op === 'gt' || g.op === 'gte') === want
  return [{ path: ref.path, value: above ? lit + 1 : lit - 1 }]
}

const patchOf = (patches: Patch[]): { [key: string]: Json } => {
  const out: { [key: string]: Json } = {}
  for (const { path, value } of patches) {
    let at = out
    path.forEach((key, i) => {
      if (i === path.length - 1) at[key] = value
      else {
        at[key] ??= {}
        at = at[key] as { [key: string]: Json }
      }
    })
  }
  return out
}

function contextRefs(nodes: unknown): string[][] {
  const found = new Map<string, string[]>()
  const walk = (x: unknown) => {
    if (!x || typeof x !== 'object') return
    if (Array.isArray(x)) return x.forEach(walk)
    const o = x as Record<string, unknown>
    if (o.ref === 'context' && Array.isArray(o.path)) found.set(o.path.join('.'), o.path as string[])
    for (const v of Object.values(o)) walk(v)
  }
  walk(nodes)
  return [...found.values()]
}

const valueAt = (v: Json, path: string[]): Json | undefined =>
  path.reduce<Json | undefined>(
    (x, k) => (x && typeof x === 'object' && !Array.isArray(x) ? x[k] : undefined),
    v,
  )

/** Marks a query that does not run on the server (ADR 0049, 0050 H). */
const runsLabel = (build: BuildResult, ref: string) => {
  const dot = ref.indexOf('.')
  const runs = build.ir.features[ref.slice(0, dot)]?.queries[ref.slice(dot + 1)]?.runs
  return runs && runs !== 'server' ? ` · runs: ${runs}` : ''
}

export function pageTree(build: BuildResult, route: string): DevPageTree | null {
  const page = build.ir.pages[route]
  if (!page) return null
  const scenarios: DevScenario[] = []
  const seen = new Set<string>()
  const add = (label: string, node: string, preview: DevPreview) => {
    const key = JSON.stringify(preview)
    if (seen.has(key)) return
    seen.add(key)
    scenarios.push({ label, node, preview })
  }
  const views = page.views.flatMap((ref) => {
    const [feature, view] = ref.split('.') as [string, string]
    const f = build.ir.features[feature]
    const root = f?.views?.[view]?.root
    if (!f || !root) return []
    const { describe } = describeWith(build, [], '')
    const walk = (n: ViewNode): DevTreeNode => {
      const use = useOf(n)
      if (n.kind === 'query') {
        const name = spaced(n.query.slice(n.query.indexOf('.') + 1))
        if (n.pending)
          add(`Loading ${name.toLowerCase()}`, n.pending.id, { query: n.query, branch: 'pending' })
        for (const [error, branch] of Object.entries(n.failed))
          add(`${name} failed: ${error}`, branch.id, { query: n.query, branch: `failed.${error}` })
      }
      if (n.kind === 'when' && f.machine) {
        const schema = f.schemas[f.machine.context]
        const initial = f.machine.initialContext
        const blank = contextRefs(n.children).filter((path) => {
          const v = valueAt(initial, path)
          return v === '' || v === null
        })
        const filled = blank.map((path) => ({ path, value: sample(schemaAt(schema, path)) }))
        for (const state of n.states)
          if (state !== f.machine.initial)
            add(
              spaced(state),
              n.id,
              filled.length ? { feature, state, context: patchOf(filled) } : { feature, state },
            )
      }
      if (n.kind === 'if' && f.machine) {
        const schema = f.schemas[f.machine.context]
        const initial = f.machine.initialContext
        for (const want of [true, false]) {
          const patches = solve(n.test, want, schema)
          if (!patches?.length) continue
          if (patches.every((p) => JSON.stringify(valueAt(initial, p.path)) === JSON.stringify(p.value)))
            continue
          const first = patches[0]!
          const name = spaced(first.path.at(-1) ?? 'value').toLowerCase()
          const label =
            first.value === null
              ? `When ${name} is empty`
              : typeof first.value === 'string' && first.value === 'Preview text'
                ? `When ${name} is set`
                : `When ${name} is ${JSON.stringify(first.value)}`
          add(label, n.id, { feature, state: f.machine.initial, context: patchOf(patches) })
          break
        }
      }
      const label = use
        ? (use.component.split('.').pop() ?? use.component)
        : n.kind === 'el'
          ? n.tag
          : n.kind === 'text'
            ? describe(n.value).slice(0, 40)
            : n.kind === 'query'
              ? `query ${n.query}${runsLabel(build, n.query)}`
              : n.kind === 'when'
                ? `while ${n.states.join(' | ')}`
                : n.kind === 'each'
                  ? `list ${describe(n.source)}`
                  : n.kind
      return {
        id: n.id,
        kind: kindOf(n),
        label,
        component: use?.component ?? null,
        children: childrenOf(n).map(walk),
      }
    }
    const tree = { ...walk(root), id: ref, label: ref }
    if (f.machine && f.views?.[view]?.machine === f.id)
      for (const [state, def] of Object.entries(f.machine.states))
        if (
          def.invoke &&
          state !== f.machine.initial &&
          !scenarios.some(
            (x) => 'state' in x.preview && x.preview.feature === feature && x.preview.state === state,
          )
        )
          add(spaced(state), root.id, { feature, state })
    return [tree]
  })
  return { route, views, scenarios }
}

/** A query or mutation a page uses, for the DevTools API panel (ADR 0050 G). */
export interface DevEffect {
  ref: string
  kind: 'query' | 'mutation'
  label: string
  runs: Runs
  scope: 'public' | 'user'
  freshness: string
  tags: string[]
  invalidates: string[]
  input: JsonSchema
  errors: string[]
  /** The view nodes that read a query, or the machine states that start the effect. */
  usedBy: string[]
}

const freshnessText = (f: Freshness) => ('seconds' in f ? `${f.kind} ${f.seconds}s` : f.kind)

/** The queries a page's views read and the effects its machines start, with their input schemas. */
export function pageEffects(build: BuildResult, route: string): DevEffect[] | null {
  const page = build.ir.pages[route]
  if (!page) return null
  const uses = new Map<string, string[]>()
  const use = (ref: string, by: string) => uses.set(ref, [...(uses.get(ref) ?? []), by])
  const machines = new Set<string>()
  for (const ref of page.views) {
    const [feature, view] = ref.split('.') as [string, string]
    const v = build.ir.features[feature]?.views?.[view]
    if (!v) continue
    if (v.machine) machines.add(v.machine)
    const walk = (n: ViewNode) => {
      if (n.kind === 'query') use(n.query, n.id)
      for (const c of childrenOf(n)) walk(c)
    }
    walk(v.root)
  }
  for (const feature of machines)
    for (const [state, s] of Object.entries(build.ir.features[feature]?.machine?.states ?? {}))
      if (s.invoke) use(s.invoke.effect, `${feature}.${state}`)
  return [...uses].flatMap(([ref, usedBy]) => {
    const dot = ref.indexOf('.')
    const f = build.ir.features[ref.slice(0, dot)]
    const sym = ref.slice(dot + 1)
    const q = f?.queries[sym]
    const m = f?.mutations[sym]
    const e = q ?? m
    if (!f || !e) return []
    return [
      {
        ref,
        kind: q ? ('query' as const) : ('mutation' as const),
        label: spaced(sym),
        runs: e.runs,
        scope: q ? q.scope : 'user',
        freshness: q ? freshnessText(q.freshness) : 'request',
        tags: q ? q.tags.map((t) => t.tag) : [],
        invalidates: m ? m.invalidates.map((t) => t.tag) : [],
        input: (f.schemas[e.input] ?? {}) as JsonSchema,
        errors: [...Object.keys(e.errors), ...(m ? ['Invalid'] : []), 'Unexpected'],
        usedBy: [...new Set(usedBy)],
      },
    ]
  })
}
