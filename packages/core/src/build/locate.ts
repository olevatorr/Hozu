import type { SourceLoc } from '../ir/diagnostic.ts'
import type { ValueExpr, ViewNode } from '../ir/types.ts'
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
