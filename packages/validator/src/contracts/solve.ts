import type { GuardExpr, Json, JsonSchema, RefSource, ValueExpr } from '@hozu/core/ir'

export interface Patch {
  ref: RefSource
  path: string[]
  value: Json
}

export type Schemas = Partial<Record<RefSource, JsonSchema | null>>

const obj = (v: unknown): JsonSchema | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as JsonSchema) : null

function schemaAt(schema: JsonSchema | null, path: string[]): JsonSchema | null {
  let s = schema
  for (const key of path) {
    const variants = [s, ...[...((s?.anyOf as Json[]) ?? []), ...((s?.oneOf as Json[]) ?? [])].map(obj)]
    s = variants.map((v) => obj(obj(v?.properties)?.[key])).find(Boolean) ?? null
  }
  return s
}

const typesOf = (s: JsonSchema | null) =>
  [s?.type, ...((s?.anyOf as Json[]) ?? []).map((v) => obj(v)?.type)].flat()

function truthy(s: JsonSchema | null): Json {
  if (Array.isArray(s?.enum)) return (s.enum as Json[]).find(Boolean) ?? null
  const types = typesOf(s)
  if (types.includes('number') || types.includes('integer')) return 1
  if (types.includes('boolean')) return true
  if (types.includes('array')) return [null]
  if (types.includes('object')) return {}
  return 'x'
}

function falsy(s: JsonSchema | null): Json {
  if (Array.isArray(s?.enum)) return (s.enum as Json[]).find((v) => !v) ?? null
  const types = typesOf(s)
  if (types.includes('null')) return null
  if (types.includes('number') || types.includes('integer')) return 0
  if (types.includes('boolean')) return false
  if (types.includes('string')) return ''
  return null
}

function other(s: JsonSchema | null, lit: Json): Json | undefined {
  if (Array.isArray(s?.enum)) return (s.enum as Json[]).find((v) => v !== lit)
  if (typeof lit === 'boolean') return !lit
  if (typeof lit === 'number') return lit + 1
  if (typeof lit === 'string') return lit === '' ? 'x' : ''
  return truthy(s)
}

const refOf = (v: ValueExpr): { ref: RefSource; path: string[] } | null =>
  'ref' in v && v.ref !== 'binding' ? v : null

/** Values that make `g` evaluate to `want`, for guards over plain fields (`x === lit`, `!!x`, `<`, `and`, `or`, `not`). */
export function solve(g: GuardExpr, want: boolean, schemas: Schemas): Patch[] | null {
  if (g.op === 'not') return solve(g.arg, !want, schemas)
  if (g.op === 'and' || g.op === 'or') {
    if ((g.op === 'and') !== want) {
      for (const a of g.args) {
        const p = solve(a, want, schemas)
        if (p) return p
      }
      return null
    }
    const parts = g.args.map((a) => solve(a, want, schemas))
    return parts.every(Boolean) ? (parts.flat() as Patch[]) : null
  }
  if (g.op === 'fn') {
    const r = g.fn === '%truthy' ? refOf(g.arg) : null
    if (!r) return null
    const s = schemaAt(schemas[r.ref] ?? null, r.path)
    return [{ ...r, value: want ? truthy(s) : falsy(s) }]
  }
  if (!('left' in g)) return null
  const [r, lit] =
    refOf(g.left) && 'literal' in g.right
      ? [refOf(g.left), g.right.literal]
      : refOf(g.right) && 'literal' in g.left
        ? [refOf(g.right), g.left.literal]
        : [null, null]
  if (!r) return null
  const s = schemaAt(schemas[r.ref] ?? null, r.path)
  const equal = g.op === 'eq' ? want : g.op === 'neq' ? !want : null
  if (equal === true) return [{ ...r, value: lit }]
  if (equal === false) {
    const value = other(s, lit)
    return value === undefined ? null : [{ ...r, value }]
  }
  if (typeof lit !== 'number') return null
  const above = (g.op === 'gt' || g.op === 'gte') === want
  return [{ ...r, value: above ? lit + 1 : lit - 1 }]
}

/** Guards of the earlier entries false, this entry's guard true: the first match picks it. */
export function picking(list: readonly { guard: GuardExpr | null }[], i: number, schemas: Schemas) {
  const earlier = list.slice(0, i).map((t) => t.guard)
  if (earlier.includes(null)) return null
  const own = list[i]?.guard
  const args: GuardExpr[] = [
    ...earlier.map((arg) => ({ op: 'not' as const, arg: arg! })),
    ...(own ? [own] : []),
  ]
  return args.length ? solve({ op: 'and', args }, true, schemas) : []
}

export function patched(value: Json, patches: Patch[], ref: RefSource): Json {
  let out = structuredClone(value)
  for (const p of patches.filter((x) => x.ref === ref)) {
    if (!p.path.length) {
      out = p.value
      continue
    }
    if (!out || typeof out !== 'object' || Array.isArray(out)) out = {}
    let at = out as Record<string, Json>
    for (const [i, key] of p.path.entries()) {
      if (i === p.path.length - 1) at[key] = p.value
      else {
        if (!at[key] || typeof at[key] !== 'object' || Array.isArray(at[key])) at[key] = {}
        at = at[key] as Record<string, Json>
      }
    }
  }
  return out
}
