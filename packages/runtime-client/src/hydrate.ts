import type { FeatureIR, Json, MachineIR, ViewNode } from '@hozu/core/ir'
import { compileMachine, type Snapshot } from '@hozu/machine'
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
  fns: string | null
  params: Json
  search: Json
  snapshots?: Record<string, Snapshot>
  devState?: { query: string; branch: string } | { feature: string; state: string }
  components: Record<string, ComponentRef>
  routes: Record<string, string>
  live: Record<string, LiveQuery>
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
  }: HydrateOptions = {},
): Promise<Map<string, App>> {
  const apps = new Map<string, App>()
  const script = doc.getElementById('hozu-payload')
  if (!script?.textContent) return apps
  const payload = JSON.parse(script.textContent) as PagePayload
  const shared: Store = { data: new Map(payload.data), versions: new Map() }
  const fns: Record<string, never> = payload.fns ? await loadFns(payload.fns) : {}
  const { components, routes } = payload
  const motion = payload.motion ? await import('./motion.ts') : undefined
  const mountComponent = Object.keys(components).length
    ? (await import('./component.ts')).mountComponent
    : undefined
  if (payload.visible) void import('./visible.ts').then((m) => m.watch(doc))
  const inflight = new Map<string, Promise<Result>>()
  const onQuery = (q: string, input: Json) => {
    if (globalThis.__HOZU_DEV__) {
      const held = payload.devState
      if (held && 'query' in held && held.query === q) return new Promise<Result>(() => {})
    }
    const key = q + JSON.stringify(input)
    let pending = inflight.get(key)
    if (!pending) {
      pending = query(q, input).finally(() => inflight.delete(key))
      inflight.set(key, pending)
    }
    return pending
  }
  const liveKeys = Object.entries(payload.live ?? {})
  const onTags = async (tags: string[]) => {
    if (busy) return void queued.push(...tags)
    const stale = liveKeys.filter(([, l]) => l.tags.some((t) => tags.includes(t)))
    for (const [key, l] of stale) shared.data.set(key, await query(l.query, l.input))
    if (stale.length) for (const app of apps.values()) app.sync()
  }
  let busy = 0
  let queued: string[] = []
  const onInvoke = async (effect: string, input: Json) => {
    busy++
    const { result, refreshed, session } = await transport(effect, input, [...shared.data.keys()]).finally(
      () => busy--,
    )
    if (session) {
      shared.data.clear()
      queued = []
    }
    for (const [key, value] of refreshed) {
      shared.data.set(key, value)
      shared.versions.set(key, (shared.versions.get(key) ?? 0) + 1)
    }
    if (refreshed.length || session) for (const app of apps.values()) app.sync()
    if (!busy && queued.length) onTags(queued.splice(0))
    return result
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
        ...(snapshot ? { snapshot } : {}),
        fns,
        components,
        routes,
        motion,
        mountComponent,
        loadComponent,
        onQuery,
        onInvoke,
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
  for (const app of apps.values()) app.sync()
  for (const app of apps.values()) app.start()
  if (liveKeys.length)
    (live ?? (await import('./live.ts')).liveStream(doc))(
      onTags,
      liveKeys.flatMap(([, l]) => l.tags),
    )
  if (globalThis.__HOZU_DEV__ && dev) (await import('./dev.ts')).expose(doc, apps, dev.machines)
  doc.documentElement.setAttribute('data-hozu-ready', '')
  return apps
}
