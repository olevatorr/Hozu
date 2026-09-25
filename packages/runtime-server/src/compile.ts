import type { FeatureIR, Json, ValueExpr, ViewNode } from '@tenon/core/ir'
import { getIn } from '@tenon/machine'
import { escapeHtml } from './escape.ts'

export interface Scope {
  feature: FeatureIR
  context: Json
  state: string | null
  bindings: Json[]
}

export interface Runtime {
  params: Json
  fns: Record<string, (x: Json) => Json>
  open(n: ViewNode, scope: Scope): string
  embed(view: string): { root: ViewNode; scope: Scope } | null
}

export type Frag = string | ((scope: Scope, r: Runtime) => string)
type Get = (scope: Scope, r: Runtime) => Json

const voids = new Set(['img'])

export const text = (v: Json) =>
  v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)

export function expr(v: ValueExpr): Get {
  if ('literal' in v) {
    const literal = v.literal
    return () => literal
  }
  if ('object' in v) {
    const entries = Object.entries(v.object).map(([k, x]) => [k, expr(x)] as const)
    return (s, r) => {
      const out: Record<string, Json> = {}
      for (const [k, get] of entries) out[k] = get(s, r)
      return out
    }
  }
  if ('fn' in v) {
    const arg = expr(v.arg)
    const ref = v.fn
    return (s, r) => r.fns[ref]!(arg(s, r))
  }
  const path = v.path
  switch (v.ref) {
    case 'binding': {
      const depth = v.depth
      return path.length ? (s) => getIn(s.bindings[depth], path) : (s) => s.bindings[depth] ?? null
    }
    case 'context':
      return (s) => getIn(s.context, path)
    case 'params':
      return (_, r) => getIn(r.params, path)
    default:
      return () => null
  }
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

const run = (f: Frag, s: Scope, r: Runtime) => (typeof f === 'string' ? f : f(s, r))

export function compileNode(n: ViewNode, island: boolean, islands: Set<string>): Frag {
  if (!island && islands.has(n.id)) {
    const inner = compileNode(n, true, islands)
    return (s, r) => `${r.open(n, s)}${run(inner, s, r)}</t-i>`
  }
  switch (n.kind) {
    case 'text': {
      if ('literal' in n.value) return escapeHtml(text(n.value.literal))
      const get = expr(n.value)
      return (s, r) => escapeHtml(text(get(s, r)))
    }
    case 'el': {
      const parts: Frag[] = [
        `<${n.tag} data-t="${escapeHtml(n.id)}"${n.class ? ` class="${escapeHtml(n.class)}"` : ''}`,
      ]
      for (const [name, v] of Object.entries(n.attrs)) {
        if ('literal' in v) {
          const x = v.literal
          if (x !== null && x !== false)
            parts.push(x === true ? ` ${name}` : ` ${name}="${escapeHtml(text(x))}"`)
          continue
        }
        const get = expr(v)
        parts.push((s, r) => {
          const x = get(s, r)
          return x === null || x === false
            ? ''
            : x === true
              ? ` ${name}`
              : ` ${name}="${escapeHtml(text(x))}"`
        })
      }
      parts.push('>')
      if (voids.has(n.tag)) return seq(parts)
      for (const c of n.children) parts.push(compileNode(c, island, islands))
      parts.push(`</${n.tag}>`)
      return seq(parts)
    }
    case 'when': {
      const body = seq(n.children.map((c) => compileNode(c, island, islands)))
      const states = n.states
      const open = `<!--${n.id}-->`
      const close = `<!--/${n.id}-->`
      return (s, r) =>
        s.state !== null && states.includes(s.state) ? open + run(body, s, r) + close : open + close
    }
    case 'each': {
      const item = compileNode(n.item, island, islands)
      const source = expr(n.source)
      const open = `<!--${n.id}-->`
      const close = `<!--/${n.id}-->`
      return (s, r) => {
        const items = source(s, r)
        let out = open
        if (Array.isArray(items))
          for (const x of items) out += run(item, { ...s, bindings: [...s.bindings, x] }, r)
        return out + close
      }
    }
    case 'embed': {
      const view = n.view
      const cache = new WeakMap<ViewNode, Frag>()
      return (_, r) => {
        const e = r.embed(view)
        if (!e) return ''
        let f = cache.get(e.root)
        if (f === undefined) {
          f = compileNode(e.root, island, islands)
          cache.set(e.root, f)
        }
        return run(f, e.scope, r)
      }
    }
    default:
      return ''
  }
}

export { run }
