import { planRoute, type RoutePlan } from '@hozu/compiler'
import {
  type BuildResult,
  canonicalStringify,
  type FeatureIR,
  type HeadIR,
  type Json,
  localeOf,
  type MachineIR,
  type ProjectIR,
  routeTable,
  type TagExprIR,
  type ValueExpr,
  type ViewNode,
  type WidgetIR,
  widgetsIn,
} from '@hozu/core/ir'
import type { DataRuntime, RequestData } from '@hozu/data'
import { compileGuard, compileValue, type Getter, pathOf, type Snapshot } from '@hozu/machine'
import type { PagePayload, Result } from '@hozu/runtime-client'
import { attrText, text } from '@hozu/runtime-client'
import { escapeHtml, scriptJson, scriptSafe } from './escape.ts'
import { CLOSE, OPEN, renderKey, separated } from './generate.ts'
import { responsive, type Variants } from './images.ts'
import { type Lowering, localeFns, lowerCached, usesI18n } from './lower.ts'
import {
  classAndStyle,
  nodesById,
  type RenderRuntime,
  type RenderTable,
  renderTableFor,
  type Scope,
} from './rendered.ts'
import { seededContext } from './seed.ts'
import { pruneScope } from './shape.ts'

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
  scope?: RequestData
  route: string
  params?: Json
  search?: Json
  snapshots?: Record<string, Snapshot>
  session?: unknown
  assets?: Assets
  locale?: string | null
  images?: Variants | null
  env?: Json
  render?: RenderTable
}

export interface RenderedPage {
  plan: RoutePlan
  status: number
  path: string
  chunks: AsyncIterable<string>
  tags: Set<string>
  redirect: string | null
}

const NO_ENV: Json = {}

export async function renderPage({
  build,
  data: dataRuntime,
  scope: given,
  route,
  params = null,
  search = null,
  snapshots = {},
  session,
  assets = { client: '/_hozu/client.js', fns: '/_hozu/fns.js', styles: null, preload: [], widgets: {} },
  locale: requested = null,
  images = null,
  env = NO_ENV,
  render: generated,
}: RenderOptions): Promise<RenderedPage> {
  const prepare = (root: ViewNode) => (images ? responsive(root, images) : root)
  const data = given ?? dataRuntime.scope(session)
  const { ir, bindings } = build
  const locale = localeOf(ir, requested)
  const lang = locale ?? ir.site?.lang ?? 'en'
  const i18n = usesI18n(ir)
  const plan = planOf(ir, route)
  const islandIds = new Set(plan.islands)
  const tags = new Set<string>()
  const nodeIndex = new Map<string, number>()
  const payload: PagePayload = {
    ids: [],
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
  const fns = i18n ? fnsFor(build, lang) : (bindings.fns as Record<string, (x: Json) => Json>)
  const getters = gettersFor(fns)

  const value = (v: ValueExpr, scope: Scope, input?: Json): Json => {
    let get = getters.get(v)
    if (!get) {
      get = compileValue(v, fns)
      getters.set(v, get)
    }
    return get(input === undefined ? scope : { ...scope, input })
  }

  const tagKeys = (list: TagExprIR[], input: Json, scope: Scope) =>
    list.map((t) => (t.param ? `${t.tag}(${canonicalStringify(value(t.param, scope, input))})` : t.tag))

  const routes = routesOf(ir, locale)
  const url = pathOf(routes[route] ?? '/', params, search)
  const alternate: Record<string, string> = Object.fromEntries(
    (ir.site?.locales ?? []).map((l) => [l, pathOf(routesOf(ir, l)[route] ?? '/', params, search)]),
  )
  const lowering: Lowering = {
    locale: lang,
    alternate,
    env,
    message: (ref) => {
      const dot = ref.indexOf('.')
      const m = ir.features[ref.slice(0, dot)]?.messages
      const key = ref.slice(dot + 1)
      return m?.text[lang]?.[key] ?? m?.text[m.base]?.[key] ?? ''
    },
  }
  const seeds = new Map<string, Json | null>()
  const seedOf = (feature: FeatureIR) => {
    if (!seeds.has(feature.id))
      seeds.set(feature.id, seededContext(ir, route, feature, fns as never, params, search))
    return seeds.get(feature.id)!
  }
  const featureScope = (feature: FeatureIR, bound: boolean): Scope => {
    const snap = bound ? snapshots[feature.id] : undefined
    if (snap) payload.snapshots = { ...payload.snapshots, [feature.id]: snap }
    return {
      feature,
      context: bound ? (snap?.context ?? seedOf(feature) ?? feature.machine?.initialContext ?? null) : null,
      state: bound ? (snap?.state ?? feature.machine?.initial ?? null) : null,
      bindings: [],
      params,
      search,
      routes,
      url,
      locale: lang,
      alternate,
      env,
    }
  }

  const open = (n: ViewNode, scope: Scope) => island(n, scope, pruneScope(n, scope.bindings))

  const island = (n: ViewNode, scope: Scope, scoped: Json[]) => {
    let index = nodeIndex.get(n.id)
    if (index === undefined) {
      index = payload.ids.push(n.id) - 1
      nodeIndex.set(n.id, index)
      const node = i18n ? lowerCached(n, lowering) : n
      payload.nodes[n.id] = node.kind === 'widget' ? { ...node, children: [] } : node
      for (const ref of widgetsIn(n, ir)) runtime.widget(ref)
      const { motion, visible } = loadsOf(node)
      if (motion) payload.motion = true
      if (visible) payload.visible = true
    }
    let lead = 0
    while (lead < scoped.length && scoped[lead] === null) lead++
    const tail = scoped.slice(lead)
    const last = payload.islands.at(-1)
    if (last && last[0] === index && last[1] === lead) last.push(tail)
    else payload.islands.push([index, lead, tail])
    if (!(scope.feature.id in payload.features)) {
      const machine = (scope.feature.machine as MachineIR | null) ?? null
      const seeded = machine ? seedOf(scope.feature) : null
      payload.features[scope.feature.id] = seeded ? { ...machine!, initialContext: seeded } : machine
    }
    if (preloaded) return '<!--i-->'
    preloaded = true
    return `${scripts.map((href) => `<link rel="modulepreload" href="${escapeHtml(href)}">`).join('')}<!--i-->`
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
    return owner && view
      ? { root: prepare(view.root), scope: featureScope(owner, view.machine === owner.id) }
      : null
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

  const runtime: Pick<RenderRuntime, 'embed' | 'widget'> = {
    embed: (view) => embedded({ kind: 'embed', id: '', view }),
    widget: (ref) => {
      const w = widgets[ref]
      const url = assets.widgets[ref]
      if (w && url) payload.widgets[ref] ??= { url, tag: w.tag, load: w.load, wraps: w.wraps }
    },
  }
  const table = generated ?? (await renderTableFor(build, images))
  const byId = nodesById(build, images)
  const generatedRuntime: RenderRuntime = {
    island: (id, scope, scoped) => island(byId.get(id)!, scope, scoped),
    embed: runtime.embed,
    widget: runtime.widget,
  }
  const sync = (n: ViewNode, scope: Scope, island: boolean, sep = false): string => {
    const key = renderKey(route, n.id, island, sep)
    const fn = table[key]
    if (!fn) throw new Error(`No generated render function for ${key}`)
    return fn(scope, generatedRuntime, fns)
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
        const pending = data.run(n.query, input)
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
    locale: lang,
    alternate,
    env,
  }
  let status = 200
  let redirect: string | null = null
  let headScope = empty
  if (page.head.query) {
    const input = value(page.head.query.input, empty)
    const result = (await data.run(page.head.query.ref, input)) as Result
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
  const hasFns = Object.keys(bindings.fns).length > 0
  const scripts = plan.islands.length ? [assets.client, ...(hasFns && assets.fns ? [assets.fns] : [])] : []
  let preloaded = plan.js !== 'conditional'
  const head = headHtml(
    ir,
    page.head,
    (v) => value(v, headScope),
    path,
    status,
    assets,
    plan.js === 'always' ? scripts : [],
    lang,
    alternate,
  )

  void (async () => {
    try {
      buffer += `<!doctype html><html${ir.site ? ` lang="${escapeHtml(lang)}"` : ''}><head>${head}</head><body>`
      for (const ref of plan.views) {
        const dot = ref.indexOf('.')
        const feature = ir.features[ref.slice(0, dot)]
        const view = feature?.views[ref.slice(dot + 1)]
        if (!feature || !view) continue
        await render(prepare(view.root), featureScope(feature, view.machine === feature.id), false)
      }
      if (payload.islands.length) {
        payload.fns = hasFns ? assets.fns : null
        payload.routes = routes
        buffer += `<script type="application/json" id="hozu-payload">${payloadJson(payload)}</script>`
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

const routeMemo = new WeakMap<ProjectIR, Map<string | null, Record<string, string>>>()
function routesOf(ir: ProjectIR, locale: string | null): Record<string, string> {
  let byLocale = routeMemo.get(ir)
  if (!byLocale) {
    byLocale = new Map()
    routeMemo.set(ir, byLocale)
  }
  let hit = byLocale.get(locale)
  if (!hit) {
    hit = routeTable(ir, locale)
    byLocale.set(locale, hit)
  }
  return hit
}

const fnsMemo = new WeakMap<BuildResult, Map<string, Record<string, (x: Json) => Json>>>()
function fnsFor(build: BuildResult, locale: string) {
  let byLocale = fnsMemo.get(build)
  if (!byLocale) {
    byLocale = new Map()
    fnsMemo.set(build, byLocale)
  }
  let hit = byLocale.get(locale)
  if (!hit) {
    hit = localeFns(build.ir, build.bindings.fns as Record<string, (x: Json) => Json>, locale)
    byLocale.set(locale, hit)
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
const suspendMemo = new WeakMap<ViewNode, boolean>()
const loadsMemo = new WeakMap<ViewNode, { motion: boolean; visible: boolean }>()

function loadsOf(n: ViewNode) {
  let hit = loadsMemo.get(n)
  if (!hit) {
    const json = JSON.stringify(n)
    hit = { motion: json.includes('"motion":"'), visible: json.includes('"visible":') }
    loadsMemo.set(n, hit)
  }
  return hit
}

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

const jsonMemo = new WeakMap<object, string>()

const cachedJson = (v: unknown): string => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  let hit = jsonMemo.get(v)
  if (hit === undefined) {
    hit = JSON.stringify(v)
    jsonMemo.set(v, hit)
  }
  return hit
}

const recordJson = (r: Record<string, unknown>) =>
  `{${Object.entries(r)
    .map(([k, v]) => `${JSON.stringify(k)}:${cachedJson(v)}`)
    .join(',')}}`

function payloadJson(payload: PagePayload): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(payload)) {
    if (v === undefined) continue
    const json =
      k === 'nodes' || k === 'features' ? recordJson(v as Record<string, unknown>) : JSON.stringify(v)
    parts.push(`${JSON.stringify(k)}:${json}`)
  }
  return scriptSafe(`{${parts.join(',')}}`)
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

const speculationRules = JSON.stringify({
  prerender: [
    {
      where: { and: [{ href_matches: '/*' }, { not: { href_matches: '/_hozu/*' } }] },
      eagerness: 'moderate',
    },
  ],
})

export async function inlineScriptHashes(): Promise<string[]> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(speculationRules))
  return [`sha256-${btoa(String.fromCharCode(...new Uint8Array(digest)))}`]
}

function headHtml(
  ir: ProjectIR,
  h: HeadIR,
  value: (v: ValueExpr) => Json,
  path: string,
  status: number,
  { styles, preload }: Assets,
  scripts: string[],
  lang: string,
  alternate: Record<string, string>,
): string {
  const str = (v: ValueExpr) => {
    const x = value(v)
    return x === null || x === undefined || x === '' ? null : text(x)
  }
  const title = str(h.title) ?? ir.site?.name ?? path
  const description = str(h.description)
  const raw = str(h.image)
  const local = raw?.startsWith('/_hozu/og.png') ? ir.http.basePath + raw : raw
  const image = local?.startsWith('/') && ir.site ? ir.site.url + local : local
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
    ...scripts.map((href) => `<link rel="modulepreload" href="${escapeHtml(href)}">`),
    ir.site?.themeColor ? `<meta name="theme-color" content="${escapeHtml(ir.site.themeColor)}">` : '',
    `<link rel="icon" href="${escapeHtml(ir.site?.icon ?? 'data:,')}">`,
    ir.site ? `<link rel="manifest" href="${escapeHtml(ir.http.basePath)}/manifest.webmanifest">` : '',
    ir.site?.offline
      ? `<script type="module" src="${escapeHtml(ir.http.basePath)}/_hozu/sw-register.js"></script>`
      : '',
    ...preload.map(
      (href) => `<link rel="preload" href="${escapeHtml(href)}" as="font" type="font/woff2" crossorigin>`,
    ),
    styles ? `<link rel="stylesheet" href="${escapeHtml(styles)}">` : '',
    `<script type="speculationrules">${speculationRules}</script>`,
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
    ir.site?.locales ? meta('property', 'og:locale', lang.replace('-', '_')) : '',
    ...(ir.site?.locales ?? [])
      .filter((l) => l !== lang)
      .map((l) => meta('property', 'og:locale:alternate', l.replace('-', '_'))),
    ...(ir.site?.locales && status === 200
      ? [
          ...Object.entries(alternate).map(
            ([l, p]) =>
              `<link rel="alternate" hreflang="${escapeHtml(l)}" href="${escapeHtml(ir.site!.url + p)}">`,
          ),
          `<link rel="alternate" hreflang="x-default" href="${escapeHtml(ir.site.url + (alternate[ir.site.lang] ?? ''))}">`,
        ]
      : []),
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
    const helpers = Object.entries(build.bindings.fnHelpers[ref] ?? {})
    if (!helpers.length) return `  ${JSON.stringify(ref)}: ${expression},`
    const locals = helpers.map(([name, src]) => `const ${name} = ${src};`).join(' ')
    return `  ${JSON.stringify(ref)}: (() => { ${locals} return ${expression} })(),`
  })
  return `export const fns = {\n${entries.join('\n')}\n}\n`
}
