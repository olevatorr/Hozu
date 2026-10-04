import {
  type AssignOp,
  type ContractIR,
  type EndpointMode,
  type EndpointStatus,
  type FeatureIR,
  foldSearch,
  type GuardExpr,
  type HeadFailureIR,
  hashJson,
  type Json,
  type ProjectIR,
  searchDefaults,
  type ValueExpr,
} from '@hozu/core/ir'
import { resolveRef } from '../resolve.ts'
import { guardRefs, valueRefs } from '../sites.ts'
import { locate } from './mechanical.ts'

export interface EnteredRecord {
  state: string
  effect: string | null
  input: ValueExpr | null
  timers: number[]
  final: boolean
}

export interface BehaviorRecord {
  guard: GuardExpr | null
  assign: AssignOp[]
  navigate: ValueExpr | null
  enters: EnteredRecord
  fns: Record<string, string | null>
}

export interface LockEntryV2 {
  behavior: string
  summary: string
  decides: boolean
  fields: BehaviorRecord
  contracts: Record<string, string>
}

export interface EndpointLockV2 {
  mode: EndpointMode
  failed: Record<string, EndpointStatus>
}

export interface PagesLockV2 {
  head: Record<string, Record<string, HeadFailureIR>>
  endpoints: Record<string, EndpointLockV2>
  redirects: Record<string, { to: string; permanent: boolean }>
  /** Declared access per effect (ADR 0056 B); absent in locks written before 0.15. */
  access?: Record<string, string>
}

export interface LockfileV2 {
  version: 2
  features: Record<string, Record<string, LockEntryV2>>
  pages: PagesLockV2
}

function foldLinks(ir: ProjectIR, v: ValueExpr): ValueExpr {
  if ('link' in v)
    return {
      link: v.link,
      params: foldLinks(ir, v.params),
      search: foldSearch(foldLinks(ir, v.search), searchDefaults(ir.routes[v.link]?.search ?? null)),
    }
  if ('object' in v)
    return { object: Object.fromEntries(Object.entries(v.object).map(([k, x]) => [k, foldLinks(ir, x)])) }
  if ('fn' in v) return { fn: v.fn, arg: foldLinks(ir, v.arg) }
  return v
}

export function recordOf(ir: ProjectIR, feature: FeatureIR, id: string): BehaviorRecord {
  const { transition, target } = locate(feature, id)
  const refs = new Set<string>()
  const collect = (ref: string) => refs.add(ref)
  if (transition.guard) guardRefs(transition.guard, '', collect)
  for (const a of transition.assign) valueRefs(a.value, '', collect)
  if (transition.navigate) valueRefs(transition.navigate, '', collect)
  if (target?.invoke) valueRefs(target.invoke.input, '', collect)
  const fns: Record<string, string | null> = {}
  for (const ref of [...refs].sort()) {
    if (/^[%#]/.test(ref)) continue
    const r = resolveRef(ir, ref, 'fn')
    fns[ref] = r ? (r.feature.fns[r.symbol]?.sourceHash ?? null) : null
  }
  return {
    guard: transition.guard,
    assign: transition.assign,
    navigate: transition.navigate ? foldLinks(ir, transition.navigate) : null,
    enters: {
      state: transition.target,
      effect: target?.invoke?.effect ?? null,
      input: target?.invoke?.input ?? null,
      timers: target?.after.map((a) => a.ms) ?? [],
      final: target?.final ?? false,
    },
    fns,
  }
}

export const behaviorOf = (id: string, record: BehaviorRecord): string =>
  hashJson({ id, ...record } as unknown as Json).slice(0, 16)

const isObject = (v: Json): v is Record<string, Json> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

export function patchOf(base: Json, value: Json): Json {
  if (!isObject(base) || !isObject(value)) return hashJson(base) === hashJson(value) ? {} : value
  const out: Record<string, Json> = {}
  for (const key of Object.keys(value).sort()) {
    const b = base[key] ?? null
    const v = value[key]!
    if (hashJson(b) === hashJson(v)) continue
    out[key] = isObject(b) && isObject(v) ? patchOf(b, v) : v
  }
  return out
}

/** The contract body as authored: given over initialContext, expect over given; renames and context growth keep it. */
export function contractHash(contract: ContractIR, initialContext: Json): string {
  const { given, when, expect } = contract
  return hashJson({
    given: { state: given.state, context: patchOf(initialContext, given.context) },
    when,
    expect: {
      state: expect.state,
      changes: expect.context === null ? null : patchOf(given.context, expect.context),
      effects: expect.effects,
    },
  } as unknown as Json).slice(0, 16)
}
