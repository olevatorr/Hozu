import { planRoute, type RoutePlan } from '@tenon/compiler'
import {
  type BuildResult,
  canonicalStringify,
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
import { getIn } from '@tenon/machine'
import type { IslandRef, PagePayload, Result } from '@tenon/runtime-client'
import { escapeHtml, scriptJson } from './escape.ts'

export interface Assets {
  client: string
  fns: string | null
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

const voids = new Set(['img'])

const text = (v: Json) =>
  v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)

interface Scope {
  feature: FeatureIR
  context: Json
  state: string | null
  bindings: Json[]
}

export async function renderPage({
  build,
  data,
  route,
  params = null,
  session,
  assets = { client: '/_tenon/client.js', fns: '/_tenon/fns.js' },
}: RenderOptions): Promise<RenderedPage> {
  const { ir, bindings } = build
  const plan = planOf(ir, route)
  const islandIds = new Set(plan.islands)
  const tags = new Set<string>()
  const payload: PagePayload = { islands: [], data: [], features: {}, nodes: {}, fns: null, params }
  const fns = bindings.fns as Record<string, (x: Json) => Json>

  const value = (v: ValueExpr, scope: Scope, input?: Json): Json => {
    if ('literal' in v) return v.literal
    if ('object' in v) {
      const out: Record<string, Json> = {}
      for (const k in v.object) out[k] = value(v.object[k]!, scope, input)
      return out
    }
    if ('fn' in v) return fns[v.fn]!(value(v.arg, scope, input))
    if (v.ref === 'binding') return getIn(scope.bindings[v.depth], v.path)
    if (v.ref === 'context') return getIn(scope.context, v.path)
    if (v.ref === 'params') return getIn(params, v.path)
    return v.ref === 'input' ? getIn(input ?? null, v.path) : null
  }

  const tagKeys = (list: TagExprIR[], input: Json, scope: Scope) =>
    list.map((t) => (t.param ? `${t.tag}(${canonicalStringify(value(t.param, scope, input))})` : t.tag))

  const featureScope = (feature: FeatureIR, bound: boolean): Scope => ({
    feature,
    context: bound ? (feature.machine?.initialContext ?? null) : null,
    state: bound ? (feature.machine?.initial ?? null) : null,
    bindings: [],
  })

  const open = (n: ViewNode, scope: Scope) => {
    const index = payload.islands.length
    const ref: IslandRef = { feature: scope.feature.id, node: n.id, scope: pruneScope(n, scope.bindings) }
    payload.islands.push(ref)
    payload.nodes[n.id] = n
    payload.features[scope.feature.id] ??= (scope.feature.machine as MachineIR | null) ?? null
    return `<t-i data-i="${index}" style="display:contents">`
  }

  const element = (n: Extract<ViewNode, { kind: 'el' }>, scope: Scope) => {
    let attrs = ` data-t="${escapeHtml(n.id)}"${n.class ? ` class="${escapeHtml(n.class)}"` : ''}`
    for (const name in n.attrs) {
      const x = value(n.attrs[name]!, scope)
      if (x === null || x === false) continue
      attrs += x === true ? ` ${name}` : ` ${name}="${escapeHtml(text(x))}"`
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

  const sync = (n: ViewNode, scope: Scope, island: boolean): string => {
    if (!island && islandIds.has(n.id)) return `${open(n, scope)}${sync(n, scope, true)}</t-i>`
    switch (n.kind) {
      case 'text':
        return escapeHtml(text(value(n.value, scope)))
      case 'el': {
        let html = element(n, scope)
        if (voids.has(n.tag)) return html
        for (const c of n.children) html += sync(c, scope, island)
        return `${html}</${n.tag}>`
      }
      case 'when': {
        let html = `<!--${n.id}-->`
        if (scope.state !== null && n.states.includes(scope.state))
          for (const c of n.children) html += sync(c, scope, island)
        return `${html}<!--/${n.id}-->`
      }
      case 'each': {
        let html = `<!--${n.id}-->`
        const items = value(n.source, scope)
        if (Array.isArray(items))
          for (const item of items)
            html += sync(n.item, { ...scope, bindings: [...scope.bindings, item] }, island)
        return `${html}<!--/${n.id}-->`
      }
      case 'embed': {
        const e = embedded(n)
        return e ? sync(e.root, e.scope, island) : ''
      }
      default:
        return ''
    }
  }

  let buffer = ''
  const out = channel()
  const flush = () => {
    if (buffer) out.push(buffer)
    buffer = ''
  }

  const render = async (n: ViewNode, scope: Scope, island: boolean): Promise<void> => {
    if (!suspends(n)) {
      buffer += sync(n, scope, island)
      return
    }
    if (!island && islandIds.has(n.id)) {
      buffer += open(n, scope)
      await render(n, scope, true)
      buffer += '</t-i>'
      return
    }
    switch (n.kind) {
      case 'el':
        buffer += element(n, scope)
        for (const c of n.children) await render(c, scope, island)
        buffer += `</${n.tag}>`
        return
      case 'when':
        buffer += `<!--${n.id}-->`
        if (scope.state !== null && n.states.includes(scope.state))
          for (const c of n.children) await render(c, scope, island)
        buffer += `<!--/${n.id}-->`
        return
      case 'each': {
        buffer += `<!--${n.id}-->`
        const items = value(n.source, scope)
        if (Array.isArray(items))
          for (const item of items)
            await render(n.item, { ...scope, bindings: [...scope.bindings, item] }, island)
        buffer += `<!--/${n.id}-->`
        return
      }
      case 'embed': {
        const e = embedded(n)
        if (e) await render(e.root, e.scope, island)
        return
      }
      case 'query': {
        buffer += `<!--${n.id}-->`
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
        buffer += `<!--/${n.id}-->`
        return
      }
      default:
        buffer += sync(n, scope, island)
    }
  }

  const page = ir.pages[route]!
  const path = pathOf(ir.routes[route]?.path ?? '/', params)
  const empty: Scope = { feature: { id: '' } as FeatureIR, context: null, state: null, bindings: [] }
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
  const head = headHtml(ir, page.head, (v) => value(v, headScope), path, status)

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

const plans = new WeakMap<ProjectIR, Map<string, RoutePlan>>()
const suspendMemo = new WeakMap<ViewNode, boolean>()
const depthMemo = new WeakMap<ViewNode, Set<number>>()

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

const valueDepths = (v: ValueExpr, out: Set<number>) => {
  if ('ref' in v) {
    if (v.ref === 'binding') out.add(v.depth)
  } else if ('object' in v) for (const k in v.object) valueDepths(v.object[k]!, out)
  else if ('fn' in v) valueDepths(v.arg, out)
}

function bindingDepths(n: ViewNode): Set<number> {
  const hit = depthMemo.get(n)
  if (hit) return hit
  const out = new Set<number>()
  const walk = (x: ViewNode) => {
    switch (x.kind) {
      case 'text':
        valueDepths(x.value, out)
        return
      case 'el':
        for (const k in x.attrs) valueDepths(x.attrs[k]!, out)
        for (const k in x.on) valueDepths(x.on[k]!.payload, out)
        for (const c of x.children) walk(c)
        return
      case 'when':
        for (const c of x.children) walk(c)
        return
      case 'each':
        valueDepths(x.source, out)
        walk(x.item)
        return
      case 'query':
        valueDepths(x.input, out)
        walk(x.ready)
        if (x.pending) walk(x.pending)
        for (const k in x.failed) walk(x.failed[k]!)
        return
      default:
        return
    }
  }
  walk(n)
  depthMemo.set(n, out)
  return out
}

const pruneScope = (n: ViewNode, bindings: Json[]): Json[] => {
  const used = bindingDepths(n)
  return bindings.map((b, i) => (used.has(i) ? b : null))
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
