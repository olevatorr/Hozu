import { planRoute, type RoutePlan } from '@tenon/compiler'
import {
  type BuildResult,
  canonicalStringify,
  eachRef,
  type FeatureIR,
  type HeadIR,
  type Json,
  type MachineIR,
  type ProjectIR,
  type TagExprIR,
  type ValueExpr,
  type ViewNode,
} from '@tenon/core/ir'
import type { DataRuntime } from '@tenon/data'
import { type Getter, getIn } from '@tenon/machine'
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
}

export interface Stylesheet {
  href: string
  css: string
}

export interface RenderOptions {
  build: BuildResult
  data: DataRuntime
  route: string
  params?: Json
  session?: unknown
  assets?: Assets
}

export interface RenderedPage {
  plan: RoutePlan
  status: number
  path: string
  chunks: AsyncIterable<string>
  tags: Set<string>
}

export async function renderPage({
  build,
  data,
  route,
  params = null,
  session,
  assets = { client: '/_tenon/client.js', fns: '/_tenon/fns.js', styles: null },
}: RenderOptions): Promise<RenderedPage> {
  const { ir, bindings } = build
  const plan = planOf(ir, route)
  const islandIds = new Set(plan.islands)
  const tags = new Set<string>()
  const payload: PagePayload = { islands: [], data: [], features: {}, nodes: {}, fns: null, params }
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

  const featureScope = (feature: FeatureIR, bound: boolean): Scope => ({
    feature,
    context: bound ? (feature.machine?.initialContext ?? null) : null,
    state: bound ? (feature.machine?.initial ?? null) : null,
    bindings: [],
    params,
  })

  const open = (n: ViewNode, scope: Scope) => {
    const index = payload.islands.length
    const ref: IslandRef = { feature: scope.feature.id, node: n.id, scope: pruneScope(n, scope.bindings) }
    payload.islands.push(ref)
    payload.nodes[n.id] = n
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
        result = n.children.some(suspends)
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

  const runtime: Runtime = { open, embed: (view) => embedded({ kind: 'embed', id: '', view }) }
  const compiled = compiledFor(plan, islandIds)
  const sync = (n: ViewNode, scope: Scope, island: boolean, sep = false): string => {
    const cache = island ? compiled.inside : compiled.outside
    let frag = cache.get(n)
    if (frag === undefined) {
      frag = compileNode(n, island, islandIds, fns, sep)
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
        buffer += element(n, scope)
        for (let i = 0; i < n.children.length; i++)
          await render(n.children[i]!, scope, island, separated(n.children, i))
        buffer += `</${n.tag}>`
        return
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
        if (island) payload.data.push([n.query + canonicalStringify(input), result])
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
  const path = pathOf(ir.routes[route]?.path ?? '/', params)
  const empty: Scope = { feature: { id: '' } as FeatureIR, context: null, state: null, bindings: [], params }
  let status = 200
  let headScope = empty
  if (page.head.query) {
    const input = value(page.head.query.input, empty)
    const result = (await data.run(page.head.query.ref, input, session)) as Result
    const dot = page.head.query.ref.indexOf('.')
    const q = ir.features[page.head.query.ref.slice(0, dot)]?.queries[page.head.query.ref.slice(dot + 1)]
    if (q) for (const t of tagKeys(q.tags, input, empty)) tags.add(t)
    if (!result.ok) status = result.error === 'Unexpected' ? 500 : 404
    headScope = { ...empty, bindings: [result.ok ? result.value : null] }
  }
  const head = headHtml(ir, page.head, (v) => value(v, headScope), path, status, assets.styles)

  void (async () => {
    try {
      buffer += `<!doctype html><html${ir.site ? ` lang="${escapeHtml(ir.site.lang)}"` : ''}><head>${head}</head><body>`
      for (const ref of plan.views) {
        const dot = ref.indexOf('.')
        const feature = ir.features[ref.slice(0, dot)]
        const view = feature?.views[ref.slice(dot + 1)]
        if (feature && view)
          await render(view.root, featureScope(feature, view.machine === feature.id), false)
      }
      if (payload.islands.length) {
        payload.fns = Object.keys(bindings.fns).length ? assets.fns : null
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

  return { plan, status, path, chunks: out, tags }
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

export function pathOf(pattern: string, params: Json): string {
  return pattern.replace(/:([A-Za-z][A-Za-z0-9_]*)/g, (_, key: string) =>
    encodeURIComponent(text(getIn(params, [key]))),
  )
}

function headHtml(
  ir: ProjectIR,
  h: HeadIR,
  value: (v: ValueExpr) => Json,
  path: string,
  status: number,
  styles: string | null,
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
    styles ? `<link rel="stylesheet" href="${escapeHtml(styles)}">` : '',
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

export async function renderToString(
  options: RenderOptions,
): Promise<{ html: string; plan: RoutePlan; tags: Set<string>; status: number; path: string }> {
  const page = await renderPage(options)
  let html = ''
  for await (const chunk of page.chunks) html += chunk
  return { html, plan: page.plan, tags: page.tags, status: page.status, path: page.path }
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
