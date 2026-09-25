import { type JsonSchema, join, type ValueExpr } from '@tenon/core/ir'
import type { Ctx } from '../context.ts'
import { resolveRef } from '../resolve.ts'

const placeholders = (path: string) =>
  [...path.matchAll(/:([A-Za-z][A-Za-z0-9_]*)/g)].map((m) => m[1]!).sort()

const keysOf = (schema: JsonSchema | null) =>
  schema && typeof schema.properties === 'object' && schema.properties
    ? Object.keys(schema.properties).sort()
    : []

const readsParams = (v: ValueExpr): boolean =>
  'ref' in v
    ? v.ref === 'params'
    : 'object' in v
      ? Object.values(v.object).some(readsParams)
      : 'fn' in v
        ? readsParams(v.arg)
        : false

export function routeParams(ctx: Ctx) {
  const { ir } = ctx
  for (const [id, route] of Object.entries(ir.routes)) {
    const want = placeholders(route.path)
    const have = keysOf(route.params)
    if (want.join() !== have.join())
      ctx.report(
        'TN024',
        null,
        join('', 'routes', id, 'params'),
        `Route "${id}" (${route.path}) declares params [${have.join(', ')}] but its path has [${want.join(', ')}]`,
        'Every :placeholder must be a params key and every params key must appear in the path.',
        {
          summary: 'Make the params schema keys match the path placeholders',
          snippet: null,
          patch: null,
        },
      )
  }
  for (const [route, page] of Object.entries(ir.pages)) {
    page.views.forEach((ref, i) => {
      const dot = ref.indexOf('.')
      const view = ir.features[ref.slice(0, dot)]?.views[ref.slice(dot + 1)]
      if (view?.route && view.route !== '?' && view.route !== route)
        ctx.report(
          'TN024',
          null,
          join('', 'pages', route, 'views', i),
          `View ${ref} is bound to route "${view.route}" but rendered on "${route}"`,
          'A view reads the params of the route it is bound to.',
          {
            summary: `Render it on "${view.route}", or bind it to "${route}"`,
            snippet: null,
            patch: null,
          },
        )
    })
    const h = page.head
    const params = ir.routes[route]?.params ?? null
    const values = [h.title, h.description, h.image, h.published, ...(h.query ? [h.query.input] : [])]
    if (!params && values.some(readsParams))
      ctx.report(
        'TN024',
        null,
        join('', 'pages', route, 'head'),
        `The head of "${route}" reads params, but the route has none`,
        'Only parameterized routes have params.',
        null,
      )
    if (h.query && h.query.ref !== '?' && !resolveRef(ir, h.query.ref, 'query'))
      ctx.report(
        'TN003',
        null,
        join('', 'pages', route, 'head', 'query'),
        `Unknown query "${h.query.ref}" in page head`,
        'Head data comes from a declared query.',
        null,
      )
    if (params && !page.entries)
      ctx.report(
        'TN025',
        null,
        join('', 'pages', route, 'entries'),
        `Page "${route}" has params but no entries`,
        'Without entries the page is missing from sitemap.xml and from static export; it still renders on request.',
        {
          summary: 'Enumerate the pages from a query',
          snippet: 'entries: { query: listThings, input: {}, params: (thing) => ({ id: thing.id }) }',
          patch: null,
        },
      )
    if (page.entries && page.entries.query !== '?' && !resolveRef(ir, page.entries.query, 'query'))
      ctx.report(
        'TN003',
        null,
        join('', 'pages', route, 'entries', 'query'),
        `Unknown query "${page.entries.query}" in page entries`,
        'Entries come from a declared query.',
        null,
      )
  }
}
