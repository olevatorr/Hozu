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

const reads = (v: unknown, depth: number): boolean => {
  if (typeof v !== 'object' || v === null) return false
  const x = v as { ref?: unknown; depth?: unknown }
  return x.ref === 'binding' ? x.depth === depth : Object.values(v).some((y) => reads(y, depth))
}

/** The initial context of a feature on this page: its view's seed from the address and seed queries (ADR 0069 B2). */
export async function seededContext(
  ir: ProjectIR,
  route: string,
  feature: FeatureIR,
  fns: Record<string, (x: never) => unknown>,
  params: Json,
  search: Json,
  data?: { run(ref: string, input: Json): Promise<unknown> },
): Promise<Json | null> {
  const machine = feature.machine
  const page = ir.pages[route]
  if (!machine || !page) return null
  for (const ref of page.views) {
    const dot = ref.indexOf('.')
    if (ref.slice(0, dot) !== feature.id) continue
    const view = feature.views[ref.slice(dot + 1)]
    const seed = view?.seed
    if (!seed) continue
    const base = { context: machine.initialContext, state: null, bindings: [], params, search } as never
    const results = await Promise.all(
      (view.seedQueries ?? []).map(async (q) => {
        const r = data
          ? ((await data.run(q.ref, compileValue(q.input, fns)(base))) as { ok: boolean; value?: Json })
          : null
        return r?.ok ? (r.value ?? null) : undefined
      }),
    )
    const env = { ...(base as object), bindings: results.map((r) => r ?? null) } as never
    const context = { ...(machine.initialContext as Record<string, Json>) }
    for (const [key, v] of Object.entries(seed))
      if (!results.some((r, i) => r === undefined && reads(v, i))) context[key] = compileValue(v, fns)(env)
    return context
  }
  return null
}
