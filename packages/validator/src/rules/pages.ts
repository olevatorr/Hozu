import { type Json, join, type ValueExpr } from '@hozu/core/ir'
import type { Ctx } from '../context.ts'

const choice = (error: string, signIn: string | null) =>
  /^(Unauthori[sz]ed|Unauthenticated|SignedOut|NotSignedIn)$/.test(error)
    ? (signIn ?? '<a sign-in route without params>')
    : /^Forbidden/.test(error)
      ? '403'
      : /^(NotFound|Missing|Unknown)/.test(error)
        ? '404'
        : /^(Gone|Deleted|Removed)/.test(error)
          ? '410'
          : '<route> | 403 | 404 | 410'

export function headFailures(ctx: Ctx) {
  const { ir } = ctx
  const signIn =
    Object.keys(ir.routes).find((id) => /login|signin|sign-in/i.test(ir.routes[id]!.path)) ?? null
  for (const [id, page] of Object.entries(ir.pages)) {
    const ref = page.head.query?.ref ?? null
    const dot = ref?.indexOf('.') ?? -1
    const query = ref ? ir.features[ref.slice(0, dot)]?.queries[ref.slice(dot + 1)] : undefined
    const declared = Object.keys(query?.errors ?? {})
    const mapped = Object.keys(page.head.failed)
    const at = join('', 'pages', id, 'head', 'failed')
    const missing = declared.filter((e) => !(e in page.head.failed))
    if (missing.length)
      ctx.report(
        'HZ051',
        null,
        at,
        `head.failed of page "${id}" does not map ${missing.map((e) => `"${e}"`).join(', ')} of ${ref}`,
        'Every declared error of the head query decides the page: a redirect (303) to a route without params, or 403, 404 or 410. Which one is an intent decision, so there is no default.',
        {
          summary: `Map ${missing.join(', ')} in head.failed`,
          snippet: `failed: { ${declared.map((e) => `${e}: ${mapped.includes(e) ? '…' : choice(e, signIn)}`).join(', ')} }`,
          patch: null,
        },
      )
    for (const e of mapped.filter((m) => !declared.includes(m)))
      ctx.report(
        'HZ051',
        null,
        join(at, e),
        e === 'Unexpected'
          ? `head.failed of page "${id}" maps Unexpected`
          : `head.failed of page "${id}" maps "${e}", which ${ref ?? 'the page (no head query)'} does not declare`,
        e === 'Unexpected'
          ? 'Unexpected always answers 500; only declared errors are mapped.'
          : 'head.failed maps the declared errors of the head query, and nothing else.',
        { summary: `Remove "${e}" from head.failed`, snippet: null, patch: null },
      )
  }
}

type Site = { pointer: string; value: { link: string; search: ValueExpr } }

function linkSites(node: Json, pointer: string, id: string, out: Site[]) {
  if (Array.isArray(node)) node.forEach((x, i) => linkSites(x, join(pointer, i), id, out))
  else if (node && typeof node === 'object') {
    if (node.link === id && 'params' in node) out.push({ pointer, value: node as never })
    for (const [k, v] of Object.entries(node)) linkSites(v, join(pointer, k), id, out)
  }
}

export function unservedRoutes(ctx: Ctx) {
  const { ir } = ctx
  const endpoints = Object.values(ir.features).flatMap((f) =>
    Object.entries(f.endpoints).map(([sym, e]) => ({ ref: `${f.id}.${sym}`, ...e })),
  )
  for (const [id, r] of Object.entries(ir.routes)) {
    if (ir.pages[id]) continue
    const sites: Site[] = []
    linkSites(ir.features as unknown as Json, join('', 'features'), id, sites)
    linkSites(ir.http.redirects as unknown as Json, join('', 'http', 'redirects'), id, sites)
    const endpoint = endpoints.find((e) => e.method === 'GET' && e.path === r.path)
    const movable = endpoint && endpoint.mode !== 'response'
    const at = join('', 'routes', id)
    ctx.report(
      'HZ052',
      null,
      at,
      `Route "${id}" (${r.path}) is rendered by no page`,
      endpoint
        ? `Its path is the endpoint ${endpoint.ref}; links to an endpoint are ui.link(endpoint, input), not a route.`
        : 'A route names a page; a link to it would answer 404.',
      movable
        ? {
            summary: `Link to the endpoint with ui.link(${endpoint.ref.split('.')[1]}, input) and remove the route`,
            snippet: null,
            patch: [
              ...sites.map((s) => ({
                op: 'replace' as const,
                path: s.pointer,
                value: {
                  endpoint: endpoint.ref,
                  input:
                    'literal' in s.value.search && s.value.search.literal === null
                      ? { literal: {} }
                      : s.value.search,
                } as unknown as Json,
              })),
              { op: 'remove' as const, path: at },
            ],
          }
        : endpoint
          ? {
              summary: `Make ${r.path} a ui.page with head.failed for the statuses it answers, instead of an endpoint that returns a page`,
              snippet: `ui.page(${id}, { views: [...], head: { query, input, render, failed: { Forbidden: 403 } } })`,
              patch: null,
            }
          : sites.length
            ? {
                summary: `Add ui.page(${id}, { views, head }) to project({ pages }), or link elsewhere`,
                snippet: `ui.page(${id}, { views: [...], head: { render: () => ({ title: '…' }) } })`,
                patch: null,
              }
            : {
                summary: `Remove the unused route "${id}"`,
                snippet: null,
                patch: [{ op: 'remove', path: at }],
              },
    )
  }
}
