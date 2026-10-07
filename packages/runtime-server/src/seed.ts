import type { FeatureIR, Json, ProjectIR } from '@hozu/core/ir'
import { compileValue } from '@hozu/machine'

/** The context fields the page's address sets for this feature: they win over a kept snapshot (ADR 0067 C4). */
export function seedKeys(ir: ProjectIR, route: string, feature: FeatureIR): string[] {
  for (const ref of ir.pages[route]?.views ?? []) {
    const dot = ref.indexOf('.')
    if (ref.slice(0, dot) !== feature.id) continue
    const seed = feature.views[ref.slice(dot + 1)]?.seed
    if (seed) return Object.keys(seed)
  }
  return []
}

export function seededContext(
  ir: ProjectIR,
  route: string,
  feature: FeatureIR,
  fns: Record<string, (x: never) => unknown>,
  params: Json,
  search: Json,
): Json | null {
  const machine = feature.machine
  const page = ir.pages[route]
  if (!machine || !page) return null
  for (const ref of page.views) {
    const dot = ref.indexOf('.')
    if (ref.slice(0, dot) !== feature.id) continue
    const seed = feature.views[ref.slice(dot + 1)]?.seed
    if (!seed) continue
    const env = { context: machine.initialContext, state: null, bindings: [], params, search } as never
    const context = { ...(machine.initialContext as Record<string, Json>) }
    for (const [key, v] of Object.entries(seed)) context[key] = compileValue(v, fns)(env)
    return context
  }
  return null
}
