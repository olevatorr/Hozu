import type { AssignOp, FeatureIR, GuardExpr, Json, TransitionIR, ValueExpr } from '@hozu/core/ir'
import { equal, getIn, pathOf, setIn } from './data.ts'
import type {
  CompiledMachine,
  CompiledState,
  CompiledTransition,
  Fns,
  Getter,
  Test,
  Update,
} from './types.ts'

export class CompileError extends Error {
  override name = 'CompileError'
}

export function compileValue(v: ValueExpr, fns: Fns): Getter {
  if ('literal' in v) {
    const literal = v.literal
    return () => literal
  }
  if ('object' in v) {
    const entries = Object.entries(v.object).map(([k, x]) => [k, compileValue(x, fns)] as const)
    return (env) => {
      const out: { [key: string]: Json } = {}
      for (const [k, get] of entries) out[k] = get(env)
      return out
    }
  }
  if ('fn' in v) {
    const impl = fns[v.fn] as ((input: Json) => Json) | undefined
    if (!impl) throw new CompileError(`No implementation bound for fn ${v.fn}`)
    const arg = compileValue(v.arg, fns)
    return (env) => impl(arg(env))
  }
  if ('link' in v) {
    const id = v.link
    const params = compileValue(v.params, fns)
    const search = compileValue(v.search, fns)
    return (env) => pathOf(env.routes?.[id] ?? '', params(env), search(env))
  }
  if ('test' in v) {
    const test = guard(v.test, fns)
    return (env) => test(env)
  }
  const { path } = v
  if (v.ref === 'binding') {
    const depth = v.depth
    return path.length ? (env) => getIn(env.bindings?.[depth], path) : (env) => env.bindings?.[depth] ?? null
  }
  if (v.ref === 'dom') {
    const [field, ...rest] = path
    return (env) => (env.dom && field ? getIn(env.dom(field), rest) : null)
  }
  const ref = v.ref as 'context' | 'input' | 'event' | 'result' | 'error' | 'params' | 'search'
  if (path.length === 0) return (env) => env[ref] ?? null
  return (env) => getIn(env[ref], path)
}

const numeric = (x: Json) => (typeof x === 'number' || typeof x === 'string' ? x : Number.NaN)

export function compileGuard(g: GuardExpr, fns: Fns): Test {
  return guard(g, fns)
}

function guard(g: GuardExpr, fns: Fns): Test {
  switch (g.op) {
    case 'and': {
      const args = g.args.map((a) => guard(a, fns))
      return (env) => args.every((t) => t(env))
    }
    case 'or': {
      const args = g.args.map((a) => guard(a, fns))
      return (env) => args.some((t) => t(env))
    }
    case 'not': {
      const arg = guard(g.arg, fns)
      return (env) => !arg(env)
    }
    case 'fn': {
      const call = compileValue({ fn: g.fn, arg: g.arg }, fns)
      return (env) => call(env) === true
    }
    default: {
      const l = compileValue(g.left, fns)
      const r = compileValue(g.right, fns)
      switch (g.op) {
        case 'eq':
          return (env) => equal(l(env), r(env))
        case 'neq':
          return (env) => !equal(l(env), r(env))
        case 'lt':
          return (env) => numeric(l(env)) < numeric(r(env))
        case 'lte':
          return (env) => numeric(l(env)) <= numeric(r(env))
        case 'gt':
          return (env) => numeric(l(env)) > numeric(r(env))
        default:
          return (env) => numeric(l(env)) >= numeric(r(env))
      }
    }
  }
}

function assign(a: AssignOp, fns: Fns): Update {
  const { path } = a
  const v = compileValue(a.value, fns)
  switch (a.op) {
    case 'set':
      return (ctx, env) => setIn(ctx, path, v({ ...env, context: ctx }))
    case 'append':
      return (ctx, env) => {
        const list = getIn(ctx, path)
        return setIn(ctx, path, [...(Array.isArray(list) ? list : []), v({ ...env, context: ctx })])
      }
    case 'inc':
      return (ctx, env) =>
        setIn(ctx, path, Number(getIn(ctx, path) ?? 0) + Number(v({ ...env, context: ctx })))
    case 'removeWhere': {
      const key = a.key
      return (ctx, env) => {
        const list = getIn(ctx, path)
        const match = v({ ...env, context: ctx })
        const items = Array.isArray(list) ? list : []
        return setIn(
          ctx,
          path,
          items.filter(
            (item) =>
              !equal(
                item !== null && typeof item === 'object' && !Array.isArray(item) ? item[key] : null,
                match,
              ),
          ),
        )
      }
    }
  }
}

const navigateTo =
  (url: Getter, routes: Record<string, string>): Getter =>
  (env) =>
    url({ ...env, routes })

export function compileMachine(
  feature: FeatureIR,
  fns: Fns = {},
  routes: Record<string, string> = {},
): CompiledMachine {
  const m = feature.machine
  if (!m) throw new CompileError(`Feature ${feature.id} has no machine`)
  const names = Object.keys(m.states)
  const index = new Map(names.map((n, i) => [n, i]))
  const indexOf = (name: string) => {
    const i = index.get(name)
    if (i === undefined) throw new CompileError(`Unknown state "${name}" in ${feature.id}`)
    return i
  }
  const transitions: string[] = []
  const compile = (t: TransitionIR, id: string): CompiledTransition => {
    transitions.push(id)
    return {
      id,
      guard: t.guard ? guard(t.guard, fns) : null,
      target: indexOf(t.target),
      assign: t.assign.map((a) => assign(a, fns)),
      navigate: t.navigate ? navigateTo(compileValue(t.navigate, fns), routes) : null,
    }
  }
  const states: CompiledState[] = names.map((name) => {
    const s = m.states[name]!
    const on = new Map<string, CompiledTransition[]>()
    for (const [event, list] of Object.entries(s.on))
      on.set(
        event,
        list.map((t, i) => compile(t, `${name}/on/${event}/${i}`)),
      )
    const after = new Map<number, CompiledTransition[]>()
    s.after.forEach((a, i) => {
      const t = compile(a.transition, `${name}/after/${i}`)
      after.set(a.ms, [...(after.get(a.ms) ?? []), t])
    })
    const invoke = s.invoke
    return {
      name,
      final: s.final,
      on,
      invoke: invoke && {
        effect: invoke.effect,
        input: compileValue(invoke.input, fns),
        done: invoke.done.map((t, i) => compile(t, `${name}/invoke/done/${i}`)),
        failed: new Map(
          Object.entries(invoke.failed).map(([error, list]) => [
            error,
            list.map((t, i) => compile(t, `${name}/invoke/failed/${error}/${i}`)),
          ]),
        ),
      },
      after,
      timers: [...after.keys()].sort((a, b) => a - b),
    }
  })
  return {
    feature: feature.id,
    initial: indexOf(m.initial),
    initialContext: m.initialContext,
    states,
    index,
    transitions,
  }
}
