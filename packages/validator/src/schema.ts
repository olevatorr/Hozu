import type { Json, JsonSchema } from '@tenonkit/core/ir'

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

interface Trie {
  result?: PathResult
  next?: Map<string, Trie>
}

const memo = new WeakMap<JsonSchema, Trie>()

export function resolvePath(root: JsonSchema | null, path: readonly string[]): PathResult {
  if (!root || path.length === 0) return { ok: true, schema: root }
  let node = memo.get(root)
  if (!node) {
    node = {}
    memo.set(root, node)
  }
  for (const segment of path) {
    node.next ??= new Map()
    let child = node.next.get(segment)
    if (!child) {
      child = {}
      node.next.set(segment, child)
    }
    node = child
  }
  node.result ??= walkPath(root, path)
  return node.result
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

export interface Mismatch {
  path: string[]
  expected: string
  options: string[]
}

const typeOfJson = (v: Json) =>
  v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v

const typeMatches = (t: string, v: Json) =>
  t === typeOfJson(v) || (t === 'number' && typeof v === 'number') || (t === 'integer' && Number.isInteger(v))

export function mismatch(s: JsonSchema | null, v: Json, path: string[] = []): Mismatch | null {
  if (!s || '$ref' in s) return null
  for (const k of ['anyOf', 'oneOf'] as const)
    if (Array.isArray(s[k])) {
      const found = (s[k] as Json[]).map((x) => mismatch(obj(x), v, path))
      if (found.some((m) => m === null)) return null
      return {
        path,
        expected: found.map((m) => m!.expected).join(' | '),
        options: found.flatMap((m) => (m!.path.length === path.length ? m!.options : [])),
      }
    }
  if (Array.isArray(s.allOf))
    for (const x of s.allOf as Json[]) {
      const m = mismatch(obj(x), v, path)
      if (m) return m
    }
  if ('const' in s && JSON.stringify(s.const) !== JSON.stringify(v))
    return { path, expected: JSON.stringify(s.const), options: typeof s.const === 'string' ? [s.const] : [] }
  if (Array.isArray(s.enum) && !s.enum.some((e) => JSON.stringify(e) === JSON.stringify(v))) {
    const options = s.enum.filter((e): e is string => typeof e === 'string')
    return { path, expected: s.enum.map((e) => JSON.stringify(e)).join(' | '), options }
  }
  const t = types(s)
  if (t.length && !t.some((x) => typeMatches(x, v))) return { path, expected: t.join(' | '), options: [] }
  if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
    const properties = obj(s.properties) ?? {}
    for (const [k, x] of Object.entries(v)) {
      const p = obj(properties[k]) ?? obj(s.additionalProperties)
      if (!p && s.additionalProperties === false && !(k in properties))
        return { path: [...path, k], expected: 'no such property', options: Object.keys(properties) }
      const m = mismatch(p, x, [...path, k])
      if (m) return m
    }
  }
  if (Array.isArray(v)) {
    const items = obj(s.items)
    for (let i = 0; i < v.length; i++) {
      const m = mismatch(items, v[i]!, [...path, String(i)])
      if (m) return m
    }
  }
  return null
}
