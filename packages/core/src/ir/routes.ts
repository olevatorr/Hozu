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

export function publicPath(ir: ProjectIR, path: string, locale: string | null = null): string {
  const { trailingSlash } = ir.http
  const prefix = localeOf(ir, locale)
  const basePath = prefix ? `${ir.http.basePath}/${prefix}` : ir.http.basePath
  const bare = path === '/' ? '' : path.replace(/\/$/, '')
  if (trailingSlash === 'always') return `${basePath}${bare}/`
  return `${basePath}${bare}` || '/'
}
