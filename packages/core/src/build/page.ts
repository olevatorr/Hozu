import type { PageDef } from '../builders/page.ts'
import { join } from '../canonical/pointer.ts'
import type { DiagnosticCode, Fix } from '../ir/diagnostic.ts'
import type { EntriesIR, HeadFailureIR, HeadIR, PageIR, ValueExpr } from '../ir/types.ts'
import { defOf, infoOf } from '../model/decl.ts'
import { exprOf, RecorderError, refProxy } from '../model/expr.ts'
import { type At, FeatureScope, type ProjectScope } from './scope.ts'

export class PageScope extends FeatureScope {
  override report(code: DiagnosticCode, pointer: At, message: string, cause: string, fix: Fix | null = null) {
    this.project.report(code, null, pointer, message, cause, fix)
  }
}

const empty: ValueExpr = { literal: '' }

function head(scope: PageScope, d: PageDef['head'], p: string): HeadIR {
  const params = refProxy('params', 0)
  const query = d.query
    ? {
        ref: scope.ref(d.query, ['query'], join(p, 'query')),
        input: scope.attempt(
          join(p, 'input'),
          () =>
            scope.value(
              d.input ? d.input(params, refProxy('locale', 0), refProxy('search', 0)) : {},
              join(p, 'input'),
            ),
          {
            literal: null,
          },
        ),
      }
    : null
  const failed: Record<string, HeadFailureIR> = {}
  for (const [error, target] of Object.entries(d.failed ?? {})) {
    const rp = join(p, 'failed', error)
    if (target === 403 || target === 404 || target === 410) {
      failed[error] = { status: target }
      continue
    }
    const id = scope.project.routes.get(target as object)
    if (!id)
      scope.report(
        'HZ007',
        rp,
        `head.failed.${error} is neither a registered route nor 403, 404 or 410`,
        'A declared error of the head query redirects (303) to a route without params, or answers 403, 404 or 410.',
      )
    else if (defOf<{ params: unknown }>(target as never).params !== null)
      scope.report(
        'HZ024',
        rp,
        `head.failed.${error} redirects to "${id}", which has params`,
        'A head failure redirects to a route without params.',
      )
    else failed[error] = { redirect: id }
  }
  const fields = scope.attempt(
    join(p, 'render'),
    () => d.render(refProxy('binding', 0), params, refProxy('locale', 0), refProxy('search', 0)),
    null,
  )
  if (!fields)
    return {
      failed,
      query,
      title: empty,
      description: empty,
      type: 'website',
      image: { literal: null },
      published: { literal: null },
      noindex: { literal: false },
    }
  const known = ['title', 'description', 'type', 'image', 'published', 'noindex']
  const keys = exprOf(fields) === null ? Object.keys(fields as object) : []
  for (const key of keys)
    if (!known.includes(key))
      scope.report(
        'HZ014',
        join(p, 'render'),
        `head.render returns "${key}", which is not a head field`,
        `The head is a closed set: ${known.join(', ')}. Open Graph, twitter:card, canonical, hreflang and the JSON-LD are derived from them (hozu docs pages).`,
        { summary: `Remove "${key}"`, snippet: null, patch: null },
      )
  const v = (key: string, x: unknown, absent: unknown = null) =>
    scope.attempt(join(p, key), () => scope.value(x === undefined ? absent : x, join(p, key)), empty)
  if (exprOf(fields) === null && (typeof fields.noindex === 'string' || typeof fields.noindex === 'number'))
    scope.report(
      'HZ014',
      join(p, 'noindex'),
      'head.render returns a noindex that is not a boolean',
      'noindex is true, false or a computed boolean (search.notice !== null); any other value would be silently ignored (ADR 0079 A3).',
      { summary: 'Return a boolean', snippet: 'noindex: search.notice !== null', patch: null },
    )
  if (
    exprOf(fields) === null &&
    fields.type !== undefined &&
    fields.type !== 'article' &&
    fields.type !== 'website'
  )
    scope.report(
      'HZ014',
      join(p, 'type'),
      'head.render returns a computed type',
      "type is 'article' or 'website' as a literal: it decides the page's JSON-LD and Open Graph type (ADR 0079 A3).",
      { summary: "Write type: 'article' or type: 'website'", snippet: "type: 'article'", patch: null },
    )
  return {
    failed,
    query,
    title: v('title', fields.title),
    description: v('description', fields.description, ''),
    type: fields.type === 'article' ? 'article' : 'website',
    image: v('image', fields.image),
    published: v('published', fields.published),
    noindex: v('noindex', fields.noindex, false),
  }
}

function entries(scope: PageScope, d: NonNullable<PageDef['entries']>, p: string): EntriesIR {
  return {
    query: scope.ref(d.query, ['query'], join(p, 'query')),
    input: scope.attempt(join(p, 'input'), () => scope.value(d.input, join(p, 'input')), { literal: null }),
    params: scope.attempt(
      join(p, 'params'),
      () => {
        const out = d.params(refProxy('binding', 0))
        if (out === undefined) throw new RecorderError('entries.params must return the route params')
        return scope.value(out, join(p, 'params'))
      },
      { literal: null },
    ),
    ...(d.lastmod
      ? {
          lastmod: scope.attempt(
            join(p, 'lastmod'),
            () => scope.value(d.lastmod!(refProxy('binding', 0)), join(p, 'lastmod')),
            { literal: null },
          ),
        }
      : {}),
  }
}

export function buildPages(project: ProjectScope, list: unknown[]): Record<string, PageIR> {
  const pages: Record<string, PageIR> = {}
  for (const [i, decl] of list.entries()) {
    const info = infoOf(decl)
    const at = join('', 'pages', i)
    if (info?.kind !== 'page') {
      project.report(
        'HZ014',
        null,
        at,
        'pages must contain ui.page(route, {...})',
        'Unknown value in project({ pages }).',
      )
      continue
    }
    const d = defOf<PageDef>(decl as never)
    const id = project.routes.get(d.route)
    if (!id) {
      project.report(
        'HZ007',
        null,
        at,
        'Page route is not registered in project({ routes })',
        'Pages render registered routes.',
      )
      continue
    }
    const p = join('', 'pages', id)
    if (pages[id]) {
      project.report(
        'HZ013',
        null,
        p,
        `Route "${id}" is rendered by two pages`,
        'Each route has exactly one page.',
      )
      continue
    }
    project.mark(p, decl)
    const scope = new PageScope(project, id)
    const views = d.views.map((v) => {
      const owner = project.owners.get(v)
      if (owner?.kind === 'view') return `${owner.feature}.${owner.symbol}`
      project.report(
        'HZ007',
        null,
        join(p, 'views'),
        'Page view is not declared in any feature',
        'Register the view in a feature views record.',
      )
      return '?'
    })
    pages[id] = {
      views,
      assert: d.assert === 'static' || d.assert === 'cacheable' ? d.assert : null,
      head: head(scope, d.head, join(p, 'head')),
      entries: d.entries ? entries(scope, d.entries, join(p, 'entries')) : null,
    }
  }
  return pages
}
