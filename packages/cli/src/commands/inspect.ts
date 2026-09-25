import { hashJson } from '@tenon/core/ir'
import type { InspectOutput } from '../contract.ts'
import { type Loaded, requireFeature } from '../load.ts'

export function runInspect(loaded: Loaded, id: string | undefined): InspectOutput {
  const { ir } = loaded.build()
  const feature = requireFeature(ir, id)
  const states = Object.values(feature.machine?.states ?? {})
  const transitions = states.reduce(
    (n, s) =>
      n +
      Object.values(s.on).reduce((m, l) => m + l.length, 0) +
      (s.invoke
        ? s.invoke.done.length + Object.values(s.invoke.failed).reduce((m, l) => m + l.length, 0)
        : 0) +
      s.after.length,
    0,
  )
  return {
    feature: feature.id,
    hash: hashJson(feature),
    summary: {
      states: states.length,
      transitions,
      events: Object.keys(feature.events).length,
      queries: Object.keys(feature.queries).length,
      mutations: Object.keys(feature.mutations).length,
      views: Object.keys(feature.views).length,
      contracts: Object.keys(feature.contracts).length,
      hydrates: Object.values(feature.views).some((v) => v.machine !== null),
      imports: feature.imports,
      exports: feature.exports,
    },
    ir: feature,
  }
}
