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

export interface DevNode {
  id: string
  pointer: string | null
  kind: 'element' | 'component' | 'text' | 'query' | 'when' | 'if' | 'list' | 'html' | 'embed' | 'other'
  tag: string | null
  owner: { feature: string; view: string } | null
  component: { ref: string; variant: Record<string, string>; declaration: DevLocation | null } | null
  location: DevLocation | null
  classes: string | null
  text: string | null
  events: { dom: string; event: string }[]
  conditions: DevCondition[]
  machine: DevLocation | null
  children: { id: string; kind: string; text: string | null }[]
  excerpt: { start: number; lines: string[] } | null
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

const describeWith =
  (build: BuildResult) =>
  (v: ValueExpr): string => {
    if ('literal' in v) return typeof v.literal === 'string' ? v.literal : JSON.stringify(v.literal)
    if ('ref' in v) return [v.ref === 'binding' ? 'item' : v.ref, ...v.path].join('.')
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

const kindOf = (n: ViewNode): DevNode['kind'] =>
  n.kind === 'el'
    ? 'element'
    : n.kind === 'each'
      ? 'list'
      : n.kind === 'global'
        ? 'other'
        : (n.kind as DevNode['kind'])

export function locateNode(build: BuildResult, target: string, dev: DevOptions): DevNode | null {
  const id = target.startsWith('/')
    ? (Object.entries(build.nodes ?? {}).find(([, p]) => p === target)?.[0] ?? '')
    : target
  const entry = index(build).get(id)
  if (!entry) return null
  const { node, parents, feature, view } = entry
  const describe = describeWith(build)
  const at = (nodeId: string) => {
    const pointer = build.nodes?.[nodeId]
    return pointer ? relative(dev.root, build.sources[pointer]) : null
  }
  const pointer = build.nodes?.[id] ?? null
  let location = at(id)
  for (let i = parents.length - 1; !location && i >= 0; i--) location = at(parents[i]!.id)
  const use = node.kind === 'component' ? node.use : node.kind === 'el' ? node.use : undefined
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
  const events =
    node.kind === 'el' || node.kind === 'component'
      ? Object.entries(node.on).map(([dom, send]) => ({ dom, event: send.event }))
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
    events,
    conditions,
    machine,
    children: childrenOf(node).map((c) => ({
      id: c.id,
      kind: kindOf(c),
      text: c.kind === 'text' ? describe(c.value) : null,
    })),
    excerpt: null,
  }
}
