import type { Bindings, Diagnostic, ProjectIR, SourceIndex } from '@tenon/core/ir'
import { Ctx } from './context.ts'
import type { Lockfile } from './contracts/lock.ts'
import { verifyContracts } from './contracts/verify.ts'
import { classNames } from './rules/classes.ts'
import { invalidations, sessions } from './rules/data.ts'
import { domFields } from './rules/dom.ts'
import { declaredErrors } from './rules/errors.ts'
import { unhandledEvents, viewEvents } from './rules/events.ts'
import { unsafeHtml } from './rules/html.ts'
import { imageDimensions } from './rules/images.ts'
import { paths } from './rules/paths.ts'
import { featureLinks, references, routes } from './rules/refs.ts'
import { rendering } from './rules/rendering.ts'
import { routeParams } from './rules/routes.ts'
import { deadEnds, reachability, shadowing, stateNames } from './rules/states.ts'
import { widgetEvents } from './rules/widgets.ts'

export type { Drift, LockEntry, Lockfile } from './contracts/lock.ts'
export type { ContractRun, Failure } from './contracts/run.ts'
export { runContract } from './contracts/run.ts'
export type { Impact, ImpactKind, ImpactQuery, ImpactUse } from './impact.ts'
export { impact, UnknownSymbolError } from './impact.ts'
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
  invalidations,
  sessions,
  rendering,
  routeParams,
  domFields,
  classNames,
  widgetEvents,
  imageDimensions,
  unsafeHtml,
]

const order = (a: Diagnostic, b: Diagnostic) =>
  (a.location.feature ?? '').localeCompare(b.location.feature ?? '') ||
  a.location.pointer.localeCompare(b.location.pointer) ||
  a.code.localeCompare(b.code)

export interface ValidateOptions {
  sources?: SourceIndex
  feature?: string
  bindings?: Bindings
  lock?: Lockfile | null
  unknownClasses?: Map<string, string | null> | null
}

export interface Verification {
  diagnostics: Diagnostic[]
  lock: Lockfile | null
}

export function verify(ir: ProjectIR, options: ValidateOptions = {}): Verification {
  const ctx = new Ctx(
    ir,
    options.sources ?? {},
    options.unknownClasses ?? null,
    options.bindings?.assets ?? {},
  )
  for (const rule of rules) rule(ctx)
  const lock = options.bindings ? verifyContracts(ctx, options.bindings, options.lock ?? null) : null
  const out = options.feature
    ? ctx.diagnostics.filter((d) => d.location.feature === options.feature)
    : ctx.diagnostics
  return { diagnostics: out.sort(order), lock }
}

export const validate = (ir: ProjectIR, options: ValidateOptions = {}): Diagnostic[] =>
  verify(ir, options).diagnostics
