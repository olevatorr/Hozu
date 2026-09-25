import { planRoute, type RoutePlan, softTargets } from '@tenon/compiler'
import {
  type BuildResult,
  canonicalStringify,
  eachGuardRef,
  eachRef,
  type FeatureIR,
  type HeadIR,
  type Json,
  type MachineIR,
  type ProjectIR,
  routeTable,
  type TagExprIR,
  type ValueExpr,
  type ViewNode,
  type WidgetIR,
} from '@tenon/core/ir'
import type { DataRuntime } from '@tenon/data'
import { compileGuard, type Getter, pathOf, type Snapshot } from '@tenon/machine'
import type { IslandRef, PagePayload, Result } from '@tenon/runtime-client'
import { attrText, text } from '@tenon/runtime-client'
import {
  CLOSE,
  classAndStyle,
  compileNode,
  expr,
  type Frag,
  OPEN,
  type Runtime,
  run,
  type Scope,
  separated,
} from './compile.ts'
import { escapeHtml, scriptJson } from './escape.ts'

export interface Assets {
  client: string
  fns: string | null
  styles: string | null
  preload: string[]
  widgets: Record<string, string>
}

export interface Stylesheet {
  href: string
  css: string
  assets: Record<string, string>
  preload: string[]
}

export interface WidgetBundle {
  urls: Record<string, string>
  files: Record<string, string>
}

export interface RenderOptions {
  build: BuildResult
  data: DataRuntime
  route: string
  params?: Json
  search?: Json
  snapshots?: Record<string, Snapshot>
  session?: unknown
  assets?: Assets
}

export interface RenderedPage {
  plan: RoutePlan
  status: number
  path: string
  chunks: AsyncIterable<string>
  tags: Set<string>
  redirect: string | null
}

export async function renderPage({
  build,
  data,
  route,
  params = null,
  search = null,
  snapshots = {},
  session,
  assets = { client: '/_tenon/client.js', fns: '/_tenon/fns.js', styles: null, preload: [], widgets: {} },
}: RenderOptions): Promise<RenderedPage> {
  const { ir, bindings } = build
  const plan = planOf(ir, route)
  const islandIds = new Set(plan.islands)
  const tags = new Set<string>()
  const payload: PagePayload = {
    islands: [],
    data: [],
    features: {},
    nodes: {},
    fns: null,
    params,
    search,
    widgets: {},
    routes: {},
    live: {},
  }
  const widgets = widgetsOf(ir)
  const fns = bindings.fns as Record<string, (x: Json) => Json>
  const getters = gettersFor(fns)

  const value = (v: ValueExpr, scope: Scope, input?: Json): Json => {
    let get = getters.get(v)
    if (!get) {
      get = expr(v, fns)
      getters.set(v, get)
    }
    return get(input === undefined ? scope : { ...scope, input })
  }

  const tagKeys = (list: TagExprIR[], input: Json, scope: Scope) =>
    list.map((t) => (t.param ? `${t.tag}(${canonicalStringify(value(t.param, scope, input))})` : t.tag))

  const routes = routesOf(ir)
  const url = pathOf(routes[route] ?? '/', params, search)
  const featureScope = (feature: FeatureIR, bound: boolean): Scope => {
    const snap = bound ? snapshots[feature.id] : undefined
    if (snap) payload.snapshots = { ...payload.snapshots, [feature.id]: snap }
    return {
      feature,
      context: bound ? (snap?.context ?? feature.machine?.initialContext ?? null) : null,
      state: bound ? (snap?.state ?? feature.machine?.initial ?? null) : null,
      bindings: [],
      params,
      search,
      routes,
      url,
    }
  }

  const open = (n: ViewNode, scope: Scope) => {
    const index = payload.islands.length
    const ref: IslandRef = { feature: scope.feature.id, node: n.id, scope: pruneScope(n, scope.bindings) }
    payload.islands.push(ref)
    payload.nodes[n.id] = n.kind === 'widget' ? { ...n, children: [] } : n
    payload.features[scope.feature.id] ??= (scope.feature.machine as MachineIR | null) ?? null
    void index
    return '<!--i-->'
  }

  const element = (n: Extract<ViewNode, { kind: 'el' }>, scope: Scope) => {
    let attrs = classAndStyle(n, (v) => value(v, scope))
    for (const name in n.attrs) {
      const x = attrText(name, value(n.attrs[name]!, scope))
      if (x !== null) attrs += x === '' ? ` ${name}` : ` ${name}="${escapeHtml(x)}"`
    }
    return `<${n.tag}${attrs}>`
  }

  const embedded = (n: Extract<ViewNode, { kind: 'embed' }>) => {
    const dot = n.view.indexOf('.')
    const owner = ir.features[n.view.slice(0, dot)]
    const view = owner?.views[n.view.slice(dot + 1)]
    return owner && view ? { root: view.root, scope: featureScope(owner, view.machine === owner.id) } : null
  }

  const suspends = (n: ViewNode): boolean => {
    const hit = suspendMemo.get(n)
    if (hit !== undefined) return hit
    let result: boolean
    switch (n.kind) {
      case 'query':
        result = true
        break
      case 'el':
      case 'when':
      case 'widget':
        result = n.children.some(suspends)
        break
      case 'if':
        result = n.ifTrue.some(suspends) || n.ifFalse.some(suspends)
        break
      case 'each':
        result = suspends(n.item)
        break
      case 'embed': {
        const e = embedded(n)
        result = e ? suspends(e.root) : false
        break
      }
      default:
        result = false
    }
    suspendMemo.set(n, result)
    return result
  }

  const runtime: Runtime = {
    open,
    embed: (view) => embedded({ kind: 'embed', id: '', view }),
    widget: (ref) => {
      const w = widgets[ref]
      const url = assets.widgets[ref]
      if (w && url) payload.widgets[ref] ??= { url, tag: w.tag, load: w.load, wraps: w.wraps }
    },
  }
  const compiled = compiledFor(plan, islandIds)
  const sync = (n: ViewNode, scope: Scope, island: boolean, sep = false): string => {
    const cache = island ? compiled.inside : compiled.outside
    let frag = cache.get(n)
    if (frag === undefined) {
      frag = compileNode(n, island, { islands: islandIds, fns, widgets }, sep)
      cache.set(n, frag)
    }
    return run(frag, scope, runtime)
  }

  let buffer = ''
  const out = channel()
  const flush = () => {
    if (buffer) out.push(buffer)
    buffer = ''
  }

  const render = async (n: ViewNode, scope: Scope, island: boolean, sep = false): Promise<void> => {
    if (!suspends(n)) {
      buffer += sync(n, scope, island, sep)
      return
    }
    if (!island && islandIds.has(n.id)) {
      buffer += open(n, scope)
      await render(n, scope, true)
      return
    }
    const [o, c] = island ? [OPEN, CLOSE] : ['', '']
    switch (n.kind) {
      case 'el':
      case 'widget': {
        const tag = n.kind === 'el' ? n.tag : (widgets[n.widget]?.tag ?? 'div')
        if (n.kind === 'widget') runtime.widget(n.widget)
        buffer += n.kind === 'el' ? element(n, scope) : `<${tag}${classAndStyle(n, (v) => value(v, scope))}>`
        const inner = n.kind === 'widget' && islandIds.has(n.id) ? false : island
        for (let i = 0; i < n.children.length; i++)
          await render(n.children[i]!, scope, inner, separated(n.children, i))
        buffer += `</${tag}>`
        return
      }
      case 'if': {
        buffer += o
        const branch = compileGuard(n.test, fns)(scope) ? n.ifTrue : n.ifFalse
        for (let i = 0; i < branch.length; i++) await render(branch[i]!, scope, island, separated(branch, i))
        buffer += c
        return
      }
      case 'when':
        buffer += o
        if (scope.state !== null && n.states.includes(scope.state))
          for (let i = 0; i < n.children.length; i++)
            await render(n.children[i]!, scope, island, separated(n.children, i))
        buffer += c
        return
      case 'each': {
        buffer += o
        const items = value(n.source, scope)
        if (Array.isArray(items))
          for (const item of items)
            await render(n.item, { ...scope, bindings: [...scope.bindings, item] }, island, true)
        buffer += c
        return
      }
      case 'embed': {
        const e = embedded(n)
        buffer += o
        if (e) await render(e.root, e.scope, island)
        buffer += c
        return
      }
      case 'query': {
        buffer += o
        const input = value(n.input, scope)
        const dot = n.query.indexOf('.')
        const q = ir.features[n.query.slice(0, dot)]?.queries[n.query.slice(dot + 1)]
        const pending = data.run(n.query, input, session)
        flush()
        const result = (await pending) as Result
        if (q) for (const t of tagKeys(q.tags, input, scope)) tags.add(t)
        if (island) {
          const key = n.query + canonicalStringify(input)
          payload.data.push([key, result])
          if (q?.freshness.kind === 'live')
            payload.live[key] = { query: n.query, input, tags: tagKeys(q.tags, input, scope) }
        }
        const branch = result.ok ? n.ready : (n.failed[result.error] ?? n.failed.Unexpected)
        if (branch)
          await render(
            branch,
            { ...scope, bindings: [...scope.bindings, result.ok ? result.value : result.data] },
            island,
          )
        buffer += c
        return
      }
      default:
        buffer += sync(n, scope, island, sep)
    }
  }

  const page = ir.pages[route]!
  const path = url
  const empty: Scope = {
    feature: { id: '' } as FeatureIR,
    context: null,
    state: null,
    bindings: [],
    params,
    search,
    routes,
    url,
  }
  let status = 200
  let redirect: string | null = null
  let headScope = empty
  if (page.head.query) {
    const input = value(page.head.query.input, empty)
    const result = (await data.run(page.head.query.ref, input, session)) as Result
    const dot = page.head.query.ref.indexOf('.')
    const q = ir.features[page.head.query.ref.slice(0, dot)]?.queries[page.head.query.ref.slice(dot + 1)]
    if (q) for (const t of tagKeys(q.tags, input, empty)) tags.add(t)
    if (!result.ok) {
      const target = page.head.redirects[result.error]
      if (target) redirect = pathOf(ir.routes[target]?.path ?? '/', null)
      status = redirect ? 303 : result.error === 'Unexpected' ? 500 : 404
    }
    headScope = { ...empty, bindings: [result.ok ? result.value : null] }
  }
  const head = headHtml(ir, route, page.head, (v) => value(v, headScope), path, status, assets)

  void (async () => {
    try {
      buffer += `<!doctype html><html${ir.site ? ` lang="${escapeHtml(ir.site.lang)}"` : ''}><head>${head}</head><body>`
      const soft = softTargets(ir, route)
      const bounded = Object.keys(soft).length > 0
      for (const ref of plan.views) {
        const dot = ref.indexOf('.')
        const feature = ir.features[ref.slice(0, dot)]
        const view = feature?.views[ref.slice(dot + 1)]
        if (!feature || !view) continue
        if (bounded) buffer += `<!--v:${ref}-->`
        await render(view.root, featureScope(feature, view.machine === feature.id), false)
        if (bounded) buffer += '<!--/v-->'
      }
      if (bounded) payload.soft = soft
      if (payload.islands.length) {
        payload.fns = Object.keys(bindings.fns).length ? assets.fns : null
        payload.routes = routes
        buffer += `<script type="application/json" id="tenon-payload">${scriptJson(payload)}</script>`
        buffer += `<script type="module" src="${escapeHtml(assets.client)}"></script>`
      }
      buffer += '</body></html>'
      flush()
      out.end()
    } catch (error) {
      out.fail(error)
    }
  })()

  return { plan, status, path, chunks: out, tags, redirect }
}

const getterCache = new WeakMap<object, WeakMap<ValueExpr, Getter>>()
const gettersFor = (fns: object) => {
  let g = getterCache.get(fns)
  if (!g) {
    g = new WeakMap()
    getterCache.set(fns, g)
  }
  return g
}

const routeMemo = new WeakMap<ProjectIR, Record<string, string>>()
function routesOf(ir: ProjectIR): Record<string, string> {
  let hit = routeMemo.get(ir)
  if (!hit) {
    hit = routeTable(ir)
    routeMemo.set(ir, hit)
  }
  return hit
}

const widgetMemo = new WeakMap<ProjectIR, Record<string, WidgetIR>>()
function widgetsOf(ir: ProjectIR): Record<string, WidgetIR> {
  let hit = widgetMemo.get(ir)
  if (!hit) {
    hit = {}
    for (const f of Object.values(ir.features))
      for (const [sym, w] of Object.entries(f.widgets ?? {})) hit[`${f.id}.${sym}`] = w
    widgetMemo.set(ir, hit)
  }
  return hit
}

const plans = new WeakMap<ProjectIR, Map<string, RoutePlan>>()
const compiledPlans = new WeakMap<
  RoutePlan,
  { inside: WeakMap<ViewNode, Frag>; outside: WeakMap<ViewNode, Frag> }
>()

function compiledFor(plan: RoutePlan, _islands: Set<string>) {
  let c = compiledPlans.get(plan)
  if (!c) {
    c = { inside: new WeakMap(), outside: new WeakMap() }
    compiledPlans.set(plan, c)
  }
  return c
}
const suspendMemo = new WeakMap<ViewNode, boolean>()
const usesMemo = new WeakMap<ViewNode, Uses>()

function planOf(ir: ProjectIR, route: string): RoutePlan {
  let byRoute = plans.get(ir)
  if (!byRoute) {
    byRoute = new Map()
    plans.set(ir, byRoute)
  }
  let plan = byRoute.get(route)
  if (!plan) {
    plan = planRoute(ir, route).plan
    byRoute.set(route, plan)
  }
  return plan
}

type Uses = Map<number, string[][]>

const valueUses = (v: ValueExpr, out: Uses) =>
  eachRef(v, (r) => {
    if (r.ref !== 'binding') return
    const paths = out.get(r.depth)
    if (paths) paths.push(r.path)
    else out.set(r.depth, [r.path])
  })

function bindingUses(n: ViewNode): Uses {
  const hit = usesMemo.get(n)
  if (hit) return hit
  const out: Uses = new Map()
  const walk = (x: ViewNode) => {
    switch (x.kind) {
      case 'text':
        valueUses(x.value, out)
        return
      case 'if':
        eachGuardRef(x.test, (r) => valueUses(r, out))
        for (const c of [...x.ifTrue, ...x.ifFalse]) walk(c)
        return
      case 'html':
        valueUses(x.value, out)
        return
      case 'global':
        for (const k in x.on) valueUses(x.on[k]!.payload, out)
        return
      case 'widget':
        valueUses(x.props, out)
        for (const m of [x.toggle, x.vars]) for (const k in m) valueUses(m[k]!, out)
        for (const k in x.on) valueUses(x.on[k]!.payload, out)
        for (const c of x.children) walk(c)
        return
      case 'el':
        for (const m of [x.attrs, x.toggle, x.vars]) for (const k in m) valueUses(m[k]!, out)
        for (const k in x.on) valueUses(x.on[k]!.payload, out)
        for (const c of x.children) walk(c)
        return
      case 'when':
        for (const c of x.children) walk(c)
        return
      case 'each':
        valueUses(x.source, out)
        walk(x.item)
        return
      case 'query':
        valueUses(x.input, out)
        walk(x.ready)
        if (x.pending) walk(x.pending)
        for (const k in x.failed) walk(x.failed[k]!)
        return
      default:
        return
    }
  }
  walk(n)
  usesMemo.set(n, out)
  return out
}

type Shape = true | Map<string, Shape>

const shapeOf = (paths: string[][]): Shape => {
  const root = new Map<string, Shape>()
  for (const path of paths) {
    let at: Map<string, Shape> = root
    for (let i = 0; i < path.length; i++) {
      const next = at.get(path[i]!)
      if (next === true) break
      if (i === path.length - 1) at.set(path[i]!, true)
      else if (next) at = next
      else {
        const child = new Map<string, Shape>()
        at.set(path[i]!, child)
        at = child
      }
    }
    if (path.length === 0) return true
  }
  return root
}

const project = (value: Json, shape: Shape): Json => {
  if (shape === true || typeof value !== 'object' || value === null || Array.isArray(value)) return value
  const out: { [k: string]: Json } = {}
  for (const [k, s] of shape) if (k in value) out[k] = project(value[k]!, s)
  return out
}

const shapesMemo = new WeakMap<ViewNode, (Shape | null)[]>()

const pruneScope = (n: ViewNode, bindings: Json[]): Json[] => {
  let shapes = shapesMemo.get(n)
  if (!shapes) {
    const uses = bindingUses(n)
    shapes = bindings.map((_, i) => {
      const paths = uses.get(i)
      return paths ? shapeOf(paths) : null
    })
    shapesMemo.set(n, shapes)
  }
  const out: Json[] = []
  for (let i = 0; i < bindings.length; i++) {
    const shape = shapes[i]
    out.push(shape ? project(bindings[i]!, shape) : null)
  }
  return out
}

interface Channel extends AsyncIterable<string> {
  push(chunk: string): void
  end(): void
  fail(error: unknown): void
}

function channel(): Channel {
  const queue: string[] = []
  let wake: (() => void) | null = null
  let done = false
  let error: unknown = null
  const signal = () => {
    const w = wake
    wake = null
    w?.()
  }
  return {
    push(chunk) {
      queue.push(chunk)
      signal()
    },
    end() {
      done = true
      signal()
    },
    fail(e) {
      error = e ?? new Error('render failed')
      done = true
      signal()
    },
    async *[Symbol.asyncIterator]() {
      for (;;) {
        while (queue.length) yield queue.shift()!
        if (error) throw error
        if (done) return
        await new Promise<void>((r) => {
          wake = r
        })
      }
    },
  }
}

export { pathOf }

const speculationMemo = new WeakMap<ProjectIR, Map<string, string>>()

function speculationRules(ir: ProjectIR, route: string): string {
  let byRoute = speculationMemo.get(ir)
  if (!byRoute) {
    byRoute = new Map()
    speculationMemo.set(ir, byRoute)
  }
  let rules = byRoute.get(route)
  if (rules === undefined) {
    const soft = Object.keys(softTargets(ir, route)).map((r) => ({
      not: { href_matches: { pathname: ir.routes[r]?.path ?? r } },
    }))
    rules = JSON.stringify({
      prerender: [
        {
          where: { and: [{ href_matches: '/*' }, { not: { href_matches: '/_tenon/*' } }, ...soft] },
          eagerness: 'moderate',
        },
      ],
    })
    byRoute.set(route, rules)
  }
  return rules
}

export async function inlineScriptHashes(ir: ProjectIR): Promise<string[]> {
  const rules = new Set(Object.keys(ir.pages).map((route) => speculationRules(ir, route)))
  const digest = async (text: string) =>
    btoa(
      String.fromCharCode(
        ...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))),
      ),
    )
  return Promise.all([...rules].map(async (r) => `sha256-${await digest(r)}`))
}

function headHtml(
  ir: ProjectIR,
  route: string,
  h: HeadIR,
  value: (v: ValueExpr) => Json,
  path: string,
  status: number,
  { styles, preload }: Assets,
): string {
  const str = (v: ValueExpr) => {
    const x = value(v)
    return x === null || x === undefined || x === '' ? null : text(x)
  }
  const title = str(h.title) ?? ir.site?.name ?? path
  const description = str(h.description)
  const image = str(h.image)
  const published = str(h.published)
  const url = ir.site ? `${ir.site.url}${path}` : null
  const meta = (attr: 'name' | 'property', key: string, content: string | null) =>
    content === null ? '' : `<meta ${attr}="${key}" content="${escapeHtml(content)}">`
  const ld: Record<string, Json> =
    h.type === 'article'
      ? { '@context': 'https://schema.org', '@type': 'Article', headline: title }
      : { '@context': 'https://schema.org', '@type': 'WebSite', name: ir.site?.name ?? title }
  if (description) ld.description = description
  if (url) ld.url = url
  if (image) ld.image = image
  if (published && h.type === 'article') ld.datePublished = published
  return [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    ir.site?.themeColor ? `<meta name="theme-color" content="${escapeHtml(ir.site.themeColor)}">` : '',
    ir.site?.icon ? `<link rel="icon" href="${escapeHtml(ir.site.icon)}">` : '',
    ...preload.map(
      (href) => `<link rel="preload" href="${escapeHtml(href)}" as="font" type="font/woff2" crossorigin>`,
    ),
    styles ? `<link rel="stylesheet" href="${escapeHtml(styles)}">` : '',
    `<script type="speculationrules">${speculationRules(ir, route)}</script>`,
    `<title>${escapeHtml(title)}</title>`,
    meta('name', 'description', description),
    h.noindex || status !== 200 ? '<meta name="robots" content="noindex">' : '',
    url && status === 200 ? `<link rel="canonical" href="${escapeHtml(url)}">` : '',
    meta('property', 'og:title', title),
    meta('property', 'og:description', description),
    meta('property', 'og:type', h.type),
    meta('property', 'og:url', url),
    meta('property', 'og:site_name', ir.site?.name ?? null),
    meta('property', 'og:image', image),
    h.type === 'article' ? meta('property', 'article:published_time', published) : '',
    status === 200 ? `<script type="application/ld+json">${scriptJson(ld)}</script>` : '',
  ].join('')
}

export async function renderToString(options: RenderOptions): Promise<{
  html: string
  plan: RoutePlan
  tags: Set<string>
  status: number
  path: string
  redirect: string | null
}> {
  const page = await renderPage(options)
  let html = ''
  for await (const chunk of page.chunks) html += chunk
  return {
    html,
    plan: page.plan,
    tags: page.tags,
    status: page.status,
    path: page.path,
    redirect: page.redirect,
  }
}

export function fnsModule(build: BuildResult): string {
  const entries = Object.entries(build.bindings.fns).map(([ref, impl]) => {
    const source = String(impl)
    const expression = /^(async\s+)?(function\b|\(|[A-Za-z_$][\w$]*\s*=>)/.test(source)
      ? source
      : `function ${source}`
    return `  ${JSON.stringify(ref)}: ${expression},`
  })
  return `export const fns = {\n${entries.join('\n')}\n}\n`
}
