import { planRoute } from '@tenon/compiler'
import { join } from '@tenon/core/ir'
import type { Ctx } from '../context.ts'

export function offlinePage(ctx: Ctx) {
  const offline = ctx.ir.site?.offline
  if (!offline) return
  const pointer = join('', 'site', 'offline')
  const fix = {
    summary: 'Use a static page without params, or offline: null',
    snippet: null,
    patch: [{ op: 'replace' as const, path: pointer, value: null }],
  }
  const route = ctx.ir.routes[offline]
  if (!route) {
    ctx.report(
      'TN007',
      null,
      pointer,
      'site.offline is not a registered route',
      'Register it in project({ routes }).',
      fix,
    )
    return
  }
  const why =
    route.params !== null
      ? `Offline route "${offline}" has params`
      : !ctx.ir.pages[offline]
        ? `Offline route "${offline}" has no page`
        : !planRoute(ctx.ir, offline).plan.cacheable
          ? `Offline page "${offline}" renders per-request data`
          : null
  if (why)
    ctx.report(
      'TN043',
      null,
      pointer,
      why,
      'The service worker stores the offline page once, so it must be one static page.',
      fix,
    )
}
