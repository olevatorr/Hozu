import type { BuildResult, Json } from '@tenon/core/ir'

export interface Match {
  route: string
  params: Json
}

export function patternOf(path: string): { keys: string[]; pattern: RegExp } {
  const keys: string[] = []
  const source = path
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/:([A-Za-z][A-Za-z0-9_]*)/g, (_, k: string) => {
      keys.push(k)
      return '([^/]+)'
    })
    .replace(/\/$/, '')
  return { keys, pattern: new RegExp(`^${source}/?$`) }
}

export function matcher(build: BuildResult): (pathname: string) => Match | null {
  const table = Object.entries(build.ir.routes)
    .filter(([id]) => build.ir.pages[id])
    .map(([id, r]) => ({ id, ...patternOf(r.path), hasParams: r.params !== null }))
    .sort((a, b) => a.keys.length - b.keys.length)
  return (pathname) => {
    for (const { id, keys, pattern, hasParams } of table) {
      const m = pattern.exec(pathname)
      if (!m) continue
      if (!hasParams) return { route: id, params: null }
      let params: Record<string, string>
      try {
        params = Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1]!)]))
      } catch {
        continue
      }
      if (build.bindings.checks[`#route:${id}`]?.(params)) continue
      return { route: id, params }
    }
    return null
  }
}
