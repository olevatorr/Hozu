import { type BuildResult, type Json, routeParams, routePattern } from '@tenonkit/core/ir'

export interface Match {
  route: string
  params: Json
}

export function patternOf(path: string): { keys: string[]; pattern: RegExp } {
  const { keys, pattern } = routePattern(path)
  return { keys: keys.map((k) => k.name), pattern }
}

export function matcher(build: BuildResult): (pathname: string) => Match | null {
  const table = Object.entries(build.ir.routes)
    .filter(([id]) => build.ir.pages[id])
    .map(([id, r]) => {
      const { keys, pattern } = routePattern(r.path)
      const many = keys.filter((k) => k.mod === '+' || k.mod === '*').length
      return { id, keys, pattern, hasParams: r.params !== null, rank: keys.length * 100 + many }
    })
    .sort((a, b) => a.rank - b.rank)
  return (pathname) => {
    for (const { id, keys, pattern, hasParams } of table) {
      const m = pattern.exec(pathname)
      if (!m) continue
      if (!hasParams) return { route: id, params: null }
      const params = routeParams(keys, m)
      if (!params || build.bindings.checks[`#route:${id}`]?.(params)) continue
      return { route: id, params }
    }
    return null
  }
}
