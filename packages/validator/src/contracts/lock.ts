import { type FeatureIR, hashJson, type Json, type ProjectIR, type ValueExpr } from '@hozu/core/ir'
import { resolveRef } from '../resolve.ts'
import { guardRefs, valueRefs } from '../sites.ts'

export interface LockEntry {
  behavior: string
  contracts: Record<string, string>
}

export interface Lockfile {
  version: 1
  features: Record<string, Record<string, LockEntry>>
}

export type Coverage = Map<string, Set<string>>

const at = (value: unknown, tokens: string[]): unknown =>
  tokens.reduce<unknown>((node, t) => (node as Record<string, unknown> | undefined)?.[t], value)

export function behaviorOf(ir: ProjectIR, feature: FeatureIR, id: string): string {
  const tokens = id.split('/')
  const states = feature.machine!.states
  const raw = at(states, tokens) as Record<string, unknown>
  const transition = (tokens[1] === 'after' ? raw.transition : raw) as {
    target: string
    guard: never
    assign: { value: ValueExpr }[]
  }
  const target = states[transition.target]
  const fns = new Set<string>()
  const collect = (ref: string) => fns.add(ref)
  if (transition.guard) guardRefs(transition.guard, '', collect)
  for (const a of transition.assign) valueRefs(a.value, '', collect)
  if (target?.invoke) valueRefs(target.invoke.input, '', collect)
  const sources = Object.fromEntries(
    [...fns].sort().map((ref) => {
      const r = resolveRef(ir, ref, 'fn')
      return [ref, r ? r.feature.fns[r.symbol]!.sourceHash : null]
    }),
  )
  return hashJson({
    id,
    transition: raw as Json,
    enters: target
      ? { invoke: target.invoke, timers: target.after.map((a) => a.ms), final: target.final }
      : null,
    fns: sources,
  } as unknown as Json).slice(0, 16)
}

export function lockOf(ir: ProjectIR, coverage: Map<string, Coverage>): Lockfile {
  const features: Lockfile['features'] = {}
  for (const [fid, cov] of [...coverage].sort(([a], [b]) => a.localeCompare(b))) {
    const feature = ir.features[fid]!
    const entries: Record<string, LockEntry> = {}
    for (const [id, contracts] of [...cov].sort(([a], [b]) => a.localeCompare(b)))
      entries[id] = {
        behavior: behaviorOf(ir, feature, id),
        contracts: Object.fromEntries(
          [...contracts]
            .sort()
            .map((c) => [c, hashJson(feature.contracts[c] as unknown as Json).slice(0, 16)]),
        ),
      }
    features[fid] = entries
  }
  return { version: 1, features }
}

export interface Drift {
  feature: string
  id: string
  contracts: string[]
}

export function drift(previous: Lockfile, next: Lockfile): Drift[] {
  const out: Drift[] = []
  for (const [fid, entries] of Object.entries(next.features))
    for (const [id, entry] of Object.entries(entries)) {
      const before = previous.features[fid]?.[id]
      if (!before || before.behavior === entry.behavior) continue
      const changed = Object.entries(entry.contracts).some(([c, hash]) => before.contracts[c] !== hash)
      if (!changed) out.push({ feature: fid, id, contracts: Object.keys(entry.contracts) })
    }
  return out
}
