import {
  type At,
  at,
  type ProjectIR,
  resolveAt,
  routeParams,
  routePattern,
  type ValueExpr,
} from '@hozu/core/ir'
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
    'HZ032',
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

const URL_ATTRS: Record<string, string> = {
  a: 'href',
  area: 'href',
  form: 'action',
  button: 'formaction',
  input: 'formaction',
}

function postEndpoint(ir: ProjectIR, path: string): string | null {
  for (const f of Object.values(ir.features))
    for (const [sym, e] of Object.entries(f.endpoints))
      if (e.method === 'POST' && e.path === path) return `${f.id}.${sym}`
  return null
}

function reportEndpoint(ctx: Ctx, feature: string, pointer: At, path: string, ref: string) {
  const call = `ui.link(${ref.slice(ref.indexOf('.') + 1)})`
  ctx.report(
    'HZ032',
    feature,
    pointer,
    `Form action "${path}" is a string; use ${call}`,
    'An endpoint is a declaration identity, so a moved or removed endpoint is caught.',
    {
      summary: `Use ${call}`,
      snippet: call,
      patch: [{ op: 'replace', path: resolveAt(pointer), value: { endpoint: ref, input: null } }],
    },
  )
}

const internal = (v: string) => v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/_hozu/')

function concatHref(value: ValueExpr): string | null {
  if (!('fn' in value) || value.fn !== '%concat' || !('object' in value.arg)) return null
  const parts = Object.values(value.arg.object)
  const first = parts[0]
  if (!first || !('literal' in first) || typeof first.literal !== 'string' || !internal(first.literal))
    return null
  return parts.map((p) => ('literal' in p ? String(p.literal) : '…')).join('')
}

function reportConcat(ctx: Ctx, feature: string, pointer: At, href: string) {
  const match = matchRoute(ctx.ir, href.replaceAll('…', 'x').split(/[?#]/)[0]!)
  const call = match
    ? `ui.link(${match.id}, ${
        match.params
          ? `{ ${Object.keys(match.params)
              .map((k) => `${k}: …`)
              .join(', ')} }`
          : 'null'
      })`
    : 'ui.link(route, params)'
  ctx.report(
    'HZ032',
    feature,
    pointer,
    `Internal link \`${href}\` is built from a template string; use ${call}`,
    'Internal paths are typed references to a route, so a renamed route or a wrong parameter is caught; a template string is not checked.',
    { summary: `Use ${call}`, snippet: call, patch: null },
  )
}

export function internalLinks(ctx: Ctx) {
  const { ir } = ctx
  for (const f of Object.values(ir.features))
    for (const [vid, view] of Object.entries(f.views))
      walkView(ir, f, vid, view, ({ node, pointer }) => {
        if (node.kind !== 'el') return
        const attr = URL_ATTRS[node.tag]
        const href = attr ? node.attrs[attr] : undefined
        if (!attr || !href) return
        const p = at(pointer, 'attrs', attr)
        const built = concatHref(href)
        if (built) reportConcat(ctx, f.id, p, built)
        if (!('literal' in href) || typeof href.literal !== 'string') return
        const v = href.literal
        if (!internal(v)) return
        const endpoint = attr === 'href' ? null : postEndpoint(ir, v)
        if (endpoint) reportEndpoint(ctx, f.id, p, v, endpoint)
        else report(ctx, f.id, p, v)
      })
}
