import type { FeatureIR, Json, MachineIR, ViewNode } from '@tenon/core/ir'
import { compileMachine } from '@tenon/machine'
import { type App, createApp, type Result, type Store } from './mount.ts'

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
}

export interface EffectResponse {
  result: Result
  refreshed: [string, Result][]
}

export type Transport = (effect: string, input: Json, keys: string[]) => Promise<EffectResponse>

export const fetchTransport: Transport = async (effect, input, keys) => {
  const response = await fetch('/_tenon/effect', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ effect, input, keys }),
  })
  return (await response.json()) as EffectResponse
}

export interface HydrateOptions {
  transport?: Transport
  loadFns?: (url: string) => Promise<Record<string, never>>
}

const importFns = async (url: string) =>
  ((await import(/* @vite-ignore */ url)) as { fns: Record<string, never> }).fns

export async function hydrate(
  doc: Document,
  { transport = fetchTransport, loadFns = importFns }: HydrateOptions = {},
): Promise<Map<string, App>> {
  const apps = new Map<string, App>()
  const script = doc.getElementById('tenon-payload')
  if (!script?.textContent) return apps
  const payload = JSON.parse(script.textContent) as PagePayload
  const fns = payload.fns ? await loadFns(payload.fns) : {}
  const shared: Store = { data: new Map(payload.data), versions: new Map() }
  for (const [id, machine] of Object.entries(payload.features))
    apps.set(
      id,
      createApp(doc, {
        machine: machine ? compileMachine({ id, machine } as FeatureIR, fns) : null,
        payload: shared,
        fns,
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
  payload.islands.forEach((island, i) => {
    const host = doc.querySelector(`t-i[data-i="${i}"]`)
    const node = payload.nodes[island.node]
    if (!host || !node) return
    host.replaceChildren()
    apps.get(island.feature)?.attach(host, node, island.scope)
  })
  for (const app of apps.values()) app.start()
  return apps
}
