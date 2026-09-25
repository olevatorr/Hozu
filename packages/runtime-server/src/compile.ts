import { type FeatureIR, type Json, type ValueExpr, type ViewNode, voidTags } from '@tenon/core/ir'
import { compileValue, type Fns, type Getter } from '@tenon/machine'
import { attrText, text } from '@tenon/runtime-client'
import { escapeHtml } from './escape.ts'

export interface Scope {
  feature: FeatureIR
  context: Json
  state: string | null
  bindings: Json[]
  params: Json
}

export interface Runtime {
  open(n: ViewNode, scope: Scope): string
  embed(view: string): { root: ViewNode; scope: Scope } | null
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

export function compileNode(n: ViewNode, island: boolean, islands: Set<string>, fns: Fns, sep = false): Frag {
  const children = (list: ViewNode[]) =>
    list.map((c, i) => compileNode(c, island, islands, fns, separated(list, i)))
  if (!island && islands.has(n.id)) {
    const inner = compileNode(n, true, islands, fns, sep)
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
      const parts: Frag[] = [`<${n.tag}${n.class ? ` class="${escapeHtml(n.class)}"` : ''}`]
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
      const item = compileNode(n.item, island, islands, fns, true)
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
          f = compileNode(e.root, island, islands, fns)
          cache.set(e.root, f)
        }
        return run(f, e.scope, r)
      })
    }
    default:
      return ''
  }
}
