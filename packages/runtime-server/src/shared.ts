import type {
  BuildResult,
  ElementNode,
  FeatureIR,
  GuardExpr,
  SendIR,
  TextNode,
  ValueExpr,
  ViewIR,
  ViewNode,
} from '@hozu/core/ir'
import { operatorFns } from '@hozu/core/ir'

/** A listener of a merged element whose two branches send different events (ADR 0072 A). */
export interface SendPick {
  test: GuardExpr
  a: SendIR | null
  b: SendIR | null
}

const CLOSED = new Set(['form', 'dialog', 'input', 'select', 'textarea', 'img', 'option'])
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const tokens = (c: string | null) => (c ?? '').split(/\s+/).filter(Boolean)

const computes = (v: ValueExpr) => JSON.stringify(v).includes('"fn":')

/**
 * One value for both branches, or null when they differ and either side computes: `%cond` evaluates both sides, and a
 * `fn` on the side not shown may throw on the data that hides it (`ctx.picked !== null ? title(ctx.picked) : …`).
 */
function cond(test: GuardExpr, a: ValueExpr, b: ValueExpr): ValueExpr | null {
  if (same(a, b)) return a
  return computes(a) || computes(b) ? null : { fn: '%cond', arg: { object: { c: { test }, a, b } } }
}

function values(
  test: GuardExpr,
  a: Record<string, ValueExpr>,
  b: Record<string, ValueExpr>,
  absent: ValueExpr,
): Record<string, ValueExpr> | null {
  const out: Record<string, ValueExpr> = {}
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const v = cond(test, a[k] ?? absent, b[k] ?? absent)
    if (!v) return null
    out[k] = v
  }
  return out
}

const text = (x: TextNode, value: ValueExpr | null): TextNode | null => (value ? { ...x, value } : null)

function element(test: GuardExpr, a: ElementNode, b: ElementNode): ElementNode | null {
  if (a.tag !== b.tag || CLOSED.has(a.tag) || a.ref || b.ref) return null
  if (a.use?.component !== b.use?.component || a.children.length !== b.children.length) return null
  if (!same(a.on.visible, b.on.visible)) return null
  if (a.tag === 'a' && !same(a.attrs.href, b.attrs.href)) return null
  const children: ViewNode[] = []
  for (let i = 0; i < a.children.length; i++) {
    const x = a.children[i]!
    const y = b.children[i]!
    const c =
      x.kind === 'el' && y.kind === 'el'
        ? element(test, x, y)
        : x.kind === 'text' && y.kind === 'text'
          ? text(x, cond(test, x.value, y.value))
          : null
    if (!c) return null
    children.push(c)
  }
  const toggle = values(test, a.toggle, b.toggle, { literal: false })
  const attrs = values(test, a.attrs, b.attrs, { literal: null })
  const vars = values(test, a.vars, b.vars, { literal: null })
  if (!toggle || !attrs || !vars) return null
  let cls = a.class
  if (a.class !== b.class) {
    const ta = tokens(a.class)
    const tb = tokens(b.class)
    const onlyA = ta.filter((t) => !tb.includes(t)).join(' ')
    const onlyB = tb.filter((t) => !ta.includes(t)).join(' ')
    for (const [k, g] of [
      [onlyA, test],
      [onlyB, { op: 'not', arg: test }],
    ] as const) {
      if (!k) continue
      if (k in toggle) return null
      toggle[k] = { test: g }
    }
    cls = ta.filter((t) => tb.includes(t)).join(' ') || null
  }
  const on: Record<string, SendIR | SendPick> = {}
  for (const k of new Set([...Object.keys(a.on), ...Object.keys(b.on)]))
    on[k] = same(a.on[k], b.on[k]) ? a.on[k]! : { test, a: a.on[k] ?? null, b: b.on[k] ?? null }
  return {
    ...a,
    class: cls,
    toggle,
    attrs,
    vars,
    on: on as Record<string, SendIR>,
    children,
  }
}

/** The one element both branches of `c ? a : b` render, when they have the same shape (ADR 0072 A). */
export function sharedElement(n: Extract<ViewNode, { kind: 'if' }>): ElementNode | null {
  if (n.motion !== null || n.ifTrue.length !== 1 || n.ifFalse.length !== 1) return null
  const [a, b] = [n.ifTrue[0]!, n.ifFalse[0]!]
  return a.kind === 'el' && b.kind === 'el' ? element(n.test, a, b) : null
}

function merged(n: ViewNode, hit: { any: boolean }): ViewNode {
  const list = (xs: ViewNode[]) => {
    let changed = false
    const out = xs.map((x) => {
      const y = merged(x, hit)
      changed ||= y !== x
      return y
    })
    return changed ? out : xs
  }
  switch (n.kind) {
    case 'if': {
      const ifTrue = list(n.ifTrue)
      const ifFalse = list(n.ifFalse)
      const next = ifTrue === n.ifTrue && ifFalse === n.ifFalse ? n : { ...n, ifTrue, ifFalse }
      const one = sharedElement(next)
      if (one) hit.any = true
      return one ?? next
    }
    case 'el':
    case 'component':
    case 'when': {
      const children = list(n.children)
      return children === n.children ? n : { ...n, children }
    }
    case 'each': {
      const item = merged(n.item, hit)
      return item === n.item ? n : { ...n, item }
    }
    case 'query': {
      const ready = merged(n.ready, hit)
      const pending = n.pending ? merged(n.pending, hit) : null
      const failed: Record<string, ViewNode> = {}
      let changed = ready !== n.ready || pending !== n.pending
      for (const [k, x] of Object.entries(n.failed)) {
        failed[k] = merged(x, hit)
        changed ||= failed[k] !== x
      }
      return changed ? { ...n, ready, pending, failed } : n
    }
    default:
      return n
  }
}

const memo = new WeakMap<BuildResult, BuildResult>()

/** The build the renderers use: each `c ? a : b` whose branches share a shape is one element (ADR 0072 A). */
export function renderBuild(build: BuildResult): BuildResult {
  const hit = memo.get(build)
  if (hit) return hit
  const found = { any: false }
  const features: Record<string, FeatureIR> = {}
  for (const [id, f] of Object.entries(build.ir.features)) {
    const views: Record<string, ViewIR> = {}
    let changed = false
    for (const [name, view] of Object.entries(f.views)) {
      const root = merged(view.root, found)
      views[name] = root === view.root ? view : { ...view, root }
      changed ||= root !== view.root
    }
    features[id] = changed ? { ...f, views } : f
  }
  const out: BuildResult = found.any
    ? {
        ...build,
        ir: { ...build.ir, features },
        bindings: {
          ...build.bindings,
          fns: { '%cond': operatorFns['%cond'] as never, ...build.bindings.fns },
        },
      }
    : build
  memo.set(build, out)
  memo.set(out, out)
  return out
}
