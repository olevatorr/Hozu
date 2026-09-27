import type { Bindings, Diagnostic, ProjectIR, SourceIndex } from '@hozu/core/ir'
import { Ctx } from './context.ts'
import type { Lockfile } from './contracts/lock.ts'
import { verifyContracts } from './contracts/verify.ts'
import { classNames } from './rules/classes.ts'
import { invalidations, sessions } from './rules/data.ts'
import { domFields } from './rules/dom.ts'
import { endpoints } from './rules/endpoints.ts'
import { declaredErrors } from './rules/errors.ts'
import { conflictingIgnores, unhandledEvents, viewEvents } from './rules/events.ts'
import { progressiveForms } from './rules/forms.ts'
import { unsafeHtml } from './rules/html.ts'
import { httpRules } from './rules/http.ts'
import { i18n } from './rules/i18n.ts'
import { imageDimensions } from './rules/images.ts'
import { internalLinks } from './rules/links.ts'
import { literals } from './rules/literals.ts'
import { paths } from './rules/paths.ts'
import { offlinePage } from './rules/pwa.ts'
import { featureLinks, references, routes } from './rules/refs.ts'
import { rendering } from './rules/rendering.ts'
import { routeParams, searchSchemas } from './rules/routes.ts'
import { deadEnds, reachability, shadowing, stateNames } from './rules/states.ts'
import { domText } from './rules/text.ts'
import { widgetEvents } from './rules/widgets.ts'

export type { Drift, LockEntry, Lockfile } from './contracts/lock.ts'
export { isMechanical, summaryOf } from './contracts/mechanical.ts'
export type { ContractRun, Failure } from './contracts/run.ts'
export { runContract } from './contracts/run.ts'
export type { Impact, ImpactKind, ImpactQuery, ImpactUse } from './impact.ts'
export { impact, UnknownSymbolError } from './impact.ts'
export { closest, distance } from './suggest.ts'

const rules = [
  endpoints,
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
  searchSchemas,
  domFields,
  classNames,
  widgetEvents,
  imageDimensions,
  unsafeHtml,
  literals,
  internalLinks,
  conflictingIgnores,
  domText,
  progressiveForms,
  httpRules,
  i18n,
  offlinePage,
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
  accept?: boolean
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
  const lock = options.bindings
    ? verifyContracts(ctx, options.bindings, options.lock ?? null, options.accept === true)
    : null
  const out = options.feature
    ? ctx.diagnostics.filter((d) => d.location.feature === options.feature)
    : ctx.diagnostics
  return { diagnostics: out.sort(order), lock }
}

export const validate = (ir: ProjectIR, options: ValidateOptions = {}): Diagnostic[] =>
  verify(ir, options).diagnostics
