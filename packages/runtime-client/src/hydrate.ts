import type { FeatureIR, Json, MachineIR, ViewNode } from '@tenon/core/ir'
import { compileMachine } from '@tenon/machine'
import { uploads } from './dom.ts'
import { type App, createApp, type Result, type Store, type WidgetRef, type WidgetSetup } from './mount.ts'

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
  widgets: Record<string, WidgetRef>
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
}

export type Transport = (effect: string, input: Json, keys: string[]) => Promise<EffectResponse>

export const fetchTransport: Transport = async (effect, input, keys) => {
  const json = JSON.stringify({ effect, input, keys })
  const body = uploads.size ? await (await import('./uploads.ts')).encode(json, input, uploads) : json
  const response = await fetch('/_tenon/effect', {
    method: 'POST',
    headers: typeof body === 'string' ? { 'content-type': 'application/json' } : {},
    body,
  })
  return (await response.json()) as EffectResponse
}

export type QueryTransport = (query: string, input: Json) => Promise<Result>

export const fetchQuery: QueryTransport = async (query, input) => {
  const response = await fetch('/_tenon/query', {
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
  const payload = JSON.parse(script.textContent) as PagePayload
  const motion = script.textContent.includes('"motion":"') ? await import('./motion.ts') : undefined
  const mountWidget = Object.keys(payload.widgets).length
    ? (await import('./widget.ts')).mountWidget
    : undefined
  const fns = payload.fns ? await loadFns(payload.fns) : {}
  const shared: Store = { data: new Map(payload.data), versions: new Map() }
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
  for (const [id, machine] of Object.entries(payload.features))
    apps.set(
      id,
      createApp(doc, {
        machine: machine ? compileMachine({ id, machine } as FeatureIR, fns) : null,
        payload: shared,
        params: payload.params,
        fns,
        widgets: payload.widgets,
        routes: payload.routes,
        motion,
        mountWidget,
        loadWidget,
        onQuery,
        onInvoke: async (effect, input) => {
          const { result, refreshed } = await transport(effect, input, [...shared.data.keys()])
          for (const [key, value] of refreshed) {
            shared.data.set(key, value)
            shared.versions.set(key, (shared.versions.get(key) ?? 0) + 1)
          }
          if (refreshed.length) for (const app of apps.values()) app.sync()
          return result
        },
        onNavigate: (route) =>
          doc.defaultView?.dispatchEvent(new CustomEvent('tenon:navigate', { detail: route })),
      }),
    )
  const markers: Comment[] = []
  const walker = doc.createTreeWalker(doc.body ?? doc, 128)
  while (walker.nextNode())
    if ((walker.currentNode as Comment).data === 'i') markers.push(walker.currentNode as Comment)
  payload.islands.forEach((island, i) => {
    const at = markers[i]
    const node = payload.nodes[island.node]
    if (!at?.parentNode || !node) return
    apps.get(island.feature)?.attach(at.parentNode, at.nextSibling, node, island.scope, true)
  })
  for (const app of apps.values()) app.start()
  const liveKeys = Object.entries(payload.live ?? {})
  if (liveKeys.length)
    (live ?? (await import('./live.ts')).liveStream(doc))(async (tags) => {
      const stale = liveKeys.filter(([, l]) => l.tags.some((t) => tags.includes(t)))
      for (const [key, l] of stale) shared.data.set(key, await query(l.query, l.input))
      if (stale.length) for (const app of apps.values()) app.sync()
    })
  return apps
}
