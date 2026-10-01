import { eachGuardRef, eachRef, type Json, type ValueExpr, type ViewNode } from '@hozu/core/ir'

const usesMemo = new WeakMap<ViewNode, Uses>()

export type Uses = Map<number, string[][]>

const valueUses = (v: ValueExpr, out: Uses) =>
  eachRef(v, (r) => {
    if (r.ref !== 'binding') return
    const paths = out.get(r.depth)
    if (paths) paths.push(r.path)
    else out.set(r.depth, [r.path])
  })

export function bindingUses(n: ViewNode): Uses {
  const hit = usesMemo.get(n)
  if (hit) return hit
  const out: Uses = new Map()
  const walk = (x: ViewNode) => {
    switch (x.kind) {
      case 'text':
        valueUses(x.value, out)
        return
      case 'if':
        eachGuardRef(x.test, (r) => valueUses(r, out))
        for (const c of [...x.ifTrue, ...x.ifFalse]) walk(c)
        return
      case 'html':
        valueUses(x.value, out)
        return
      case 'global':
        for (const k in x.on) valueUses(x.on[k]!.payload, out)
        return
      case 'component':
        valueUses(x.props, out)
        for (const m of [x.toggle, x.vars]) for (const k in m) valueUses(m[k]!, out)
        for (const k in x.on) valueUses(x.on[k]!.payload, out)
        for (const c of x.children) walk(c)
        return
      case 'el':
        for (const m of [x.attrs, x.toggle, x.vars]) for (const k in m) valueUses(m[k]!, out)
        for (const k in x.on) valueUses(x.on[k]!.payload, out)
        for (const c of x.children) walk(c)
        return
      case 'when':
        for (const c of x.children) walk(c)
        return
      case 'each':
        valueUses(x.source, out)
        walk(x.item)
        return
      case 'query':
        valueUses(x.input, out)
        walk(x.ready)
        if (x.pending) walk(x.pending)
        for (const k in x.failed) walk(x.failed[k]!)
        return
      default:
        return
    }
  }
  walk(n)
  usesMemo.set(n, out)
  return out
}

export type Shape = true | Map<string, Shape>

export const shapeOf = (paths: string[][]): Shape => {
  const root = new Map<string, Shape>()
  for (const path of paths) {
    let at: Map<string, Shape> = root
    for (let i = 0; i < path.length; i++) {
      const next = at.get(path[i]!)
      if (next === true) break
      if (i === path.length - 1) at.set(path[i]!, true)
      else if (next) at = next
      else {
        const child = new Map<string, Shape>()
        at.set(path[i]!, child)
        at = child
      }
    }
    if (path.length === 0) return true
  }
  return root
}

export const project = (value: Json, shape: Shape): Json => {
  if (shape === true || typeof value !== 'object' || value === null || Array.isArray(value)) return value
  const out: { [k: string]: Json } = {}
  for (const [k, s] of shape) if (k in value) out[k] = project(value[k]!, s)
  return out
}

const shapesMemo = new WeakMap<ViewNode, (Shape | null)[]>()

export const pruneScope = (n: ViewNode, bindings: Json[]): Json[] => {
  let shapes = shapesMemo.get(n)
  if (!shapes) {
    const uses = bindingUses(n)
    shapes = bindings.map((_, i) => {
      const paths = uses.get(i)
      return paths ? shapeOf(paths) : null
    })
    shapesMemo.set(n, shapes)
  }
  const out: Json[] = []
  for (let i = 0; i < bindings.length; i++) {
    const shape = shapes[i]
    out.push(shape ? project(bindings[i]!, shape) : null)
  }
  return out
}
