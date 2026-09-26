import type { PageDef } from '../builders/page.ts'
import { join } from '../canonical/pointer.ts'
import type { DiagnosticCode, Fix } from '../ir/diagnostic.ts'
import type { EntriesIR, HeadIR, PageIR, ValueExpr } from '../ir/types.ts'
import { defOf, infoOf } from '../model/decl.ts'
import { RecorderError, refProxy } from '../model/expr.ts'
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
          () => scope.value(d.input ? d.input(params, refProxy('locale', 0)) : {}, join(p, 'input')),
          {
            literal: null,
          },
        ),
      }
    : null
  const redirects: Record<string, string> = {}
  for (const [error, route] of Object.entries(d.redirects ?? {})) {
    const id = scope.project.routes.get(route as object)
    const rp = join(p, 'redirects', error)
    if (!id)
      scope.report(
        'TN007',
        rp,
        'Redirect target is not a registered route',
        'Register it in project({ routes }).',
      )
    else if (defOf<{ params: unknown }>(route).params !== null)
      scope.report(
        'TN024',
        rp,
        `Redirect target "${id}" has params`,
        'Redirects go to routes without params.',
      )
    else redirects[error] = id
  }
  const fields = scope.attempt(
    join(p, 'render'),
    () => d.render(refProxy('binding', 0), params, refProxy('locale', 0)),
    null,
  )
  if (!fields)
    return {
      redirects,
      query,
      title: empty,
      description: empty,
      type: 'website',
      image: { literal: null },
      published: { literal: null },
      noindex: false,
    }
  const v = (key: string, x: unknown, absent: unknown = null) =>
    scope.attempt(join(p, key), () => scope.value(x === undefined ? absent : x, join(p, key)), empty)
  return {
    redirects,
    query,
    title: v('title', fields.title),
    description: v('description', fields.description, ''),
    type: fields.type === 'article' ? 'article' : 'website',
    image: v('image', fields.image),
    published: v('published', fields.published),
    noindex: fields.noindex === true,
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
  }
}

export function buildPages(project: ProjectScope, list: unknown[]): Record<string, PageIR> {
  const pages: Record<string, PageIR> = {}
  for (const [i, decl] of list.entries()) {
    const info = infoOf(decl)
    const at = join('', 'pages', i)
    if (info?.kind !== 'page') {
      project.report(
        'TN014',
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
        'TN007',
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
        'TN013',
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
        'TN007',
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
