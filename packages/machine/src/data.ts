import type { Json } from '@tenon/core/ir'

type Obj = { [key: string]: Json }

export function getIn(value: Json | undefined, path: readonly string[]): Json {
  let current: unknown = value
  for (const key of path) {
    if (current === null || typeof current !== 'object') return null
    current = (current as Obj)[key]
  }
  return current === undefined ? null : (current as Json)
}

export function setIn(value: Json, path: readonly string[], next: Json, i = 0): Json {
  if (i === path.length) return next
  const key = path[i]!
  if (Array.isArray(value)) {
    const copy = value.slice()
    copy[Number(key)] = setIn(value[Number(key)] ?? null, path, next, i + 1)
    return copy
  }
  const base: Obj = value !== null && typeof value === 'object' ? value : {}
  return { ...base, [key]: setIn(base[key] ?? null, path, next, i + 1) }
}

export function equal(a: Json | undefined, b: Json | undefined): boolean {
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (!equal(a[i], b[i])) return false
    return true
  }
  if (Array.isArray(b)) return false
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  for (const k of ka) if (!Object.hasOwn(b, k) || !equal(a[k], (b as Obj)[k])) return false
  return true
}
