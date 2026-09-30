import type { Json, JsonSchema, ProjectIR } from './types.ts'

const obj = (v: Json | undefined): JsonSchema | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as JsonSchema) : null

export function searchDefaults(search: JsonSchema | null): Record<string, Json> {
  const out: Record<string, Json> = {}
  for (const [k, v] of Object.entries(obj(search?.properties) ?? {})) {
    const s = obj(v)
    if (s && 'default' in s) out[k] = s.default as Json
  }
  return out
}

export function routeTable(ir: ProjectIR, locale: string | null = null): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [id, r] of Object.entries(ir.routes)) {
    const q = Object.entries(searchDefaults(r.search))
      .filter(([, v]) => v !== null && typeof v !== 'object')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&')
    const path = publicPath(ir, r.path, locale)
    out[id] = q ? `${path}?${q}` : path
  }
  return out
}

export const localeOf = (ir: ProjectIR, locale: string | null): string | null =>
  ir.site?.locales ? (locale ?? ir.site.lang) : null

export const prefixOf = (ir: ProjectIR, locale: string | null): string | null => {
  const l = localeOf(ir, locale)
  return l && l !== ir.site?.lang ? l : null
}

export function localePath(ir: ProjectIR, path: string, locale: string | null): string {
  const prefix = prefixOf(ir, locale)
  if (!prefix) return path
  return path === '/' ? `/${prefix}` : `/${prefix}${path}`
}

export function publicPath(ir: ProjectIR, path: string, locale: string | null = null): string {
  const { trailingSlash } = ir.http
  const prefix = prefixOf(ir, locale)
  const basePath = prefix ? `${ir.http.basePath}/${prefix}` : ir.http.basePath
  const bare = path === '/' ? '' : path.replace(/\/$/, '')
  if (trailingSlash === 'always') return `${basePath}${bare}/`
  return `${basePath}${bare}` || '/'
}

export type RouteModifier = '' | '?' | '+' | '*'

export interface RouteKey {
  name: string
  mod: RouteModifier
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const groups: Record<RouteModifier, string> = {
  '': '/([^/]+)',
  '?': '(?:/([^/]+))?',
  '+': '((?:/[^/]+)+)',
  '*': '((?:/[^/]+)*)',
}

export function routePattern(path: string): { keys: RouteKey[]; pattern: RegExp; sample: string } {
  const keys: RouteKey[] = []
  let source = ''
  let sample = ''
  let last = 0
  for (const m of path.matchAll(/\/:([A-Za-z][A-Za-z0-9_]*)([?*+]?)/g)) {
    const literal = path.slice(last, m.index)
    const mod = m[2] as RouteModifier
    keys.push({ name: m[1]!, mod })
    source += escapeRegExp(literal) + groups[mod]
    sample += `${literal}/x`
    last = m.index + m[0].length
  }
  const rest = path.slice(last)
  return {
    keys,
    pattern: new RegExp(`^${(source + escapeRegExp(rest)).replace(/\/$/, '')}/?$`),
    sample: sample + rest,
  }
}

export function routeParams(keys: RouteKey[], match: RegExpExecArray): Record<string, Json> | null {
  try {
    return Object.fromEntries(
      keys.map(({ name, mod }, i) => {
        const raw = match[i + 1]
        if (mod === '+' || mod === '*')
          return [name, raw ? raw.slice(1).split('/').map(decodeURIComponent) : []]
        return [name, raw === undefined ? null : decodeURIComponent(raw)]
      }),
    )
  } catch {
    return null
  }
}
