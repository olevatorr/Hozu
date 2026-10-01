import type { Bindings, Diagnostic, ProjectIR, SourceIndex } from '@hozu/core/ir'
import type { ClassStyle } from './context.ts'
import { Ctx } from './context.ts'
import type { LockfileV2 } from './contracts/record.ts'
import { verifyContracts } from './contracts/verify.ts'
import { classNames } from './rules/classes.ts'
import { componentEmits } from './rules/clients.ts'
import { getEndpointWrites, invalidations, queryFreshness, sessions } from './rules/data.ts'
import { domFields } from './rules/dom.ts'
import { endpointLinks, endpoints } from './rules/endpoints.ts'
import { declaredErrors } from './rules/errors.ts'
import { conflictingIgnores, unhandledEvents, viewEvents } from './rules/events.ts'
import { formFields, progressiveForms } from './rules/forms.ts'
import { unsafeHtml } from './rules/html.ts'
import { httpRules } from './rules/http.ts'
import { i18n } from './rules/i18n.ts'
import { imageDimensions } from './rules/images.ts'
import { internalLinks } from './rules/links.ts'
import { literals } from './rules/literals.ts'
import { headFailures, unservedRoutes } from './rules/pages.ts'
import { paths } from './rules/paths.ts'
import { offlinePage } from './rules/pwa.ts'
import { featureLinks, references, routes } from './rules/refs.ts'
import { rendering } from './rules/rendering.ts'
import { routeParams, searchSchemas } from './rules/routes.ts'
import { seed } from './rules/seed.ts'
import { deadEnds, reachability, shadowing, stateNames } from './rules/states.ts'
import { classConflicts, componentStyles, leadingImportant } from './rules/styles.ts'
import { domText } from './rules/text.ts'

export type { ClassStyle } from './context.ts'
export type { ChangeKind, LockChange } from './contracts/lock.ts'
export { decides, summaryOf } from './contracts/mechanical.ts'
export type {
  BehaviorRecord,
  EndpointLockV2,
  EnteredRecord,
  LockEntryV2,
  LockfileV2,
  PagesLockV2,
} from './contracts/record.ts'
export { behaviorOf, contractHash, recordOf } from './contracts/record.ts'
export type { ContractRun, Failure } from './contracts/run.ts'
export { runContract } from './contracts/run.ts'
export type { Impact, ImpactKind, ImpactQuery, ImpactUse } from './impact.ts'
export { impact, UnknownSymbolError } from './impact.ts'
export { classVariant, exclusive, important } from './rules/styles.ts'
export { closest, distance } from './suggest.ts'

const rules = [
  endpoints,
  seed,
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
  queryFreshness,
  getEndpointWrites,
  rendering,
  routeParams,
  searchSchemas,
  domFields,
  classNames,
  leadingImportant,
  classConflicts,
  componentStyles,
  componentEmits,
  imageDimensions,
  unsafeHtml,
  literals,
  internalLinks,
  conflictingIgnores,
  domText,
  progressiveForms,
  formFields,
  httpRules,
  i18n,
  offlinePage,
  headFailures,
  unservedRoutes,
  endpointLinks,
]

const order = (a: Diagnostic, b: Diagnostic) =>
  (a.location.feature ?? '').localeCompare(b.location.feature ?? '') ||
  a.location.pointer.localeCompare(b.location.pointer) ||
  a.code.localeCompare(b.code)

export interface ValidateOptions {
  sources?: SourceIndex
  feature?: string
  bindings?: Bindings
  /** The parsed hozu.lock.json, `null` when the file is missing; omit it to skip the lock review. */
  lock?: unknown
  accept?: boolean
  unknownClasses?: Map<string, string | null> | null
  /** CSS properties per class from the CSS stage (`compileStyles(...).classes`); HZ072, HZ075–HZ077 and HZ079 need it. */
  classes?: Map<string, ClassStyle> | null
}

export interface Verification {
  diagnostics: Diagnostic[]
  lock: LockfileV2 | null
}

export function verify(ir: ProjectIR, options: ValidateOptions = {}): Verification {
  const ctx = new Ctx(
    ir,
    options.sources ?? {},
    options.unknownClasses ?? null,
    options.bindings?.assets ?? {},
  )
  ctx.classes = options.classes ?? null
  ctx.components = options.bindings?.components ?? null
  for (const rule of rules) rule(ctx)
  const lock = options.bindings
    ? verifyContracts(ctx, options.bindings, options.lock, options.accept === true)
    : null
  const out = options.feature
    ? ctx.diagnostics.filter((d) => d.location.feature === options.feature)
    : ctx.diagnostics
  return { diagnostics: out.sort(order), lock }
}

export const validate = (ir: ProjectIR, options: ValidateOptions = {}): Diagnostic[] =>
  verify(ir, options).diagnostics
