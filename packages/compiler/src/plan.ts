import {
  anyGuardRef,
  anyRef,
  type FeatureIR,
  join,
  type ProjectIR,
  type QueryIR,
  type ValueExpr,
  type ViewNode,
} from '@hozu/core/ir'

/** `browser`: read in the browser after hydration (ADR 0049); the server renders `pending` and never sees the data. */
export type Mode = 'static' | 'isr' | 'swr' | 'request' | 'browser'

export interface RegionPlan {
  id: string
  parent: string | null
  query: string | null
  scope: 'public' | 'user' | null
  mode: Mode
  seconds: number | null
  reactive: boolean
  pointer: string
}

export interface NodePlan {
  id: string
  region: string
  mode: Mode
  hydrate: boolean
}

export interface RoutePlan {
  route: string
  path: string
  views: string[]
  assert: 'static' | 'cacheable' | null
  cacheable: boolean
  regions: RegionPlan[]
  islands: string[]
  js: 'always' | 'conditional' | false
  nodes: NodePlan[]
}

export interface PlanIssue {
  code: 'HZ022' | 'HZ023'
  feature: string | null
  pointer: string
  message: string
  cause: string
}

const rank: Record<Mode, number> = { static: 0, isr: 1, swr: 2, request: 3, browser: 4 }

function own(q: QueryIR): { mode: Mode; seconds: number | null } {
  if (q.runs === 'browser') return { mode: 'browser', seconds: null }
  if (
    q.scope === 'user' ||
    q.freshness.kind === 'live' ||
    q.freshness.kind === 'request' ||
    q.freshness.kind === 'poll'
  )
    return { mode: 'request', seconds: null }
  if (q.freshness.kind === 'static') return { mode: 'static', seconds: null }
  return { mode: q.freshness.kind === 'revalidate' ? 'isr' : 'swr', seconds: q.freshness.seconds }
}

function combine(parent: RegionPlan, child: { mode: Mode; seconds: number | null }) {
  const mode = rank[child.mode] >= rank[parent.mode] ? child.mode : parent.mode
  const seconds =
    mode === 'isr' || mode === 'swr'
      ? Math.min(...[parent.seconds, child.seconds].filter((s): s is number => s !== null))
      : null
  return { mode, seconds }
}

export const readsContext = (v: ValueExpr): boolean =>
  anyRef(v, (r) => r.ref === 'context' || r.ref === 'state')

const readsBinding = (v: ValueExpr, tainted: boolean[]): boolean =>
  anyRef(v, (r) => r.ref === 'binding' && tainted[r.depth] === true)

export function hydrates(node: ViewNode): boolean {
  switch (node.kind) {
    case 'el':
      return (
        Object.keys(node.on).length > 0 ||
        [node.attrs, node.toggle, node.vars].some((m) => Object.values(m).some(readsContext))
      )
    case 'text':
      return readsContext(node.value)
    case 'when':
    case 'component':
    case 'global':
      return true
    case 'if':
      return anyGuardRef(node.test, (r) => r.ref === 'context' || r.ref === 'state')
    case 'html':
      return readsContext(node.value)
    case 'each':
      return readsContext(node.source)
    case 'query':
      return readsContext(node.input)
    default:
      return false
  }
}

const resolve = (ir: ProjectIR, ref: string) => {
  const dot = ref.indexOf('.')
  return { feature: ir.features[ref.slice(0, dot)], symbol: ref.slice(dot + 1) }
}

export function planRoute(ir: ProjectIR, route: string): { plan: RoutePlan; issues: PlanIssue[] } {
  const page = ir.pages[route]
  if (!page) throw new Error(`No page renders route "${route}"`)
  const shell: RegionPlan = {
    id: 'shell',
    parent: null,
    query: null,
    scope: null,
    mode: 'static',
    seconds: null,
    reactive: false,
    pointer: join('', 'pages', route),
  }
  const invalidated = new Set<string>()
  for (const ref of page.views) {
    const { feature, symbol } = resolve(ir, ref)
    if (!feature?.views[symbol]?.machine) continue
    for (const s of Object.values(feature.machine?.states ?? {})) {
      if (!s.invoke) continue
      const { feature: owner, symbol } = resolve(ir, s.invoke.effect)
      for (const t of owner?.mutations[symbol]?.invalidates ?? []) invalidated.add(t.tag)
    }
  }
  const reactiveQuery = (ref: string) => {
    const { feature, symbol } = resolve(ir, ref)
    return (feature?.queries[symbol]?.tags ?? []).some((t) => invalidated.has(t.tag))
  }
  const liveQuery = (ref: string) => {
    const { feature, symbol } = resolve(ir, ref)
    const kind = feature?.queries[symbol]?.freshness.kind
    return kind === 'live' || kind === 'poll'
  }
  const browserQuery = (ref: string) => {
    const { feature, symbol } = resolve(ir, ref)
    return feature?.queries[symbol]?.runs === 'browser'
  }
  const regions: RegionPlan[] = [shell]
  if (page.head.query) {
    const { feature: owner, symbol } = resolve(ir, page.head.query.ref)
    const q = owner?.queries[symbol]
    if (q)
      regions.push({
        id: 'head',
        parent: 'shell',
        query: page.head.query.ref,
        scope: q.scope,
        ...combine(shell, own(q)),
        reactive: false,
        pointer: join('', 'pages', route, 'head'),
      })
  }
  const nodes: NodePlan[] = []
  const islands: string[] = []
  let certain = false
  const issues: PlanIssue[] = []

  const walk = (
    feature: FeatureIR,
    node: ViewNode,
    pointer: string,
    region: RegionPlan,
    tainted: boolean[],
    inIsland: boolean,
    branch = false,
  ) => {
    const hydrate =
      hydrates(node) ||
      (node.kind === 'query' &&
        (reactiveQuery(node.query) || liveQuery(node.query) || browserQuery(node.query)))
    if (hydrate && !inIsland) {
      islands.push(node.id)
      if (!branch) certain = true
    }
    const island = inIsland || hydrate
    nodes.push({ id: node.id, region: region.id, mode: region.mode, hydrate })
    const inner = node.kind === 'component' && !inIsland ? false : island
    const children = (list: ViewNode[], base: string, t = tainted, b = branch) =>
      list.forEach((c, i) => walk(feature, c, join(base, 'children', i), region, t, inner, b))
    switch (node.kind) {
      case 'el':
      case 'component':
        children(node.children, pointer)
        return
      case 'when':
        children(node.children, pointer, tainted, true)
        return
      case 'if':
        node.ifTrue.forEach((c, i) =>
          walk(feature, c, join(pointer, 'ifTrue', i), region, tainted, island, true),
        )
        node.ifFalse.forEach((c, i) =>
          walk(feature, c, join(pointer, 'ifFalse', i), region, tainted, island, true),
        )
        return
      case 'each': {
        const t = [...tainted, readsBinding(node.source, tainted)]
        walk(feature, node.item, join(pointer, 'item'), region, t, island, true)
        return
      }
      case 'query': {
        const { feature: owner, symbol } = resolve(ir, node.query)
        const q = owner?.queries[symbol]
        if (!q) return
        const combined = combine(region, own(q))
        if (
          q.scope === 'public' &&
          q.freshness.kind !== 'live' &&
          q.freshness.kind !== 'request' &&
          q.freshness.kind !== 'poll' &&
          readsBinding(node.input, tainted)
        )
          issues.push({
            code: 'HZ022',
            feature: feature.id,
            pointer: join(pointer, 'input'),
            message: `Public query ${node.query} is keyed by user-scoped data`,
            cause: `Its result is cached for every visitor (${q.freshness.kind}), so user-derived input would reach a cacheable region.`,
          })
        const child: RegionPlan = {
          id: node.id,
          parent: region.id,
          query: node.query,
          scope: q.scope,
          ...combined,
          reactive: reactiveQuery(node.query),
          pointer,
        }
        regions.push(child)
        const userData = q.scope === 'user' || q.runs === 'browser'
        walk(feature, node.ready, join(pointer, 'ready'), child, [...tainted, userData], island, true)
        if (node.pending) walk(feature, node.pending, join(pointer, 'pending'), child, tainted, island, true)
        for (const [name, n] of Object.entries(node.failed))
          walk(feature, n, join(pointer, 'failed', name), child, [...tainted, userData], island, true)
        return
      }
      case 'embed': {
        const { feature: owner, symbol } = resolve(ir, node.view)
        const view = owner?.views[symbol]
        if (owner && view)
          walk(
            owner,
            view.root,
            join('', 'features', owner.id, 'views', symbol, 'root'),
            region,
            [],
            island,
            branch,
          )
        return
      }
      default:
        return
    }
  }

  for (const ref of page.views) {
    const { feature, symbol } = resolve(ir, ref)
    const view = feature?.views[symbol]
    if (!feature || !view) continue
    walk(feature, view.root, join('', 'features', feature.id, 'views', symbol, 'root'), shell, [], false)
  }

  const cacheable = !regions.some((r) => r.mode === 'request')
  const plan: RoutePlan = {
    route,
    path: ir.routes[route]?.path ?? '',
    views: page.views,
    assert: page.assert,
    cacheable,
    regions,
    islands,
    js: islands.length === 0 ? false : certain ? 'always' : 'conditional',
    nodes,
  }
  const offending =
    page.assert === 'static'
      ? regions.filter((r) => r.mode !== 'static' && r.mode !== 'browser')
      : page.assert === 'cacheable'
        ? regions.filter((r) => r.mode === 'request')
        : []
  if (offending.length)
    issues.push({
      code: 'HZ023',
      feature: null,
      pointer: join('', 'pages', route, 'assert'),
      message: `Page "${route}" asserts ${page.assert} but derives ${offending.map((r) => `${r.query} → ${r.mode}`).join(', ')}`,
      cause: 'Render assertions are validated against the derived plan, never obeyed (principle 8).',
    })
  return { plan, issues }
}
