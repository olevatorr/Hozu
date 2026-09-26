import { type Json, type JsonSchema, searchDefaults } from '@tenonkit/core/ir'

const obj = (v: Json | undefined): JsonSchema | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as JsonSchema) : null

function variant(s: JsonSchema): JsonSchema {
  for (const k of ['anyOf', 'oneOf'] as const)
    if (Array.isArray(s[k]))
      for (const v of s[k] as Json[]) {
        const o = obj(v)
        if (o && o.type !== 'null') return o
      }
  return s
}

function coerce(schema: JsonSchema, raw: string): Json | undefined {
  const s = variant(schema)
  if (Array.isArray(s.enum)) return s.enum.find((e) => String(e) === raw) as Json | undefined
  const type = Array.isArray(s.type) ? (s.type as string[]).find((t) => t !== 'null') : s.type
  if (type === 'number' || type === 'integer') {
    const n = Number(raw)
    return raw !== '' && Number.isFinite(n) && (type === 'number' || Number.isInteger(n)) ? n : undefined
  }
  if (type === 'boolean') return raw === 'true' ? true : raw === 'false' ? false : undefined
  if (type === 'string') return raw
  return undefined
}

export function parseSearch(schema: JsonSchema | null, query: URLSearchParams): Json {
  if (!schema) return null
  const defaults = searchDefaults(schema)
  const out: Record<string, Json> = {}
  for (const [key, v] of Object.entries(obj(schema.properties) ?? {})) {
    const raw = query.get(key)
    const parsed = raw === null ? undefined : coerce(obj(v) ?? {}, raw)
    out[key] = parsed === undefined ? (defaults[key] ?? null) : parsed
  }
  return out
}
