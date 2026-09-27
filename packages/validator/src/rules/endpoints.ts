import { resolveAt, routePattern } from '@hozu/core/ir'
import type { Ctx } from '../context.ts'
import { featurePointer } from '../walk.ts'

const STATIC = /^\/$|^(\/[A-Za-z0-9._~-]+)+$/

export function endpoints(ctx: Ctx) {
  const taken = new Map<string, string>()
  const pages = Object.keys(ctx.ir.pages)
    .map((r) => ctx.ir.routes[r]?.path)
    .filter((p): p is string => p !== undefined)
  for (const f of Object.values(ctx.ir.features))
    for (const [sym, e] of Object.entries(f.endpoints ?? {})) {
      const ref = `${f.id}.${sym}`
      const pointer = featurePointer(f.id, 'endpoints', sym, 'path')
      const report = (message: string, cause: string, summary: string, value: string | null = null) =>
        ctx.report('HZ046', f.id, pointer, message, cause, {
          summary,
          snippet: null,
          patch: value === null ? null : [{ op: 'replace', path: resolveAt(pointer), value }],
        })
      const api = (path: string) => {
        const parts = path
          .split('/')
          .filter((s) => s && s !== '_hozu' && !s.startsWith(':') && !s.includes('*'))
        if (parts[0] === 'api') parts.shift()
        return ['/api', ...parts].join('/')
      }
      if (e.method !== 'GET' && e.method !== 'POST')
        ctx.report(
          'HZ046',
          f.id,
          featurePointer(f.id, 'endpoints', sym, 'method'),
          `Endpoint ${ref} has method "${e.method}"`,
          'Endpoints answer GET or POST.',
          { summary: "Use method: 'GET' or 'POST'", snippet: null, patch: null },
        )
      if (!STATIC.test(e.path))
        report(
          `Endpoint path "${e.path}" of ${ref} is not a static path`,
          'An endpoint path starts with / and has no params, query string or trailing slash; its input comes from the query string (GET) or the body (POST).',
          'Use a path such as "/api/orders" and move variable parts into input',
          api(e.path.split('?')[0]!),
        )
      else if (e.path === '/_hozu' || e.path.startsWith('/_hozu/'))
        report(
          `Endpoint path "${e.path}" of ${ref} is reserved`,
          '/_hozu/ belongs to the framework.',
          'Use a path such as "/api/…"',
          api(e.path),
        )
      else if (pages.some((p) => routePattern(p).pattern.test(e.path)))
        report(
          `Endpoint path "${e.path}" of ${ref} is also a page`,
          'Pages answer GET and form POSTs on their path, so the endpoint would shadow the page.',
          'Move the endpoint under a path no page uses, such as "/api/…"',
          api(e.path),
        )
      else if (ctx.ir.http.redirects.some((r) => r.from === e.path))
        report(
          `Endpoint path "${e.path}" of ${ref} is also a redirect`,
          'A redirect answers every request on its path.',
          'Remove the redirect or move the endpoint',
        )
      const key = `${e.method} ${e.path}`
      const other = taken.get(key)
      if (other)
        report(
          `${key} is declared by ${other} and ${ref}`,
          'Each method and path has one endpoint.',
          'Rename one of the paths',
        )
      else taken.set(key, ref)
    }
}
