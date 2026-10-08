import type { Json, MachineIR } from '@hozu/core/ir'
import type { Snapshot } from '@hozu/machine'
import type { PagePayload } from './hydrate.ts'
import type { App } from './mount.ts'

const KEEP = 'hozu:keep'

/**
 * State that stays on screen stays (ADR 0067 C4, narrowed by ADR 0069 B1): a machine shown through a view two pages
 * share keeps its state on the other page; any other machine only when the visitor comes back to the same address
 * (another product of one route starts fresh). When the page is left, each machine not in a busy state is kept
 * in the tab's sessionStorage (on a click too, since a prerendered next page may show before this one hides); the
 * next page, once shown, hydrates the server's view and then enters the kept state of a machine it shows too, if
 * the visitor's session mark is the same and it is under half an hour old. Fields the address sets come from the
 * address. A reload, a framed page (a preview, an embed) and a DevTools state preview keep nothing.
 */
export function kept(doc: Document, payload: PagePayload, apps: Map<string, App>) {
  const win = doc.defaultView
  if (!win || win.top !== win || payload.devState || payload.who === null) return () => undefined
  const shape = (m: MachineIR) => JSON.stringify({ ...m, initialContext: null })
  const who = payload.who ?? ''
  const here = win.location.pathname
  const save = () => {
    const machines: Record<string, [string, Snapshot]> = {}
    for (const [id, app] of apps) {
      const s = app.snapshot()
      const m = payload.features[id]
      if (s && m && !m.states[s.state]?.invoke) machines[id] = [shape(m), s]
    }
    try {
      win.sessionStorage.setItem(KEEP, JSON.stringify({ who, at: Date.now(), path: here, machines }))
    } catch {}
  }
  win.addEventListener('pagehide', save)
  doc.addEventListener('click', save, true)
  return () => {
    let saved: {
      who: string
      at: number
      path?: string
      machines: Record<string, [string, Snapshot]>
    } | null = null
    try {
      saved = JSON.parse(win.sessionStorage.getItem(KEEP) ?? 'null')
      win.sessionStorage.removeItem(KEEP)
      if (
        (win.performance.getEntriesByType('navigation')[0] as { type?: string } | undefined)?.type ===
        'reload'
      )
        saved = null
    } catch {}
    if (!saved || saved.who !== who || Date.now() - saved.at >= 1_800_000) return
    for (const [id, app] of apps) {
      if (saved.path !== here && !payload.keep?.includes(id)) continue
      const entry = saved.machines[id]
      const machine = payload.features[id]
      if (!entry || !machine || entry[0] !== shape(machine) || payload.snapshots?.[id]) continue
      const from = machine.initialContext as Record<string, Json>
      const address = Object.fromEntries((payload.seeds?.[id] ?? []).map((k) => [k, from[k] ?? null]))
      app.resume({ ...entry[1], context: { ...(entry[1].context as Record<string, Json>), ...address } })
    }
  }
}
