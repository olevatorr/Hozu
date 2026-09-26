import type { HttpConfig } from '../builders/http.ts'
import { join } from '../canonical/pointer.ts'
import type { HttpIR, RedirectIR } from '../ir/types.ts'
import { refProxy } from '../model/expr.ts'
import { PageScope } from './page.ts'
import type { ProjectScope } from './scope.ts'

interface RedirectDef {
  to: ((params: unknown) => unknown) | string
  permanent: boolean
}

export function buildHttp(project: ProjectScope, config: HttpConfig | null | undefined): HttpIR {
  if (!config) return { basePath: '', trailingSlash: 'never', redirects: [], headers: [] }
  const scope = new PageScope(project, 'http')
  const redirects: RedirectIR[] = []
  for (const [i, [from, d]] of (
    Object.entries(config.redirects ?? {}) as [string, RedirectDef][]
  ).entries()) {
    const p = join('', 'http', 'redirects', i)
    const target = d.to
    const to =
      typeof target === 'function'
        ? scope.attempt(join(p, 'to'), () => scope.value(target(refProxy('params', 0)), join(p, 'to')), {
            literal: null,
          })
        : { literal: String(target) }
    redirects.push({ from, to, permanent: d.permanent === true })
  }
  const headers = (config.headers ?? []).map((rule, i) => ({
    routes:
      rule.routes === 'all'
        ? ('all' as const)
        : rule.routes.map((r) => {
            const id = project.routes.get(r)
            if (!id)
              project.report(
                'HZ007',
                null,
                join('', 'http', 'headers', i, 'routes'),
                'Header rule names a route that is not registered',
                'Register it in project({ routes }).',
              )
            return id ?? '?'
          }),
    set: Object.fromEntries(Object.entries(rule.set ?? {}).map(([k, v]) => [k, String(v)])),
  }))
  return {
    basePath: String(config.basePath ?? ''),
    trailingSlash: config.trailingSlash === 'always' ? 'always' : 'never',
    redirects,
    headers,
  }
}
