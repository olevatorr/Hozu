import type { MachineIR } from '@tenon/core/ir'
import type { Snapshot } from '@tenon/machine'
import type { App } from './mount.ts'

const KEY = 'tenon:snapshots'

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

export function expose(doc: Document, apps: Map<string, App>, machines: Map<string, MachineIR | null>) {
  const win = doc.defaultView as (Window & { __tenon?: { save(): void } }) | null
  if (!win) return
  win.__tenon = {
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
