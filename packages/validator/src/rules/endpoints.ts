import {
  at,
  type JsonSchema,
  localePath,
  resolveAt,
  routePattern,
  type ValueExpr,
  type ViewNode,
} from '@hozu/core/ir'
import type { Ctx } from '../context.ts'
import { closest, didYouMean } from '../suggest.ts'
import { featurePointer, walkView } from '../walk.ts'
import { scalar } from './routes.ts'

const STATIC = /^\/$|^(\/[A-Za-z0-9._~-]+)+$/

export function endpoints(ctx: Ctx) {
  const taken = new Map<string, string>()
  const locales = ctx.ir.site?.locales ?? [null]
  const pages = Object.keys(ctx.ir.pages)
    .map((r) => ctx.ir.routes[r]?.path)
    .filter((p): p is string => p !== undefined)
    .flatMap((p) => locales.map((l) => localePath(ctx.ir, p, l)))
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
          {
            summary: "Use method: 'POST' for a write, or 'GET' for a read",
            snippet: "method: 'POST',",
            patch: [
              {
                op: 'replace',
                path: resolveAt(featurePointer(f.id, 'endpoints', sym, 'method')),
                value: 'POST',
              },
            ],
          },
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

const CONTROLS = new Set(['input', 'select', 'textarea', 'button'])

function fieldNames(node: ViewNode, out: Set<string>) {
  const kids: ViewNode[] =
    node.kind === 'el' || node.kind === 'when' || node.kind === 'widget'
      ? node.children
      : node.kind === 'if'
        ? [...node.ifTrue, ...node.ifFalse]
        : node.kind === 'each'
          ? [node.item]
          : node.kind === 'query'
            ? [node.ready, ...(node.pending ? [node.pending] : []), ...Object.values(node.failed)]
            : []
  if (node.kind === 'el' && CONTROLS.has(node.tag)) {
    const name = node.attrs.name
    if (name && 'literal' in name && typeof name.literal === 'string') out.add(name.literal)
  }
  for (const k of kids) fieldNames(k, out)
}

const literalOf = (v: ValueExpr | undefined) => (v && 'literal' in v ? v.literal : undefined)

export function endpointLinks(ctx: Ctx) {
  const { ir } = ctx
  const flagged = new Set<string>()
  for (const f of Object.values(ir.features)) {
    for (const [sym, e] of Object.entries(f.endpoints)) {
      const ref = `${f.id}.${sym}`
      const declared = Object.keys(e.errors ?? {})
      const failed = e.failed ?? {}
      const at0 = featurePointer(f.id, 'endpoints', sym, 'failed')
      const missing = declared.filter((n) => !(n in failed))
      if (missing.length)
        ctx.report(
          'HZ046',
          f.id,
          at0,
          `Endpoint ${ref} does not map ${missing.map((n) => `"${n}"`).join(', ')} to a status`,
          'Every declared endpoint error answers the status failed names; there is no default status.',
          {
            summary: `Add ${missing.join(', ')} to failed`,
            snippet: `failed: { ${declared.map((n) => `${n}: ${failed[n] ?? '400 | 401 | 403 | 404 | 409 | 410 | 422 | 429'}`).join(', ')} }`,
            patch: null,
          },
        )
      for (const n of Object.keys(failed).filter((k) => !declared.includes(k)))
        ctx.report(
          'HZ046',
          f.id,
          featurePointer(f.id, 'endpoints', sym, 'failed', n),
          `Endpoint ${ref} maps "${n}", which it does not declare in errors`,
          'failed maps the declared errors; Invalid (400) and Unexpected (500) belong to the framework.',
          {
            summary: `Remove "${n}" from failed`,
            snippet: null,
            patch: [{ op: 'remove', path: resolveAt(featurePointer(f.id, 'endpoints', sym, 'failed', n)) }],
          },
        )
      if (e.raw && e.method === 'GET')
        ctx.report(
          'HZ046',
          f.id,
          featurePointer(f.id, 'endpoints', sym, 'method'),
          `Endpoint ${ref} reads a raw body on GET`,
          "input: 'raw' is the request body, and a GET request has none.",
          {
            summary: "Use method: 'POST'",
            snippet: null,
            patch: [
              {
                op: 'replace',
                path: resolveAt(featurePointer(f.id, 'endpoints', sym, 'method')),
                value: 'POST',
              },
            ],
          },
        )
    }
    for (const [vid, view] of Object.entries(f.views))
      walkView(ir, f, vid, view, ({ node, pointer }) => {
        if (node.kind !== 'el') return
        for (const attr of ['href', 'action', 'formaction'] as const) {
          const v = node.attrs[attr]
          if (!v || !('endpoint' in v)) continue
          const [fid, sym] = [
            v.endpoint.slice(0, v.endpoint.indexOf('.')),
            v.endpoint.slice(v.endpoint.indexOf('.') + 1),
          ]
          const e = ir.features[fid]?.endpoints[sym]
          if (!e) continue
          const p = at(pointer, 'attrs', attr)
          const schema = ir.features[fid]!.schemas[e.input]
          if (e.method === 'GET') {
            const props = (schema?.properties ?? {}) as Record<string, JsonSchema>
            const flat = schema?.type === 'object' && Object.values(props).every(scalar)
            if (!flat && !flagged.has(v.endpoint)) {
              flagged.add(v.endpoint)
              ctx.report(
                'HZ035',
                fid,
                featurePointer(fid, 'endpoints', sym, 'input'),
                `Endpoint ${v.endpoint} is linked with ui.link, but its input is not a flat object of scalars`,
                'A GET link carries its input in the query string, a flat list of named values.',
                {
                  summary: 'Make every input property a string, number, boolean or enum',
                  snippet: null,
                  patch: null,
                },
              )
            }
            continue
          }
          if (attr === 'href') {
            ctx.report(
              'HZ046',
              f.id,
              p,
              `A link targets the POST endpoint ${v.endpoint}`,
              'Following a link sends GET; a POST endpoint is the action of a native form.',
              {
                summary: 'Put ui.link(endpoint) in form.action, or declare the endpoint with method GET',
                snippet: `ui.form({ method: 'post', action: ui.link(${sym}) }, [...])`,
                patch: null,
              },
            )
            continue
          }
          const method = literalOf(node.attrs[attr === 'action' ? 'method' : 'formmethod'])
          if (attr === 'action' && String(method ?? 'get').toLowerCase() !== 'post')
            ctx.report(
              'HZ046',
              f.id,
              at(pointer, 'attrs', 'method'),
              `The form posts to ${v.endpoint} but its method is ${method ?? 'GET (the default)'}`,
              'A POST endpoint answers only POST.',
              {
                summary: "Set method: 'post'",
                snippet: null,
                patch: [
                  { op: 'add', path: resolveAt(at(pointer, 'attrs', 'method')), value: { literal: 'post' } },
                ],
              },
            )
          if (attr !== 'action' || e.raw) continue
          const known = Object.keys((schema?.properties ?? {}) as object)
          const names = new Set<string>()
          fieldNames(node, names)
          for (const name of names) {
            const guess = closest(name, known)
            if (!known.includes(name))
              ctx.report(
                'HZ046',
                f.id,
                p,
                `The form posting to ${v.endpoint} has a field "${name}" its input does not declare.${didYouMean(guess)}`,
                'A native form sends every named control; the endpoint input schema decides which ones exist.',
                {
                  summary: known.length
                    ? `Rename the field to one of ${known.join(', ')}, or add "${name}" to the input`
                    : `Declare "${name}" in the endpoint input: it has no named fields${schema?.additionalProperties ? ' (a record input cannot be filled by name)' : ''}`,
                  snippet: guess ? `name: '${guess}'` : `input: z.object({ ${name}: z.string() }),`,
                  patch: null,
                },
              )
          }
        }
      })
  }
}
