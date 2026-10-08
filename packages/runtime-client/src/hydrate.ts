import { canonicalStringify } from '@hozu/core/canonical'
import type { FeatureIR, Json, JsonSchema, MachineIR, TagExprIR, ViewNode } from '@hozu/core/ir'
import { compileMachine, compileValue, type Snapshot } from '@hozu/machine'
import { uploads } from './dom.ts'
import {
  type App,
  type ComponentRef,
  type ComponentSetup,
  createApp,
  type Result,
  type Store,
} from './mount.ts'

declare global {
  var __HOZU_DEV__: boolean | undefined
}

export interface IslandRef {
  feature: string
  node: string
  scope: Json[]
}

export interface PagePayload {
  ids: string[]
  islands: [node: number, lead: number, ...tails: Json[][]][]
  motion?: true
  visible?: true
  data: [string, Result][]
  features: Record<string, MachineIR | null>
  nodes: Record<string, ViewNode>
  /** The page's `fn` modules (ADR 0050 C). */
  fns: string[] | null
  params: Json
  search: Json
  snapshots?: Record<string, Snapshot>
  devState?: { query: string; branch: string } | { feature: string; state: string; context?: Json }
  components: Record<string, ComponentRef>
  routes: Record<string, string>
  live: Record<string, LiveQuery>
  /** A mark of the visitor's session: a kept snapshot comes back only to the same one (ADR 0067 C4). */
  who?: string | null
  /** The context fields the address sets, per feature: they win over a kept snapshot. */
  seeds?: Record<string, string[]>
  /** Features this page shows through a view another page shows too: their state follows to other pages (ADR 0069 B1). */
  keep?: string[]
  /** The canonical address shown and its home route's address (ADR 0069 B4). */
  here?: [string, string]
  /** Queries this page reads again on a timer, in seconds (ADR 0063 C1). */
  poll?: Record<string, number>
  /** Effects this page can call that run in the browser (ADR 0049). */
  effects?: Record<string, ClientEffect>
  /** The bundled fetch module of each feature with such effects. */
  fetches?: Record<string, string>
  /** The parsed public environment, for those effects' `env`. */
  env?: Json
}

export interface ClientEffect {
  kind: 'query' | 'mutation'
  runs: 'browser' | 'either'
  input: JsonSchema
  output: JsonSchema
  errors: Record<string, JsonSchema>
  /** A query's tags, or a mutation's invalidates. */
  tags: TagExprIR[]
}

export interface LiveQuery {
  query: string
  input: Json
  tags: string[]
}

export interface EffectResponse {
  result: Result
  refreshed: [string, Result][]
  session?: true
  /** The tags a server mutation invalidated, so browser-run queries re-read too (ADR 0049). */
  tags?: string[]
}

export type Transport = (effect: string, input: Json, keys: string[]) => Promise<EffectResponse>

const islandsOf = (payload: PagePayload): IslandRef[] =>
  payload.islands.flatMap(([n, lead, ...tails]) => {
    const node = payload.ids[n]!
    const feature = node.slice(0, node.indexOf('.'))
    return tails.map((tail) => ({ feature, node, scope: [...Array<Json>(lead).fill(null), ...tail] }))
  })

const endpoint = (name: string) => new URL(name, import.meta.url)

export const fetchTransport: Transport = async (effect, input, keys) => {
  const json = JSON.stringify({ effect, input, keys })
  const body = uploads.size ? await (await import('./uploads.ts')).encode(json, input, uploads) : json
  const response = await fetch(endpoint('effect'), {
    method: 'POST',
    headers: typeof body === 'string' ? { 'content-type': 'application/json' } : {},
    body,
  })
  return (await response.json()) as EffectResponse
}

export type QueryTransport = (query: string, input: Json) => Promise<Result>

export const fetchQuery: QueryTransport = async (query, input) => {
  const response = await fetch(endpoint('query'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, input }),
  })
  return (await response.json()) as Result
}

export interface HydrateOptions {
  transport?: Transport
  query?: QueryTransport
  live?: (onTags: (tags: string[]) => void, tags: string[]) => void
  loadFns?: (url: string) => Promise<Record<string, never>>
  loadComponent?: (url: string) => Promise<ComponentSetup>
  /** Loads a feature's fetch bundle (ADR 0049); by default `import(url)`. */
  loadFetch?: (url: string) => Promise<Record<string, unknown>>
}

const importComponent = async (url: string) =>
  ((await import(/* @vite-ignore */ url)) as { default: ComponentSetup }).default

const importFns = async (url: string) =>
  ((await import(/* @vite-ignore */ url)) as { fns: Record<string, never> }).fns

export async function hydrate(
  doc: Document,
  {
    transport = fetchTransport,
    query = fetchQuery,
    live,
    loadFns = importFns,
    loadComponent = importComponent,
    loadFetch,
  }: HydrateOptions = {},
): Promise<Map<string, App>> {
  const apps = new Map<string, App>()
  const script = doc.getElementById('hozu-payload')
  if (!script?.textContent) return apps
  const payload = JSON.parse(script.textContent) as PagePayload
  const keeping = Object.keys(payload.features).length ? import('./keep.ts') : null
  const shared: Store = { data: new Map(payload.data), versions: new Map() }
  const registered = (globalThis as { __hozuFns?: Record<string, Record<string, never>> }).__hozuFns ?? {}
  const own = (url: string) => registered[new URL(url, doc.baseURI).href]
  const fns: Record<string, never> = payload.fns
    ? Object.assign(
        {},
        ...(payload.fns.every(own)
          ? payload.fns.map(own)
          : await Promise.all(payload.fns.map((url) => own(url) ?? loadFns(url)))),
      )
    : {}
  const { components, routes } = payload
  const motion = payload.motion ? await import('./motion.ts') : undefined
  const component = Object.keys(components).length
    ? (await import('./component.ts')).renderComponent
    : undefined
  if (payload.visible) void import('./visible.ts').then((m) => m.watch(doc))
  const local = payload.effects
    ? (await import('./fetch.ts')).createRunner(
        payload,
        fns,
        shared,
        { stringify: canonicalStringify, compile: compileValue as never },
        loadFetch,
      )
    : null
  const inflight = new Map<string, Promise<Result>>()
  const onQuery = (q: string, input: Json) => {
    if (globalThis.__HOZU_DEV__) {
      const held = payload.devState
      if (held && 'query' in held && held.query === q) return new Promise<Result>(() => {})
    }
    const key = q + JSON.stringify(input)
    let pending = inflight.get(key)
    if (!pending) {
      pending = (local?.runs(q) ? local.run(q, input) : query(q, input)).finally(() => inflight.delete(key))
      inflight.set(key, pending)
    }
    return pending
  }
  const syncAll = () => {
    for (const app of apps.values()) app.sync()
  }
  const liveKeys = Object.entries(payload.live ?? {})
  const onTags = async (tags: string[]) => {
    if (busy) return void queued.push(...tags)
    const stale = liveKeys.filter(([, l]) => l.tags.some((t) => tags.includes(t)))
    for (const [key, l] of stale) shared.data.set(key, await query(l.query, l.input))
    if (stale.length) syncAll()
  }
  let busy = 0
  let queued: string[] = []
  const invoke = async (effect: string, input: Json): Promise<{ result: Result; tags: string[] }> => {
    if (local?.runs(effect)) {
      busy++
      const { result, changed, tags } = await local.mutate(effect, input).finally(() => busy--)
      if (changed) syncAll()
      return { result, tags }
    }
    busy++
    const { result, refreshed, session, tags } = await transport(effect, input, [
      ...shared.data.keys(),
    ]).finally(() => busy--)
    if (tags && local && (await local.reread(tags))) syncAll()
    if (session) {
      shared.data.clear()
      queued = []
    }
    for (const [key, value] of refreshed) {
      shared.data.set(key, value)
      shared.versions.set(key, (shared.versions.get(key) ?? 0) + 1)
    }
    if (refreshed.length || session) syncAll()
    if (!busy && queued.length) onTags(queued.splice(0))
    return { result, tags: tags ?? [] }
  }
  const onInvoke = async (effect: string, input: Json) => (await invoke(effect, input)).result
  const onRefresh = async (tags: string[]) => {
    if (local && (await local.reread(tags))) syncAll()
    if ([...shared.data.keys()].some((k) => !local?.owns(k))) await invoke('%refresh', tags).catch(() => null)
  }
  const dev = globalThis.__HOZU_DEV__
    ? { restore: (await import('./dev.ts')).restore(doc), machines: new Map<string, MachineIR | null>() }
    : null
  for (const [id, machine] of Object.entries(payload.features)) {
    const snapshot = (globalThis.__HOZU_DEV__ && dev?.restore(id, machine)) || payload.snapshots?.[id]
    if (globalThis.__HOZU_DEV__) dev?.machines.set(id, machine)
    apps.set(
      id,
      createApp(doc, {
        machine: machine ? compileMachine({ id, machine } as FeatureIR, fns, routes) : null,
        payload: shared,
        params: payload.params,
        search: payload.search,
        ...(payload.here ? { here: payload.here } : {}),
        ...(snapshot ? { snapshot } : {}),
        fns,
        components,
        routes,
        motion,
        component,
        loadComponent,
        onQuery,
        onInvoke,
        onRefresh,
        ...(local ? { readsInBrowser: (q: string) => local.runs(q) } : {}),
        onNavigate: (url) => doc.defaultView?.location.assign(url),
      }),
    )
  }
  const markers: Comment[] = []
  const walker = doc.createTreeWalker(doc.body ?? doc, 128)
  while (walker.nextNode())
    if ((walker.currentNode as Comment).data === 'i') markers.push(walker.currentNode as Comment)
  islandsOf(payload).forEach((island, i) => {
    const at = markers[i]
    const node = payload.nodes[island.node]
    if (at?.parentNode && node)
      apps.get(island.feature)?.attach(at.parentNode, at.nextSibling, node, island.scope, true)
  })
  syncAll()
  for (const app of apps.values()) app.start()
  void keeping?.then(({ kept }) => {
    const resume = kept(doc, payload, apps)
    if ((doc as { prerendering?: boolean }).prerendering)
      doc.addEventListener('prerenderingchange', resume, { once: true })
    else resume()
  })
  if (liveKeys.length)
    (live ?? (await import('./live.ts')).liveStream(doc))(
      onTags,
      liveKeys.flatMap(([, l]) => l.tags),
    )
  if (payload.poll) (await import('./poll.ts')).poll(doc, payload.poll, shared, onQuery, () => busy, syncAll)
  if (globalThis.__HOZU_DEV__ && dev)
    (await import('./dev.ts')).expose(doc, apps, dev.machines, { invoke, query: onQuery })
  doc.documentElement.setAttribute('data-hozu-ready', '')
  return apps
}
