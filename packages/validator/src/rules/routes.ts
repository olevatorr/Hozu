import { anyRef, type JsonSchema, join, routePattern, type ValueExpr } from '@hozu/core/ir'
import type { Ctx } from '../context.ts'
import { resolveRef } from '../resolve.ts'

const placeholders = (path: string) =>
  routePattern(path)
    .keys.map((k) => k.name)
    .sort()

const nullable = (s: JsonSchema): boolean =>
  (Array.isArray(s.type) && s.type.includes('null')) ||
  (['anyOf', 'oneOf'] as const).some(
    (k) => Array.isArray(s[k]) && (s[k] as JsonSchema[]).some((v) => v.type === 'null'),
  )

const keysOf = (schema: JsonSchema | null) =>
  schema && typeof schema.properties === 'object' && schema.properties
    ? Object.keys(schema.properties).sort()
    : []

const readsParams = (v: ValueExpr): boolean => anyRef(v, (r) => r.ref === 'params')

export function routeParams(ctx: Ctx) {
  const { ir } = ctx
  for (const [id, route] of Object.entries(ir.routes)) {
    const want = placeholders(route.path)
    const have = keysOf(route.params)
    if (want.join() !== have.join())
      ctx.report(
        'HZ024',
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
    const props = (route.params?.properties ?? {}) as Record<string, JsonSchema>
    for (const { name, mod } of routePattern(route.path).keys) {
      const p = props[name]
      if (!p) continue
      const many = mod === '+' || mod === '*'
      const wrong = many ? p.type !== 'array' : mod === '?' ? !nullable(p) : p.type === 'array'
      if (!wrong) continue
      const pointer = join('', 'routes', id, 'params', 'properties', name)
      const value = many
        ? { type: 'array', items: { type: 'string' }, ...(mod === '+' ? { minItems: 1 } : {}) }
        : mod === '?'
          ? { anyOf: [p, { type: 'null' }] }
          : { type: 'string' }
      ctx.report(
        'HZ024',
        null,
        pointer,
        `Param "${name}" of ${route.path} is ${many ? 'several segments' : mod === '?' ? 'optional' : 'one segment'}, but its schema does not say so`,
        ':name is a string, :name? a nullable string, :name+ and :name* an array of strings.',
        {
          summary: many ? 'z.array(z.string())' : mod === '?' ? 'Add .nullable()' : 'z.string()',
          snippet: null,
          patch: [{ op: 'replace', path: pointer, value }],
        },
      )
    }
  }
  for (const [route, page] of Object.entries(ir.pages)) {
    page.views.forEach((ref, i) => {
      const dot = ref.indexOf('.')
      const view = ir.features[ref.slice(0, dot)]?.views[ref.slice(dot + 1)]
      if (view?.route && view.route !== '?' && view.route !== route)
        ctx.report(
          'HZ024',
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
        'HZ024',
        null,
        join('', 'pages', route, 'head'),
        `The head of "${route}" reads params, but the route has none`,
        'Only parameterized routes have params.',
        null,
      )
    if (h.query && h.query.ref !== '?' && !resolveRef(ir, h.query.ref, 'query'))
      ctx.report(
        'HZ003',
        null,
        join('', 'pages', route, 'head', 'query'),
        `Unknown query "${h.query.ref}" in page head`,
        'Head data comes from a declared query.',
        null,
      )
    if (params && !page.entries)
      ctx.report(
        'HZ025',
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
        'HZ003',
        null,
        join('', 'pages', route, 'entries', 'query'),
        `Unknown query "${page.entries.query}" in page entries`,
        'Entries come from a declared query.',
        null,
      )
  }
}

export const scalar = (s: JsonSchema): boolean => {
  if (Array.isArray(s.enum) || 'const' in s) return true
  for (const k of ['anyOf', 'oneOf'] as const)
    if (Array.isArray(s[k])) return (s[k] as JsonSchema[]).every((v) => v.type === 'null' || scalar(v))
  const types = typeof s.type === 'string' ? [s.type] : Array.isArray(s.type) ? (s.type as string[]) : []
  return (
    types.length > 0 && types.every((t) => ['string', 'number', 'integer', 'boolean', 'null'].includes(t))
  )
}

const optional = (s: JsonSchema): boolean =>
  'default' in s ||
  (Array.isArray(s.type) && s.type.includes('null')) ||
  (['anyOf', 'oneOf'] as const).some(
    (k) => Array.isArray(s[k]) && (s[k] as JsonSchema[]).some((v) => v.type === 'null'),
  )

export function searchSchemas(ctx: Ctx) {
  for (const [id, route] of Object.entries(ctx.ir.routes)) {
    const s = route.search
    if (!s) continue
    const props = (s.properties ?? {}) as Record<string, JsonSchema>
    if (s.type !== 'object' || !Object.keys(props).length) {
      ctx.report(
        'HZ035',
        null,
        join('', 'routes', id, 'search'),
        `Route "${id}" declares a search schema that is not a flat object`,
        'A query string is a flat list of named values.',
        { summary: 'Use z.object({ key: scalar.default(…) }) or search: null', snippet: null, patch: null },
      )
      continue
    }
    for (const [key, p] of Object.entries(props)) {
      const pointer = join('', 'routes', id, 'search', 'properties', key)
      if (!scalar(p))
        ctx.report(
          'HZ035',
          null,
          pointer,
          `Search param "${key}" of route "${id}" is not a string, number, boolean or enum`,
          'Query string values are single scalars.',
          { summary: `Make "${key}" a scalar or an enum`, snippet: null, patch: null },
        )
      else if (!optional(p))
        ctx.report(
          'HZ035',
          null,
          pointer,
          `Search param "${key}" of route "${id}" has no default`,
          'A URL may omit any search param, so each one needs a default (or null).',
          {
            summary: `Give "${key}" a default with .default(…), or make it nullable`,
            snippet: `${key}: <schema>.default(…)`,
            patch: [{ op: 'replace', path: pointer, value: { anyOf: [p, { type: 'null' }] } }],
          },
        )
    }
  }
}
