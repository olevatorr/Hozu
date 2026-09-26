import {
  type GuardExpr,
  i18nFns,
  type Json,
  type ProjectIR,
  type ValueExpr,
  type ViewNode,
} from '@tenon/core/ir'

export interface Lowering {
  locale: string
  alternate: Record<string, string>
  message: (ref: string) => string
}

const usesMemo = new WeakMap<ProjectIR, boolean>()

export function usesI18n(ir: ProjectIR): boolean {
  let hit = usesMemo.get(ir)
  if (hit === undefined) {
    const text = JSON.stringify(Object.values(ir.features).map((f) => [f.views, f.messages]))
    hit = /"fn":"#|"ref":"(locale|alternate)"/.test(text)
    usesMemo.set(ir, hit)
  }
  return hit
}

export function localeFns(
  ir: ProjectIR,
  fns: Record<string, (x: Json) => Json>,
  locale: string,
): Record<string, (x: Json) => Json> {
  const out: Record<string, (x: Json) => Json> = { ...fns }
  const generic = i18nFns as unknown as Record<string, (x: Json) => Json>
  for (const name of ['#number', '#date', '#relative', '#list'])
    out[name] = (x) => generic[name]!({ ...(x as Record<string, Json>), l: locale })
  for (const f of Object.values(ir.features)) {
    if (!f.messages) continue
    const text = f.messages.text[locale] ?? f.messages.text[f.messages.base] ?? {}
    for (const key of Object.keys(f.messages.text[f.messages.base] ?? {}))
      out[`#msg:${f.id}.${key}`] = (a) => generic['#msg']!({ t: text[key] ?? '', l: locale, a })
  }
  return out
}

export function lowerNode(n: ViewNode, l: Lowering): ViewNode {
  const v = (x: ValueExpr) => lowerValue(x, l)
  const map = (m: Record<string, ValueExpr>) =>
    Object.fromEntries(Object.entries(m).map(([k, x]) => [k, v(x)]))
  const sends = (on: Record<string, { event: string; payload: ValueExpr }>) =>
    Object.fromEntries(Object.entries(on).map(([k, s]) => [k, { ...s, payload: v(s.payload) }]))
  const list = (xs: ViewNode[]) => xs.map((x) => lowerNode(x, l))
  switch (n.kind) {
    case 'el':
      return {
        ...n,
        attrs: map(n.attrs),
        toggle: map(n.toggle),
        vars: map(n.vars),
        on: sends(n.on),
        children: list(n.children),
      }
    case 'widget':
      return {
        ...n,
        props: v(n.props),
        toggle: map(n.toggle),
        vars: map(n.vars),
        on: sends(n.on),
        children: list(n.children),
      }
    case 'text':
    case 'html':
      return { ...n, value: v(n.value) }
    case 'global':
      return { ...n, on: sends(n.on) }
    case 'when':
      return { ...n, children: list(n.children) }
    case 'if':
      return { ...n, test: lowerGuard(n.test, l), ifTrue: list(n.ifTrue), ifFalse: list(n.ifFalse) }
    case 'each':
      return { ...n, source: v(n.source), item: lowerNode(n.item, l) }
    case 'query':
      return {
        ...n,
        input: v(n.input),
        ready: lowerNode(n.ready, l),
        pending: n.pending ? lowerNode(n.pending, l) : null,
        failed: Object.fromEntries(Object.entries(n.failed).map(([k, x]) => [k, lowerNode(x, l)])),
      }
    default:
      return n
  }
}

function lowerGuard(g: GuardExpr, l: Lowering): GuardExpr {
  switch (g.op) {
    case 'and':
    case 'or':
      return { ...g, args: g.args.map((a) => lowerGuard(a, l)) }
    case 'not':
      return { ...g, arg: lowerGuard(g.arg, l) }
    case 'fn':
      return { ...g, arg: lowerValue(g.arg, l) }
    default:
      return { ...g, left: lowerValue(g.left, l), right: lowerValue(g.right, l) }
  }
}

const withLocale = (arg: ValueExpr, locale: string): ValueExpr =>
  'literal' in arg && arg.literal && typeof arg.literal === 'object' && !Array.isArray(arg.literal)
    ? { literal: { ...arg.literal, l: locale } }
    : 'object' in arg
      ? { object: { ...arg.object, l: { literal: locale } } }
      : arg

export function lowerValue(x: ValueExpr, l: Lowering): ValueExpr {
  if ('ref' in x) {
    if (x.ref === 'locale') return { literal: l.locale }
    if (x.ref === 'alternate') return { literal: l.alternate[x.path[0] ?? ''] ?? null }
    return x
  }
  if ('object' in x)
    return { object: Object.fromEntries(Object.entries(x.object).map(([k, y]) => [k, lowerValue(y, l)])) }
  if ('fn' in x) {
    const arg = lowerValue(x.arg, l)
    if (x.fn.startsWith('#msg:')) {
      const t = l.message(x.fn.slice(5))
      if ('literal' in arg && arg.literal === null)
        return { literal: (i18nFns['#msg'] as (i: unknown) => Json)({ t, l: l.locale, a: null }) }
      return { fn: '#msg', arg: { object: { t: { literal: t }, l: { literal: l.locale }, a: arg } } }
    }
    if (x.fn.startsWith('#')) return { fn: x.fn, arg: withLocale(arg, l.locale) }
    return { fn: x.fn, arg }
  }
  if ('link' in x) return { ...x, params: lowerValue(x.params, l), search: lowerValue(x.search, l) }
  if ('test' in x) return { test: lowerGuard(x.test, l) }
  return x
}
