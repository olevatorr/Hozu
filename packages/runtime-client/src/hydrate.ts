import type { FeatureIR, Json, MachineIR, ViewNode } from '@tenon/core/ir'
import { compileMachine, type Snapshot } from '@tenon/machine'
import { uploads } from './dom.ts'
import {
  type App,
  createApp,
  type Motion,
  type Result,
  type Store,
  type WidgetRef,
  type WidgetSetup,
} from './mount.ts'
import type { mountWidget } from './widget.ts'

type MountWidget = typeof mountWidget

export interface IslandRef {
  feature: string
  node: string
  scope: Json[]
}

export interface PagePayload {
  islands: IslandRef[]
  data: [string, Result][]
  features: Record<string, MachineIR | null>
  nodes: Record<string, ViewNode>
  fns: string | null
  params: Json
  search: Json
  snapshots?: Record<string, Snapshot>
  widgets: Record<string, WidgetRef>
  routes: Record<string, string>
  live: Record<string, LiveQuery>
  soft?: Record<string, string[]>
}

export interface LiveQuery {
  query: string
  input: Json
  tags: string[]
}

export interface EffectResponse {
  result: Result
  refreshed: [string, Result][]
}

export type Transport = (effect: string, input: Json, keys: string[]) => Promise<EffectResponse>

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
  live?: (onTags: (tags: string[]) => void) => void
  loadFns?: (url: string) => Promise<Record<string, never>>
  loadWidget?: (url: string) => Promise<WidgetSetup>
}

const importWidget = async (url: string) =>
  ((await import(/* @vite-ignore */ url)) as { default: WidgetSetup }).default

const importFns = async (url: string) =>
  ((await import(/* @vite-ignore */ url)) as { fns: Record<string, never> }).fns

export interface Session {
  doc: Document
  apps: Map<string, App>
  mount(payload: PagePayload, markers: (Comment | undefined)[]): Promise<void>
}

export async function hydrate(
  doc: Document,
  {
    transport = fetchTransport,
    query = fetchQuery,
    live,
    loadFns = importFns,
    loadWidget = importWidget,
  }: HydrateOptions = {},
): Promise<Map<string, App>> {
  const apps = new Map<string, App>()
  const script = doc.getElementById('tenon-payload')
  if (!script?.textContent) return apps
  const shared: Store = { data: new Map(), versions: new Map() }
  const fns: Record<string, never> = {}
  const widgets: Record<string, WidgetRef> = {}
  const routes: Record<string, string> = {}
  const liveKeys = new Map<string, LiveQuery>()
  const loaded: {
    motion?: Motion
    mountWidget?: MountWidget
    fns?: boolean
    live?: boolean
    visible?: boolean
  } = {}
  const inflight = new Map<string, Promise<Result>>()
  const onQuery = (q: string, input: Json) => {
    const key = q + JSON.stringify(input)
    let pending = inflight.get(key)
    if (!pending) {
      pending = query(q, input).finally(() => inflight.delete(key))
      inflight.set(key, pending)
    }
    return pending
  }
  const onInvoke = async (effect: string, input: Json) => {
    const { result, refreshed } = await transport(effect, input, [...shared.data.keys()])
    for (const [key, value] of refreshed) {
      shared.data.set(key, value)
      shared.versions.set(key, (shared.versions.get(key) ?? 0) + 1)
    }
    if (refreshed.length) for (const app of apps.values()) app.sync()
    return result
  }
  const session: Session = {
    doc,
    apps,
    async mount(payload, markers) {
      const nodes = JSON.stringify(payload.nodes)
      if (!loaded.motion && nodes.includes('"motion":"')) loaded.motion = await import('./motion.ts')
      if (nodes.includes('"visible":')) void import('./visible.ts').then((m) => m.watch(doc))
      if (!loaded.mountWidget && Object.keys(payload.widgets).length)
        loaded.mountWidget = (await import('./widget.ts')).mountWidget
      if (!loaded.fns && payload.fns) {
        Object.assign(fns, await loadFns(payload.fns))
        loaded.fns = true
      }
      Object.assign(widgets, payload.widgets)
      Object.assign(routes, payload.routes)
      for (const [key, value] of payload.data) {
        if (shared.data.has(key)) shared.versions.set(key, (shared.versions.get(key) ?? 0) + 1)
        shared.data.set(key, value)
      }
      const created: App[] = []
      for (const [id, machine] of Object.entries(payload.features)) {
        if (apps.has(id)) continue
        const app = createApp(doc, {
          machine: machine ? compileMachine({ id, machine } as FeatureIR, fns, routes) : null,
          payload: shared,
          params: payload.params,
          search: payload.search,
          ...(payload.snapshots?.[id] ? { snapshot: payload.snapshots[id] } : {}),
          fns,
          widgets,
          routes,
          get motion() {
            return loaded.motion
          },
          get mountWidget() {
            return loaded.mountWidget
          },
          loadWidget,
          onQuery,
          onInvoke,
          onNavigate: (url) => doc.defaultView?.location.assign(url),
        })
        apps.set(id, app)
        created.push(app)
      }
      payload.islands.forEach((island, i) => {
        const at = markers[i]
        const node = payload.nodes[island.node]
        if (at?.parentNode && node)
          apps.get(island.feature)?.attach(at.parentNode, at.nextSibling, node, island.scope, true)
      })
      for (const app of apps.values()) app.sync()
      for (const app of created) app.start()
      for (const [key, l] of Object.entries(payload.live ?? {})) liveKeys.set(key, l)
      if (liveKeys.size && !loaded.live) {
        loaded.live = true
        ;(live ?? (await import('./live.ts')).liveStream(doc))(async (tags) => {
          const stale = [...liveKeys].filter(([, l]) => l.tags.some((t) => tags.includes(t)))
          for (const [key, l] of stale) shared.data.set(key, await query(l.query, l.input))
          if (stale.length) for (const app of apps.values()) app.sync()
        })
      }
    },
  }
  const payload = JSON.parse(script.textContent) as PagePayload
  const markers: Comment[] = []
  const walker = doc.createTreeWalker(doc.body ?? doc, 128)
  while (walker.nextNode())
    if ((walker.currentNode as Comment).data === 'i') markers.push(walker.currentNode as Comment)
  await session.mount(payload, markers)
  if (payload.soft) void import('./navigate.ts').then((m) => m.soft(session))
  return apps
}
