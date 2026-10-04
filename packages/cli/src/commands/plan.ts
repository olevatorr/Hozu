import { planRoute } from '@hozu/compiler'
import { routePattern } from '@hozu/core/ir'
import { closest } from '@hozu/validator'
import type { PlanOutput } from '../contract.ts'
import { HozuCliError } from '../errors.ts'
import type { Loaded } from '../load.ts'

export function runPlan(loaded: Loaded, route: string | undefined): PlanOutput {
  const { ir } = loaded.build()
  const routes = Object.keys(ir.pages)
  if (!route) throw new HozuCliError('usage', 'Missing <route> argument', routes)
  if (route.startsWith('/')) {
    const path = route.split(/[?#]/)[0]!
    const found = routes.find((id) => routePattern(ir.routes[id]?.path ?? '').pattern.test(path))
    if (!found)
      throw new HozuCliError(
        'unknown-feature',
        `No page renders the path "${path}"`,
        routes.map((id) => `${id}  ${ir.routes[id]?.path}`),
      )
    return planRoute(ir, found).plan
  }
  if (!ir.pages[route]) {
    const guess = closest(route, routes)
    throw new HozuCliError('unknown-feature', `No page renders route "${route}"`, guess ? [guess] : routes)
  }
  return planRoute(ir, route).plan
}

export function describePlan(plan: PlanOutput): string {
  const width = Math.max(...plan.regions.map((r) => r.id.length))
  return [
    `${plan.route}  ${plan.path}  · js: ${plan.js ? `${plan.islands.length} ${plan.islands.length === 1 ? 'island' : 'islands'} (${plan.js === 'always' ? 'always' : 'only when rendered'})` : 'none (0 bytes)'} · cacheable: ${plan.cacheable ? 'yes' : 'no'}${plan.assert ? ` · asserts ${plan.assert}` : ''}`,
    'regions:',
    ...plan.regions.map(
      (r) =>
        `  ${r.id.padEnd(width)}  ${r.mode}${r.seconds === null ? '' : ` ${r.seconds}s`}${r.query ? `  ${r.query} (${r.scope})` : ''}`,
    ),
    'islands:',
    ...(plan.islands.length ? plan.islands.map((i) => `  ${i}`) : ['  (none)']),
    '',
  ].join('\n')
}
