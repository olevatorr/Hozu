import type { Diagnostic, ProjectIR, SourceIndex } from '@tenon/core/ir'
import { Ctx } from './context.ts'
import { declaredErrors } from './rules/errors.ts'
import { unhandledEvents, viewEvents } from './rules/events.ts'
import { paths } from './rules/paths.ts'
import { featureLinks, references, routes } from './rules/refs.ts'
import { deadEnds, reachability, shadowing, stateNames } from './rules/states.ts'

export { closest, distance } from './suggest.ts'

const rules = [
  featureLinks,
  references,
  routes,
  stateNames,
  reachability,
  unhandledEvents,
  declaredErrors,
  viewEvents,
  paths,
  shadowing,
  deadEnds,
]

const order = (a: Diagnostic, b: Diagnostic) =>
  (a.location.feature ?? '').localeCompare(b.location.feature ?? '') ||
  a.location.pointer.localeCompare(b.location.pointer) ||
  a.code.localeCompare(b.code)

export interface ValidateOptions {
  sources?: SourceIndex
  feature?: string
}

export function validate(ir: ProjectIR, options: ValidateOptions = {}): Diagnostic[] {
  const ctx = new Ctx(ir, options.sources ?? {})
  for (const rule of rules) rule(ctx)
  const out = options.feature
    ? ctx.diagnostics.filter((d) => d.location.feature === options.feature)
    : ctx.diagnostics
  return out.sort(order)
}
