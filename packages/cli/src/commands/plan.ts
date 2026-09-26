import { planRoute, softTargets } from '@hozu/compiler'
import { closest } from '@hozu/validator'
import type { PlanOutput } from '../contract.ts'
import { HozuCliError } from '../errors.ts'
import type { Loaded } from '../load.ts'

export function runPlan(loaded: Loaded, route: string | undefined): PlanOutput {
  const { ir } = loaded.build()
  const routes = Object.keys(ir.pages)
  if (!route) throw new HozuCliError('usage', 'Missing <route> argument', routes)
  if (!ir.pages[route]) {
    const guess = closest(route, routes)
    throw new HozuCliError('unknown-feature', `No page renders route "${route}"`, guess ? [guess] : routes)
  }
  return { ...planRoute(ir, route).plan, soft: softTargets(ir, route) }
}

export function describePlan(plan: PlanOutput): string {
  const width = Math.max(...plan.regions.map((r) => r.id.length))
  return [
    `${plan.route}  ${plan.path}  · js: ${plan.js ? `${plan.islands.length} islands` : 'none (0 bytes)'} · cacheable: ${plan.cacheable ? 'yes' : 'no'}${plan.assert ? ` · asserts ${plan.assert}` : ''}`,
    'regions:',
    ...plan.regions.map(
      (r) =>
        `  ${r.id.padEnd(width)}  ${r.mode}${r.seconds === null ? '' : ` ${r.seconds}s`}${r.query ? `  ${r.query} (${r.scope})` : ''}`,
    ),
    'islands:',
    ...(plan.islands.length ? plan.islands.map((i) => `  ${i}`) : ['  (none)']),
    'soft navigation (target route → kept views):',
    ...(Object.keys(plan.soft).length
      ? Object.entries(plan.soft).map(([r, views]) => `  ${r} → ${views.join(', ')}`)
      : ['  (none: links from this page are document navigations)']),
    '',
  ].join('\n')
}
