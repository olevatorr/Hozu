import { hashJson, type Runs } from '@hozu/core/ir'
import type { InspectFeatureOutput, InspectOutput } from '../contract.ts'
import { type Loaded, requireFeature } from '../load.ts'
import { inspectComponent } from './components.ts'

const effectOf = (kind: 'query' | 'mutation', runs: Runs) => ({
  kind,
  runs,
  implemented: runs === 'server' ? ('resolver' as const) : ('fetch.ts' as const),
})

export function runInspect(loaded: Loaded, id: string | undefined, cwd: string): InspectOutput {
  if (id?.includes('.')) return inspectComponent(loaded.build(true), cwd, id)
  return inspectFeature(loaded, id)
}

function inspectFeature(loaded: Loaded, id: string | undefined): InspectFeatureOutput {
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
      effects: Object.fromEntries([
        ...Object.entries(feature.queries).map(([sym, q]) => [sym, effectOf('query', q.runs)] as const),
        ...Object.entries(feature.mutations).map(([sym, m]) => [sym, effectOf('mutation', m.runs)] as const),
      ]),
    },
    ir: feature,
  }
}
