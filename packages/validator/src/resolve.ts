import type { ExportsIR, FeatureIR, ProjectIR } from '@hozu/core/ir'

export type RefKind = 'event' | 'query' | 'mutation' | 'effect' | 'tag' | 'fn' | 'view' | 'endpoint'

export type Registry = 'events' | 'queries' | 'mutations' | 'tags' | 'fns' | 'views' | 'endpoints'

export const registriesOf: Record<RefKind, Registry[]> = {
  event: ['events'],
  query: ['queries'],
  mutation: ['mutations'],
  effect: ['queries', 'mutations'],
  tag: ['tags'],
  fn: ['fns'],
  view: ['views'],
  endpoint: ['endpoints'],
}

export interface Resolved {
  feature: FeatureIR
  symbol: string
  registry: Registry
}

export const splitRef = (ref: string): [string, string] => {
  const dot = ref.indexOf('.')
  return dot < 0 ? [ref, ''] : [ref.slice(0, dot), ref.slice(dot + 1)]
}

const memo = new WeakMap<ProjectIR, Partial<Record<RefKind, Map<string, Resolved | null>>>>()

export function resolveRef(ir: ProjectIR, ref: string, kind: RefKind): Resolved | null {
  let byKind = memo.get(ir)
  if (!byKind) {
    byKind = {}
    memo.set(ir, byKind)
  }
  let cache = byKind[kind]
  if (!cache) {
    cache = new Map()
    byKind[kind] = cache
  }
  const hit = cache.get(ref)
  if (hit !== undefined) return hit
  const resolved = lookup(ir, ref, kind)
  cache.set(ref, resolved)
  return resolved
}

function lookup(ir: ProjectIR, ref: string, kind: RefKind): Resolved | null {
  const [fid, symbol] = splitRef(ref)
  const feature = ir.features[fid]
  if (!feature) return null
  for (const registry of registriesOf[kind])
    if (Object.hasOwn(feature[registry], symbol)) return { feature, symbol, registry }
  return null
}

export function candidatesFor(ir: ProjectIR, from: FeatureIR, kind: RefKind): string[] {
  const out: string[] = []
  for (const registry of registriesOf[kind]) {
    for (const symbol of Object.keys(from[registry])) out.push(`${from.id}.${symbol}`)
    for (const fid of from.imports) {
      const other = ir.features[fid]
      if (other)
        for (const symbol of other.exports[registry as keyof ExportsIR] ?? []) out.push(`${fid}.${symbol}`)
    }
  }
  return out
}
