import type { Json, MachineIR } from '@hozu/core/ir'
import type { Snapshot } from '@hozu/machine'
import type { App, Result } from './mount.ts'

const KEY = 'hozu:snapshots'

type Saved = Record<string, { machine: string; snapshot: Snapshot }>

const storage = (doc: Document) => {
  try {
    return doc.defaultView?.sessionStorage ?? null
  } catch {
    return null
  }
}

export function restore(doc: Document): (id: string, machine: MachineIR | null) => Snapshot | undefined {
  const store = storage(doc)
  let saved: Saved = {}
  try {
    saved = JSON.parse(store?.getItem(KEY) ?? '{}') as Saved
  } catch {}
  store?.removeItem(KEY)
  return (id, machine) => {
    const entry = saved[id]
    if (!entry || !machine || entry.machine !== JSON.stringify(machine)) return undefined
    return machine.states[entry.snapshot.state]?.invoke ? undefined : entry.snapshot
  }
}

/** What the page offers Hozu DevTools in development: the machine's own effect paths (ADR 0050 G). */
export interface DevEffects {
  invoke(effect: string, input: Json): Promise<{ result: Result; tags: string[] }>
  query(query: string, input: Json): Promise<Result>
}

export function expose(
  doc: Document,
  apps: Map<string, App>,
  machines: Map<string, MachineIR | null>,
  effects: DevEffects,
) {
  const win = doc.defaultView as (Window & { __hozu?: { save(): void } & DevEffects }) | null
  if (!win) return
  win.__hozu = {
    ...effects,
    save() {
      const saved: Saved = {}
      for (const [id, app] of apps) {
        const snapshot = app.snapshot()
        const machine = machines.get(id)
        if (snapshot && machine) saved[id] = { machine: JSON.stringify(machine), snapshot }
      }
      storage(doc)?.setItem(KEY, JSON.stringify(saved))
    },
  }
}
