import {
  type FeatureIR,
  FORM_FIELD,
  formRunnable,
  type Json,
  type ValueExpr,
  type ViewNode,
  voidTags,
  type WidgetIR,
} from '@tenon/core/ir'
import { compileGuard, compileValue, type Fns, type Getter } from '@tenon/machine'
import { attrText, classText, styleText, text } from '@tenon/runtime-client'
import { escapeHtml } from './escape.ts'

export interface Scope {
  feature: FeatureIR
  context: Json
  state: string | null
  bindings: Json[]
  params: Json
  search: Json
  routes: Record<string, string>
  url: string
}

export interface Runtime {
  open(n: ViewNode, scope: Scope): string
  embed(view: string): { root: ViewNode; scope: Scope } | null
  widget(ref: string): void
}

export interface Compile {
  islands: Set<string>
  fns: Fns
  widgets: Record<string, WidgetIR>
}

export type Frag = string | ((scope: Scope, r: Runtime) => string)

const voids = new Set<string>(voidTags)

export const SEP = '<!---->'
export const OPEN = '<!--[-->'
export const CLOSE = '<!--]-->'

export { text }

export const expr = (v: ValueExpr, fns: Fns): Getter => compileValue(v, fns)

const attr = (name: string, x: Json) => {
  const s = attrText(name, x)
  return s === null ? '' : s === '' ? ` ${name}` : ` ${name}="${escapeHtml(s)}"`
}

type El = Pick<Extract<ViewNode, { kind: 'el' }>, 'class' | 'toggle' | 'vars'>

const classAttr = (c: string) => (c ? ` class="${escapeHtml(c)}"` : '')
const styleAttr = (s: string) => (s ? ` style="${escapeHtml(s)}"` : '')

export function classAndStyle(n: El, value: (v: ValueExpr) => Json): string {
  const active: string[] = []
  for (const c in n.toggle) if (value(n.toggle[c]!) === true) active.push(c)
  return (
    classAttr(classText(n.class, active)) +
    styleAttr(styleText(Object.entries(n.vars).map(([k, v]) => [k, value(v)])))
  )
}

function classAndStyleFrag(n: El, fns: Fns): Frag {
  const toggles = Object.entries(n.toggle).map(([c, v]) => [c, expr(v, fns)] as const)
  const vars = Object.entries(n.vars).map(([k, v]) => [k, expr(v, fns)] as const)
  const base = n.class
  const cls: Frag = toggles.length
    ? (s) => {
        const active: string[] = []
        for (const [c, get] of toggles) if (get(s) === true) active.push(c)
        return classAttr(classText(base, active))
      }
    : classAttr(base ?? '')
  const style: Frag = vars.length ? (s) => styleAttr(styleText(vars.map(([k, get]) => [k, get(s)]))) : ''
  return seq([cls, style])
}

function seq(parts: Frag[]): Frag {
  const merged: Frag[] = []
  for (const p of parts) {
    const last = merged.at(-1)
    if (typeof p === 'string' && typeof last === 'string') merged[merged.length - 1] = last + p
    else if (p !== '') merged.push(p)
  }
  if (merged.length === 0) return ''
  if (merged.length === 1) return merged[0]!
  const list = merged
  return (s, r) => {
    let out = ''
    for (const p of list) out += typeof p === 'string' ? p : p(s, r)
    return out
  }
}

export const run = (f: Frag, s: Scope, r: Runtime) => (typeof f === 'string' ? f : f(s, r))

export const separated = (list: ViewNode[], i: number) => list[i + 1]?.kind === 'text'

export function compileNode(n: ViewNode, island: boolean, c: Compile, sep = false): Frag {
  const { fns } = c
  const children = (list: ViewNode[]) => list.map((x, i) => compileNode(x, island, c, separated(list, i)))
  if (!island && c.islands.has(n.id)) {
    const inner = compileNode(n, true, c, sep)
    return (s, r) => r.open(n, s) + run(inner, s, r)
  }
  const wrap = (body: Frag): Frag => (island ? seq([OPEN, body, CLOSE]) : body)
  switch (n.kind) {
    case 'text': {
      const tail = island && sep ? SEP : ''
      if ('literal' in n.value) return escapeHtml(text(n.value.literal)) + tail
      const get = expr(n.value, fns)
      return (s) => escapeHtml(text(get(s))) + tail
    }
    case 'el': {
      const parts: Frag[] = [`<${n.tag}`, classAndStyleFrag(n, fns)]
      let content: Frag | null = null
      for (const [name, v] of Object.entries(n.attrs)) {
        if (n.tag === 'textarea' && name === 'value') {
          const get = expr(v, fns)
          content = 'literal' in v ? escapeHtml(text(v.literal)) : (s) => escapeHtml(text(get(s)))
          continue
        }
        if ('literal' in v) {
          parts.push(attr(name, v.literal))
          continue
        }
        const get = expr(v, fns)
        parts.push((s) => attr(name, get(s)))
      }
      const submit = n.tag === 'form' ? n.on.submit : undefined
      if (submit && !('method' in n.attrs) && formRunnable(submit.payload)) {
        const id = encodeURIComponent(n.id)
        parts.push(' method="post"', (s) =>
          attr('action', `${s.url}${s.url.includes('?') ? '&' : '?'}${FORM_FIELD}=${id}`),
        )
      }
      parts.push('>')
      if (voids.has(n.tag)) return seq(parts)
      if (content !== null) parts.push(content)
      else parts.push(...children(n.children))
      parts.push(`</${n.tag}>`)
      return seq(parts)
    }
    case 'when': {
      const body = seq(children(n.children))
      const states = n.states
      return wrap((s, r) => (s.state !== null && states.includes(s.state) ? run(body, s, r) : ''))
    }
    case 'each': {
      const item = compileNode(n.item, island, c, true)
      const source = expr(n.source, fns)
      return wrap((s, r) => {
        const items = source(s)
        let out = ''
        if (Array.isArray(items))
          for (const x of items) out += run(item, { ...s, bindings: [...s.bindings, x] }, r)
        return out
      })
    }
    case 'embed': {
      const view = n.view
      const cache = new WeakMap<ViewNode, Frag>()
      return wrap((_, r) => {
        const e = r.embed(view)
        if (!e) return ''
        let f = cache.get(e.root)
        if (f === undefined) {
          f = compileNode(e.root, island, c)
          cache.set(e.root, f)
        }
        return run(f, e.scope, r)
      })
    }
    case 'if': {
      const test = compileGuard(n.test, fns)
      const yes = seq(children(n.ifTrue))
      const no = seq(children(n.ifFalse))
      return wrap((s, r) => run(test(s) ? yes : no, s, r))
    }
    case 'html': {
      const get = expr(n.value, fns)
      return wrap((s) => text(get(s)))
    }
    case 'global':
      return '<!--g-->'
    case 'widget': {
      const tag = c.widgets[n.widget]?.tag ?? 'div'
      const ref = n.widget
      const use: Frag = (_, r) => {
        r.widget(ref)
        return ''
      }
      const own = island && c.islands.has(n.id)
      const kids = n.children.map((x, i) => compileNode(x, !own && island, c, separated(n.children, i)))
      return seq([use, `<${tag}`, classAndStyleFrag(n, fns), '>', ...kids, `</${tag}>`])
    }
    default:
      return ''
  }
}
