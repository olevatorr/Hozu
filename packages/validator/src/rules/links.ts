import { type At, at, type ProjectIR, resolveAt, routeParams, routePattern } from '@tenon/core/ir'
import type { Ctx } from '../context.ts'
import { closest, didYouMean } from '../suggest.ts'
import { walkView } from '../walk.ts'

function matchRoute(ir: ProjectIR, pathname: string) {
  for (const [id, r] of Object.entries(ir.routes)) {
    const { keys, pattern } = routePattern(r.path)
    const m = pattern.exec(pathname)
    if (m) return { id, params: keys.length ? routeParams(keys, m) : null }
  }
  return null
}

function report(ctx: Ctx, feature: string, pointer: At, href: string) {
  const [pathname = href] = href.split(/[?#]/)
  const extra = pathname !== href
  const match = matchRoute(ctx.ir, pathname)
  const guess = match
    ? null
    : closest(
        pathname,
        Object.values(ctx.ir.routes).map((r) => r.path),
      )
  const call = match
    ? `ui.link(${match.id}, ${match.params ? JSON.stringify(match.params) : 'null'})`
    : 'ui.link(route, params)'
  ctx.report(
    'TN032',
    feature,
    pointer,
    match
      ? `Internal link "${href}" is a string; use ${call}`
      : `No route matches the internal link "${href}".${didYouMean(guess)}`,
    extra
      ? 'Internal paths are typed references to a route; ui.link does not carry a query string or fragment yet.'
      : 'Internal paths are typed references to a route, so a renamed or missing route is caught. Files use ui.asset.',
    {
      summary: match
        ? `Use ${call}`
        : guess
          ? `Link to the route at "${guess}" with ui.link`
          : 'Declare the route or fix the path',
      snippet: match ? call : null,
      patch:
        match && !extra
          ? [
              {
                op: 'replace',
                path: resolveAt(pointer),
                value: { link: match.id, params: { literal: match.params }, search: { literal: null } },
              },
            ]
          : null,
    },
  )
}

export function internalLinks(ctx: Ctx) {
  const { ir } = ctx
  for (const f of Object.values(ir.features))
    for (const [vid, view] of Object.entries(f.views))
      walkView(ir, f, vid, view, ({ node, pointer }) => {
        if (node.kind !== 'el' || (node.tag !== 'a' && node.tag !== 'area')) return
        const href = node.attrs.href
        if (!href || !('literal' in href) || typeof href.literal !== 'string') return
        const v = href.literal
        if (v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/_tenon/'))
          report(ctx, f.id, at(pointer, 'attrs', 'href'), v)
      })
}
