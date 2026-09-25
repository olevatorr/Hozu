import type { InvokeDef, MachineDef, OnDef, StateConfig, TransitionConfig } from '../builders/machine.ts'
import type { AssignOp, GuardExpr, InvokeIR, MachineIR, StateIR, TransitionIR } from '../ir/types.ts'
import { type Decl, defOf, infoOf } from '../model/decl.ts'
import { assignOf, exprOf, guardOf, RecorderError, refProxy } from '../model/expr.ts'
import { type At, at, type FeatureScope, IDENTIFIER } from './scope.ts'

function guard(scope: FeatureScope, g: unknown, p: At): GuardExpr {
  const raw = guardOf(g)
  if (raw) {
    if (raw.op === 'and' || raw.op === 'or')
      return { op: raw.op, args: raw.args.map((a) => guard(scope, a, p)) }
    if (raw.op === 'not') return { op: 'not', arg: guard(scope, raw.arg, p) }
    if ('left' in raw) return { op: raw.op, left: scope.value(raw.left, p), right: scope.value(raw.right, p) }
  }
  const expr = exprOf(g)
  if (expr?.kind === 'call')
    return { op: 'fn', fn: scope.ref(expr.fn, ['fn'], p), arg: scope.value(expr.arg, p) }
  throw new RecorderError('A guard must be an op.* comparison or a boolean fn() call')
}

function assign(scope: FeatureScope, a: unknown, p: At): AssignOp {
  const raw = assignOf(a)
  if (!raw)
    throw new RecorderError('assign must return an array of op.set / op.append / op.inc / op.removeWhere')
  const target = exprOf(raw.target)
  if (target?.kind !== 'ref' || target.ref !== 'context')
    throw new RecorderError('An assign target must be a context path (ctx.…)')
  const path = [...target.path]
  const value = scope.value(raw.value, p)
  return raw.op === 'removeWhere' ? { op: raw.op, path, key: raw.key, value } : { op: raw.op, path, value }
}

export function routeRef(scope: FeatureScope, route: unknown, p: At): string {
  const id = scope.project.routes.get(route as object)
  if (id) return id
  scope.report(
    'TN007',
    p,
    'Navigation target is not a registered route',
    'Routes are identities; they must be listed in project({ routes }).',
    { summary: 'Add the route to project({ routes })', snippet: 'routes: { myRoute }', patch: null },
  )
  return '?'
}

function transition(
  scope: FeatureScope,
  t: TransitionConfig<string, any>,
  arg: unknown,
  p: At,
): TransitionIR {
  return {
    target: String(t.target),
    guard: t.guard
      ? scope.attempt(at(p, 'guard'), () => guard(scope, t.guard!(arg), at(p, 'guard')), null)
      : null,
    assign: t.assign
      ? scope.attempt(at(p, 'assign'), () => {
          const ops = t.assign!(arg)
          if (!Array.isArray(ops)) throw new RecorderError('assign must return an array')
          return ops.map((a, i) => assign(scope, a, at(p, 'assign', i)))
        }, [])
      : [],
    navigate: t.navigate ? routeRef(scope, t.navigate, at(p, 'navigate')) : null,
  }
}

function invoke(scope: FeatureScope, decl: unknown, p: At): InvokeIR | null {
  const info = infoOf(decl)
  if (info?.kind !== 'invoke') {
    scope.report(
      'TN014',
      p,
      'invoke must be created with invoke(effect, {...})',
      'Unknown value in a state config.',
    )
    return null
  }
  scope.project.mark(p, decl)
  const d = info.def as InvokeDef
  const failed: Record<string, TransitionIR[]> = {}
  for (const [name, list] of Object.entries(d.failed ?? {}))
    failed[name] = list.map((t, i) => transition(scope, t, refProxy('error', 0), at(p, 'failed', name, i)))
  return {
    effect: scope.ref(d.effect, ['query', 'mutation'], at(p, 'effect')),
    input: scope.attempt(at(p, 'input'), () => scope.value(d.input, at(p, 'input')), { literal: null }),
    done: (d.done ?? []).map((t, i) => transition(scope, t, refProxy('result', 0), at(p, 'done', i))),
    failed,
  }
}

function state(scope: FeatureScope, config: StateConfig<string>, p: At): StateIR {
  const on: Record<string, TransitionIR[]> = {}
  for (const entry of config.on ?? []) {
    const info = infoOf(entry)
    if (info?.kind !== 'on') {
      scope.report(
        'TN014',
        at(p, 'on'),
        'on entries must be created with on(Event, {...})',
        'Unknown value in on: [...]',
      )
      continue
    }
    const d = info.def as OnDef
    const event = scope.ref(d.event, ['event'], at(p, 'on'))
    on[event] ??= []
    const list = on[event]
    const tp = at(p, 'on', event, list.length)
    scope.project.mark(tp, entry)
    list.push(transition(scope, d.transition, refProxy('event', 0), tp))
  }
  const after = [...(config.after ?? [])].sort((a, b) => a.ms - b.ms)
  return {
    final: config.final === true,
    on,
    invoke: config.invoke ? invoke(scope, config.invoke, at(p, 'invoke')) : null,
    after: after.map((a, i) => {
      if (!Number.isInteger(a.ms) || a.ms < 0)
        scope.report(
          'TN014',
          at(p, 'after', i, 'ms'),
          `after.ms must be a non-negative integer, got ${a.ms}`,
          'Delays are milliseconds.',
        )
      return { ms: a.ms, transition: transition(scope, a, undefined, at(p, 'after', i, 'transition')) }
    }),
  }
}

export function buildMachine(scope: FeatureScope, decl: Decl | null): MachineIR | null {
  if (!decl) return null
  const p = scope.at('machine')
  scope.project.mark(p, decl)
  const d = defOf<MachineDef>(decl)
  const configs = scope.attempt(p, () => d.states({ ctx: refProxy('context', 0) }), {})
  const states: Record<string, StateIR> = {}
  for (const [name, config] of Object.entries(configs)) {
    if (!IDENTIFIER.test(name))
      scope.report(
        'TN014',
        at(p, 'states', name),
        `State name "${name}" is not an identifier`,
        'Names must match /^[A-Za-z][A-Za-z0-9_]*$/.',
      )
    states[name] = state(scope, config, at(p, 'states', name))
  }
  scope.stateNames = Object.keys(states)
  return {
    context: scope.schema(d.context, at(p, 'context')),
    initialContext: scope.attempt(at(p, 'initialContext'), () => scope.json(d.initialContext), {}),
    initial: String(d.initial),
    states,
  }
}
