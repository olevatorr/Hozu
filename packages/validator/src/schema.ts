import type { Json, JsonSchema } from '@tenon/core/ir'

export type PathResult =
  | { ok: true; schema: JsonSchema | null }
  | { ok: false; index: number; segment: string; candidates: string[] }

const obj = (v: Json | undefined): JsonSchema | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as JsonSchema) : null

const types = (s: JsonSchema): string[] =>
  typeof s.type === 'string' ? [s.type] : Array.isArray(s.type) ? (s.type as string[]) : []

type Step = { ok: true; schema: JsonSchema | null } | { ok: false; candidates: string[] }

function step(s: JsonSchema, segment: string): Step {
  if ('$ref' in s) return { ok: true, schema: null }
  const variants = (['anyOf', 'oneOf', 'allOf'] as const).flatMap((k) =>
    Array.isArray(s[k]) ? (s[k] as Json[]) : [],
  )
  if (variants.length) {
    const candidates: string[] = []
    for (const v of variants) {
      const vs = obj(v)
      if (!vs || (types(vs).length === 1 && types(vs)[0] === 'null')) continue
      const r = step(vs, segment)
      if (r.ok) return r
      candidates.push(...r.candidates)
    }
    return { ok: false, candidates }
  }
  const t = types(s)
  const properties = obj(s.properties)
  if (t.includes('object') || properties) {
    const prop = properties?.[segment]
    if (prop !== undefined) return { ok: true, schema: obj(prop) }
    const extra = obj(s.additionalProperties)
    if (extra) return { ok: true, schema: extra }
    if (!properties && s.additionalProperties !== false) return { ok: true, schema: null }
    return { ok: false, candidates: Object.keys(properties ?? {}) }
  }
  if (t.includes('array') || 'items' in s) {
    if (segment === 'length') return { ok: true, schema: { type: 'integer' } }
    if (/^\d+$/.test(segment)) return { ok: true, schema: obj(s.items) }
    return { ok: false, candidates: ['length'] }
  }
  if (t.length === 0) return { ok: true, schema: null }
  return { ok: false, candidates: [] }
}

const memo = new WeakMap<JsonSchema, Map<string, PathResult>>()

export function resolvePath(root: JsonSchema | null, path: readonly string[]): PathResult {
  if (!root || path.length === 0) return { ok: true, schema: root }
  let cache = memo.get(root)
  if (!cache) {
    cache = new Map()
    memo.set(root, cache)
  }
  const key = path.join('\u0000')
  let result = cache.get(key)
  if (!result) {
    result = walkPath(root, path)
    cache.set(key, result)
  }
  return result
}

function walkPath(root: JsonSchema, path: readonly string[]): PathResult {
  let current: JsonSchema | null = root
  for (let i = 0; i < path.length; i++) {
    if (!current) return { ok: true, schema: null }
    const segment = path[i]!
    const r = step(current, segment)
    if (!r.ok) return { ok: false, index: i, segment, candidates: r.candidates }
    current = r.schema
  }
  return { ok: true, schema: current }
}

export function itemsOf(s: JsonSchema | null): JsonSchema | null {
  if (!s) return null
  if (obj(s.items)) return obj(s.items)
  for (const k of ['anyOf', 'oneOf'] as const)
    if (Array.isArray(s[k]))
      for (const v of s[k] as Json[]) if (obj(v) && itemsOf(obj(v))) return itemsOf(obj(v))
  return null
}
