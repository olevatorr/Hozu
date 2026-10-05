import type {
  InvokeDef,
  MachineDef,
  OnDef,
  Outcome,
  StateConfig,
  TransitionConfig,
} from '../builders/machine.ts'
import type { AssignOp, GuardExpr, InvokeIR, MachineIR, StateIR, TransitionIR } from '../ir/types.ts'
import { transformedDecls } from '../lower.ts'
import { type Decl, defOf, infoOf } from '../model/decl.ts'
import { assignOf, exprOf, RecorderError, refProxy } from '../model/expr.ts'
import { type At, at, type FeatureScope, IDENTIFIER, resolveAt } from './scope.ts'

const guard = (scope: FeatureScope, g: unknown, p: At): GuardExpr => scope.guard(g, p)

function assign(scope: FeatureScope, a: unknown, p: At): AssignOp {
  const raw = assignOf(a)
  if (!raw)
    throw new RecorderError(
      'assign must be a block of context writes: ctx.x = v, ctx.list.push(v), ctx.list = ctx.list.filter((x) => x !== v)',
    )
  const target = exprOf(raw.target)
  if (target?.kind !== 'ref' || target.ref !== 'context')
    throw new RecorderError('An assign target must be a context path (ctx.…)')
  const path = [...target.path]
  const value = scope.value(raw.value, p)
  return raw.op === 'removeWhere' ? { op: raw.op, path, key: raw.key, value } : { op: raw.op, path, value }
}

function transition(
  scope: FeatureScope,
  t: TransitionConfig<string, any>,
  arg: unknown,
  p: At,
  self?: string,
): TransitionIR {
  const target = t.target ?? self
  if (target === undefined)
    scope.report(
      'HZ014',
      at(p, 'target'),
      'This transition has no target',
      "A state's transitions name their target state; only machine-wide on entries may omit it (the state they fire in).",
    )
  return {
    target: String(target ?? '?'),
    guard: t.guard
      ? scope.attempt(at(p, 'guard'), () => guard(scope, scope.callback(t.guard!)(arg), at(p, 'guard')), null)
      : null,
    assign: t.assign
      ? scope.attempt(at(p, 'assign'), () => {
          const ops = scope.callback(t.assign!)(arg)
          if (!Array.isArray(ops)) throw new RecorderError('assign must return an array')
          return ops.map((a, i) => assign(scope, a, at(p, 'assign', i)))
        }, [])
      : [],
    navigate: t.navigate
      ? scope.attempt(
          at(p, 'navigate'),
          () => {
            const v = scope.value(scope.callback(t.navigate!)(arg), at(p, 'navigate'))
            if (!('link' in v))
              throw new RecorderError('navigate must return one ui.link(route, params, search)', {
                cause:
                  'navigate is recorded once, so a condition inside it (?:, &&, ??) becomes a value, not a link. Choose the link with guarded transitions instead.',
                fix: {
                  summary: 'One transition per link, the first matching guard wins',
                  snippet:
                    "done: [\n  { guard: () => ctx.returnTo !== null, target: 'idle', navigate: () => ui.link(storyPage, { id: ctx.returnTo }) },\n  { target: 'idle', navigate: () => ui.link(home, null) },\n]",
                  patch: null,
                },
              })
            return v
          },
          null,
        )
      : null,
  }
}

const outcomes = (o: Outcome<string, any> | undefined): readonly TransitionConfig<string, any>[] =>
  o === undefined
    ? []
    : typeof o === 'string'
      ? [{ target: o }]
      : Array.isArray(o)
        ? o
        : [o as TransitionConfig<string, any>]

function invoke(scope: FeatureScope, decl: unknown, p: At): InvokeIR | null {
  const info = infoOf(decl)
  if (info?.kind !== 'invoke') {
    scope.report(
      'HZ014',
      p,
      'invoke must be created with invoke(effect, {...})',
      'Unknown value in a state config.',
    )
    return null
  }
  scope.project.mark(p, decl)
  scope.escapes(decl, p)
  const d = info.def as InvokeDef
  const failed: Record<string, TransitionIR[]> = {}
  for (const [name, list] of Object.entries(d.failed ?? {}))
    failed[name] = outcomes(list).map((t, i) =>
      transition(scope, t, refProxy('error', 0), at(p, 'failed', name, i)),
    )
  return {
    effect: scope.ref(d.effect, ['query', 'mutation'], at(p, 'effect')),
    input: scope.attempt(at(p, 'input'), () => scope.value(d.input, at(p, 'input')), { literal: null }),
    done: outcomes(d.done).map((t, i) => transition(scope, t, refProxy('result', 0), at(p, 'done', i))),
    failed,
  }
}

function state(scope: FeatureScope, config: StateConfig<string>, p: At): StateIR {
  const on: Record<string, TransitionIR[]> = {}
  for (const entry of config.on ?? []) {
    const info = infoOf(entry)
    if (info?.kind !== 'on') {
      scope.report(
        'HZ014',
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
    scope.escapes(entry, tp)
    list.push(transition(scope, d.transition, refProxy('event', 0), tp))
  }
  const after = [...(config.after ?? [])].sort((a, b) => a.ms - b.ms)
  if (config.invoke && config.ignore?.length)
    scope.report(
      'HZ014',
      at(p, 'ignore'),
      'A state with invoke must not list ignore',
      'A state with invoke drops every event it does not handle (ADR 0037).',
      {
        summary: 'Remove the ignore list',
        snippet: null,
        patch: [{ op: 'remove', path: resolveAt(at(p, 'ignore')) }],
      },
    )
  const ignore = config.invoke
    ? []
    : (config.ignore ?? []).map((e, i) => scope.ref(e, ['event'], at(p, 'ignore', i)))
  return {
    final: config.final === true,
    on,
    ignore: [...new Set(ignore)].sort(),
    invoke: config.invoke ? invoke(scope, config.invoke, at(p, 'invoke')) : null,
    after: after.map((a, i) => {
      if (!Number.isInteger(a.ms) || a.ms < 0)
        scope.report(
          'HZ014',
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
  scope.lowering = transformedDecls().has(decl)
  const configs = scope.attempt(p, () => scope.callback(d.states)({ ctx: refProxy('context', 0) }), {})
  const shared = d.on
    ? scope.attempt(at(p, 'on'), () => scope.callback(d.on!)({ ctx: refProxy('context', 0) }), [])
    : []
  const states: Record<string, StateIR> = {}
  for (const [name, config] of Object.entries(configs)) {
    if (!IDENTIFIER.test(name))
      scope.report(
        'HZ014',
        at(p, 'states', name),
        `State name "${name}" is not an identifier`,
        'Names must match /^[A-Za-z][A-Za-z0-9_]*$/.',
      )
    else if (name === 'previous')
      scope.report(
        'HZ014',
        at(p, 'states', name),
        'A state cannot be named "previous"',
        "target: 'previous' returns to the state the machine came from, so the name is reserved.",
      )
    states[name] = state(scope, config, at(p, 'states', name))
  }
  const byEvent = new Map<string, { def: OnDef; at: At }[]>()
  shared.forEach((entry, i) => {
    const info = infoOf(entry)
    const sp = at(p, 'on', i)
    if (info?.kind !== 'on') {
      scope.report(
        'HZ014',
        sp,
        'on entries must be created with on(Event, {...})',
        'Unknown value in machine({ on })',
      )
      return
    }
    scope.project.mark(sp, entry)
    scope.escapes(entry, sp)
    const def = info.def as OnDef
    const event = scope.ref(def.event, ['event'], sp)
    byEvent.set(event, [...(byEvent.get(event) ?? []), { def, at: sp }])
  })
  for (const [name, s] of Object.entries(states)) {
    if (s.invoke || s.final) continue
    for (const [event, list] of byEvent)
      if (!s.on[event] && !s.ignore.includes(event))
        s.on[event] = list.map((e, i) => {
          scope.project.bindings.copies[resolveAt(at(p, 'states', name, 'on', event, i))] = resolveAt(e.at)
          return transition(scope, e.def.transition, refProxy('event', 0), e.at, name)
        })
  }
  scope.lowering = false
  scope.stateNames = Object.keys(states)
  scope.bind(`${scope.id}#context`, d.context)
  return {
    context: scope.schema(d.context, at(p, 'context')),
    initialContext: scope.attempt(at(p, 'initialContext'), () => scope.json(d.initialContext), {}),
    initial: String(d.initial),
    states,
  }
}
