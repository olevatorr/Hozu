import type { FeatureIR, GuardExpr, StateIR, TransitionIR, ValueExpr } from '@hozu/core/ir'
import { valueRefs } from '../sites.ts'

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
  return { from, trigger, transition, target: feature.machine!.states[transition.target] }
}

export function isMechanical(feature: FeatureIR, id: string): boolean {
  const { transition, target } = locate(feature, id)
  if (transition.guard || transition.navigate) return false
  let computes = false
  const found = () => {
    computes = true
  }
  for (const a of transition.assign) valueRefs(a.value, '', found)
  if (target?.invoke) valueRefs(target.invoke.input, '', found)
  return !computes
}

const names: Record<string, string> = { context: 'ctx' }

export function showValue(v: ValueExpr): string {
  if ('literal' in v) return JSON.stringify(v.literal)
  if ('ref' in v) return [v.ref === 'binding' ? 'item' : (names[v.ref] ?? v.ref), ...v.path].join('.')
  if ('object' in v)
    return `{ ${Object.entries(v.object)
      .map(([k, x]) => `${k}: ${showValue(x)}`)
      .join(', ')} }`
  if ('fn' in v) return `${short(v.fn)}(${showValue(v.arg)})`
  if ('test' in v) return showGuard(v.test)
  return `link(${v.link}, ${showValue(v.params)})`
}

export function showGuard(g: GuardExpr): string {
  switch (g.op) {
    case 'and':
    case 'or':
      return `(${g.args.map(showGuard).join(` ${g.op} `)})`
    case 'not':
      return `not ${showGuard(g.arg)}`
    case 'fn':
      return `${short(g.fn)}(${showValue(g.arg)})`
    default:
      return `${showValue(g.left)} ${g.op} ${showValue(g.right)}`
  }
}

export function summaryOf(feature: FeatureIR, id: string): string {
  const { from, trigger, transition, target } = locate(feature, id)
  const parts = [`${from} --${trigger}--> ${transition.target}`]
  if (transition.guard) parts.push(`if ${showGuard(transition.guard)}`)
  if (transition.assign.length)
    parts.push(
      transition.assign
        .map((a) =>
          a.op === 'set'
            ? `${a.path.join('.')} := ${showValue(a.value)}`
            : a.op === 'removeWhere'
              ? `${a.path.join('.')} -= where ${a.key} = ${showValue(a.value)}`
              : `${a.path.join('.')} ${a.op === 'inc' ? '+=' : 'append'} ${showValue(a.value)}`,
        )
        .join(', '),
    )
  if (transition.navigate) parts.push(`navigate ${showValue(transition.navigate)}`)
  if (target?.invoke) parts.push(`invoke ${short(target.invoke.effect)}(${showValue(target.invoke.input)})`)
  return parts.join(' · ')
}
