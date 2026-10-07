import type { FeatureIR, GuardExpr, StateIR, TagExprIR, TransitionIR, ValueExpr } from '@hozu/core/ir'
import type { BehaviorRecord } from './record.ts'

export interface Located {
  from: string
  trigger: string
  transition: TransitionIR
  target: StateIR | undefined
}

const short = (ref: string) => ref.slice(ref.indexOf('.') + 1)

export function locate(feature: FeatureIR, id: string): Located {
  const [from, kind, ...rest] = id.split('/') as [string, string, ...string[]]
  const state = feature.machine!.states[from]!
  let transition: TransitionIR
  let trigger: string
  if (kind === 'on') {
    transition = state.on[rest[0]!]![Number(rest[1])]!
    trigger = short(rest[0]!)
  } else if (kind === 'after') {
    const after = state.after[Number(rest[0])]!
    transition = after.transition
    trigger = `after ${after.ms}ms`
  } else if (rest[0] === 'done') {
    transition = state.invoke!.done[Number(rest[1])]!
    trigger = `done ${short(state.invoke!.effect)}`
  } else {
    transition = state.invoke!.failed[rest[1]!]![Number(rest[2])]!
    trigger = `failed ${short(state.invoke!.effect)}.${rest[1]}`
  }
  return {
    from,
    trigger,
    transition,
    target: transition.stay ? undefined : feature.machine!.states[transition.target],
  }
}

const computingBuiltins = new Set([
  '%plus',
  '%minus',
  '%concat',
  '%cond',
  '%coalesce',
  '%includes',
  '%length',
])

const computingFn = (fn: string) => computingBuiltins.has(fn) || !/^[%#]/.test(fn)

export function computes(value: ValueExpr): boolean {
  if ('fn' in value) return computingFn(value.fn) || computes(value.arg)
  if ('object' in value) return Object.values(value.object).some(computes)
  if ('test' in value) return guardComputes(value.test)
  if ('link' in value) return computes(value.params) || computes(value.search)
  if ('endpoint' in value) return value.input !== null && computes(value.input)
  return false
}

function guardComputes(guard: GuardExpr): boolean {
  switch (guard.op) {
    case 'and':
    case 'or':
      return guard.args.some(guardComputes)
    case 'not':
      return guardComputes(guard.arg)
    case 'fn':
      return computingFn(guard.fn) || computes(guard.arg)
    default:
      return true
  }
}

/** ADR 0043 G: a guard, a navigate, or a fn / comparison / computing builtin in an assign value or the entered invoke input. */
export function decides(feature: FeatureIR, id: string): boolean {
  const { transition, target } = locate(feature, id)
  if (transition.guard || transition.navigate) return true
  if (transition.assign.some((a) => a.op === 'inc' || computes(a.value))) return true
  if (transition.replace && computes(transition.replace)) return true
  if (
    (transition.copy && computes(transition.copy)) ||
    transition.refresh?.some((t) => t.param && computes(t.param))
  )
    return true
  return target?.invoke ? computes(target.invoke.input) : false
}

const names: Record<string, string> = { context: 'ctx' }

const infix: Record<string, string> = { '%plus': '+', '%minus': '-', '%coalesce': '??' }

function showCall(fn: string, arg: ValueExpr): string {
  const o = 'object' in arg ? arg.object : null
  if (o && infix[fn] && o.a && o.b) return `(${showValue(o.a)} ${infix[fn]} ${showValue(o.b)})`
  if (o && fn === '%cond' && o.c && o.a && o.b)
    return `(${showValue(o.c)} ? ${showValue(o.a)} : ${showValue(o.b)})`
  if (o && fn === '%concat') return `(${Object.values(o).map(showValue).join(' + ')})`
  if (o && fn === '%length' && o.v) return `${showValue(o.v)}.length`
  if (o && fn === '%includes' && o.l && o.v) return `${showValue(o.l)}.includes(${showValue(o.v)})`
  if (o && fn === '%truthy' && o.v) return `!!${showValue(o.v)}`
  return `${short(fn)}(${showValue(arg)})`
}

export function showValue(v: ValueExpr): string {
  if ('literal' in v) return JSON.stringify(v.literal)
  if ('ref' in v) return [v.ref === 'binding' ? 'item' : (names[v.ref] ?? v.ref), ...v.path].join('.')
  if ('object' in v)
    return `{ ${Object.entries(v.object)
      .map(([k, x]) => `${k}: ${showValue(x)}`)
      .join(', ')} }`
  if ('fn' in v) return showCall(v.fn, v.arg)
  if ('test' in v) return showGuard(v.test)
  if ('endpoint' in v) return `link(${v.endpoint}${v.input ? `, ${showValue(v.input)}` : ''})`
  if ('formRef' in v) return `formRef(${v.formRef})`
  const search = 'literal' in v.search && v.search.literal === null ? '' : `, ${showValue(v.search)}`
  return `link(${v.link}, ${showValue(v.params)}${search})`
}

export function showGuard(g: GuardExpr): string {
  switch (g.op) {
    case 'and':
    case 'or':
      return `(${g.args.map(showGuard).join(` ${g.op} `)})`
    case 'not':
      return `not ${showGuard(g.arg)}`
    case 'fn':
      return showCall(g.fn, g.arg)
    default:
      return `${showValue(g.left)} ${g.op} ${showValue(g.right)}`
  }
}

export const showAssign = (assign: BehaviorRecord['assign']): string =>
  assign
    .map((a) =>
      a.op === 'set'
        ? `${a.path.join('.')} := ${showValue(a.value)}`
        : a.op === 'removeWhere'
          ? `${a.path.join('.')} -= where ${a.key ?? 'item'} = ${showValue(a.value)}`
          : `${a.path.join('.')} ${a.op === 'inc' ? '+=' : 'append'} ${showValue(a.value)}`,
    )
    .join(', ')

export const showEnters = ({ effect, input, timers, final }: BehaviorRecord['enters']): string =>
  [
    effect ? `invoke ${short(effect)}(${input ? showValue(input) : ''})` : '',
    timers.length ? `after ${timers.map((ms) => `${ms}ms`).join(', ')}` : '',
    final ? 'final' : '',
  ]
    .filter(Boolean)
    .join(' · ')

export const showFns = (fns: BehaviorRecord['fns']): string =>
  Object.entries(fns)
    .map(([ref, hash]) => `${short(ref)}@${hash ? hash.slice(0, 8) : '?'}`)
    .join(', ')

export const showRefresh = (tags: TagExprIR[]): string =>
  tags.map((t) => (t.param ? `${short(t.tag)}(${showValue(t.param)})` : short(t.tag))).join(', ')

export function summaryOf(feature: FeatureIR, id: string, record: BehaviorRecord): string {
  const { from, trigger } = locate(feature, id)
  const parts = [`${from} --${trigger}--> ${record.stay ? 'stays' : record.enters.state}`]
  if (record.guard) parts.push(`if ${showGuard(record.guard)}`)
  if (record.assign.length) parts.push(showAssign(record.assign))
  if (record.navigate) parts.push(`navigate ${showValue(record.navigate)}`)
  if (record.refresh) parts.push(`refresh ${showRefresh(record.refresh)}`)
  if (record.copy) parts.push(`copy ${showValue(record.copy)}`)
  if (record.replace) parts.push(`replace ${showValue(record.replace)}`)
  const enters = showEnters(record.enters)
  if (enters) parts.push(enters)
  if (Object.keys(record.fns).length) parts.push(`fns ${showFns(record.fns)}`)
  return parts.join(' · ')
}
