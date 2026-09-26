import { planRoute } from '@hozu/compiler'
import { join } from '@hozu/core/ir'
import type { Ctx } from '../context.ts'

export function rendering(ctx: Ctx) {
  const reported = new Set<string>()
  for (const [route, page] of Object.entries(ctx.ir.pages)) {
    if (!Object.hasOwn(ctx.ir.routes, route))
      ctx.report(
        'HZ007',
        null,
        join('', 'pages', route),
        `Page for unknown route "${route}"`,
        'Pages render registered routes.',
        {
          summary: 'Remove the page',
          snippet: null,
          patch: [{ op: 'remove', path: join('', 'pages', route) }],
        },
      )
    page.views.forEach((ref, i) => {
      const dot = ref.indexOf('.')
      if (ref === '?' || ctx.ir.features[ref.slice(0, dot)]?.views[ref.slice(dot + 1)]) return
      ctx.report(
        'HZ007',
        null,
        join('', 'pages', route, 'views', i),
        `Page "${route}" renders unknown view "${ref}"`,
        'Pages render views declared in features.',
        {
          summary: 'Remove the view from the page',
          snippet: null,
          patch: [{ op: 'remove', path: join('', 'pages', route, 'views', i) }],
        },
      )
    })
    for (const issue of planRoute(ctx.ir, route).issues) {
      const key = `${issue.code} ${issue.pointer}`
      if (reported.has(key)) continue
      reported.add(key)
      ctx.report(issue.code, issue.feature, issue.pointer, issue.message, issue.cause, {
        summary:
          issue.code === 'HZ022'
            ? "Make the query scope: 'user', or key it by data that does not come from the user"
            : 'Decide which is intended: change the data freshness/scope, or change the assertion',
        snippet: null,
        patch: null,
      })
    }
  }
}
