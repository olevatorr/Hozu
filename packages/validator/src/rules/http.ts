import { join, routePattern } from '@tenonkit/core/ir'
import type { Ctx } from '../context.ts'

const RESERVED = new Set([
  'content-type',
  'content-length',
  'cache-control',
  'vary',
  'location',
  'set-cookie',
  'content-security-policy',
  'x-tenon-cache',
])
const TOKEN = /^[a-z0-9!#$%&'*+.^_`|~-]+$/
const BASE = /^(\/[A-Za-z0-9._~-]+)+$/

const overlaps = (a: string, b: string) => {
  const [x, y] = [routePattern(a), routePattern(b)]
  return x.pattern.test(y.sample) || y.pattern.test(x.sample)
}

export function httpRules(ctx: Ctx) {
  const { http } = ctx.ir
  if (http.basePath !== '' && !BASE.test(http.basePath))
    ctx.report(
      'TN039',
      null,
      join('', 'http', 'basePath'),
      `basePath "${http.basePath}" is not a path prefix`,
      'The prefix is joined to every URL, so it must be empty or /segment[/segment…] without a trailing slash.',
      {
        summary: 'Use a prefix such as "/shop"',
        snippet: null,
        patch: [
          {
            op: 'replace',
            path: join('', 'http', 'basePath'),
            value: `/${http.basePath.split('/').filter(Boolean).join('/')}`.replace(/^\/$/, ''),
          },
        ],
      },
    )
  const pages = Object.keys(ctx.ir.pages).flatMap((id) =>
    ctx.ir.routes[id] ? [[id, ctx.ir.routes[id]!.path]] : [],
  )
  http.redirects.forEach((r, i) => {
    const at = join('', 'http', 'redirects', i)
    const remove = {
      summary: 'Remove this redirect',
      snippet: null,
      patch: [{ op: 'remove' as const, path: at }],
    }
    const invalid = (message: string, cause: string) => ctx.report('TN037', null, at, message, cause, remove)
    if (!r.from.startsWith('/'))
      return invalid(`Redirect "${r.from}" is not a path`, 'A redirect matches a request path.')
    const page = pages.find(([, path]) => overlaps(r.from, path!))
    if (page)
      return invalid(
        `Redirect "${r.from}" matches route "${page[0]}" (${page[1]})`,
        'A URL has one owner: a redirect never hides a page.',
      )
    const other = http.redirects.slice(0, i).find((o) => overlaps(r.from, o.from))
    if (other)
      return invalid(
        `Redirect "${r.from}" overlaps redirect "${other.from}"`,
        'Two redirects for one URL make the target depend on order.',
      )
    if ('link' in r.to && !ctx.ir.routes[r.to.link])
      return invalid(
        `Redirect "${r.from}" targets an unknown route`,
        'Point `to` at a registered route with ui.link.',
      )
    if ('literal' in r.to && typeof r.to.literal === 'string' && r.to.literal.startsWith('/'))
      ctx.report(
        'TN032',
        null,
        join(at, 'to'),
        `Redirect "${r.from}" targets the internal path "${r.to.literal}" as a string`,
        'Internal URLs are built from route declarations so they stay typed and canonical.',
        { summary: 'Use to: (params) => ui.link(route, params)', snippet: null, patch: null },
      )
  })
  http.headers.forEach((rule, i) => {
    for (const [name, value] of Object.entries(rule.set)) {
      const at = join('', 'http', 'headers', i, 'set', name)
      const why = RESERVED.has(name)
        ? `Header "${name}" is owned by the framework`
        : !TOKEN.test(name)
          ? `Header name "${name}" is not a lowercase token`
          : /[\r\n]/.test(value)
            ? `Header "${name}" has a line break in its value`
            : null
      if (why)
        ctx.report(
          'TN038',
          null,
          at,
          why,
          RESERVED.has(name)
            ? 'It is derived (cache-control, content-type), set by sessions (set-cookie) or configured on the server (content-security-policy).'
            : 'Header names are lowercase tokens and values are one line.',
          { summary: 'Remove the header', snippet: null, patch: [{ op: 'remove', path: at }] },
        )
    }
  })
}
