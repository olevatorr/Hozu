import type { ProjectIR, ViewNode } from './types.ts'

const classesOf = (value: string) => value.split(/\s+/).filter(Boolean)

export const motionClasses = (name: string) =>
  ['enter-from', 'enter-active', 'enter-to', 'leave-from', 'leave-active', 'leave-to', 'move'].map(
    (s) => `${name}-${s}`,
  )

export function classCandidates(ir: ProjectIR): Set<string> {
  const out = new Set<string>()
  const walk = (n: ViewNode) => {
    switch (n.kind) {
      case 'el':
      case 'widget':
        if (n.class) for (const c of classesOf(n.class)) out.add(c)
        for (const key in n.toggle) for (const c of classesOf(key)) out.add(c)
        n.children.forEach(walk)
        return
      case 'when':
        if (n.motion) for (const c of motionClasses(n.motion)) out.add(c)
        n.children.forEach(walk)
        return
      case 'if':
        if (n.motion) for (const c of motionClasses(n.motion)) out.add(c)
        n.ifTrue.forEach(walk)
        n.ifFalse.forEach(walk)
        return
      case 'each':
        if (n.motion) for (const c of motionClasses(n.motion)) out.add(c)
        walk(n.item)
        return
      case 'query':
        walk(n.ready)
        if (n.pending) walk(n.pending)
        Object.values(n.failed).forEach(walk)
        return
      default:
        return
    }
  }
  for (const f of Object.values(ir.features)) for (const v of Object.values(f.views)) walk(v.root)
  return out
}

/** The classes whose CSS properties the style rules read: the views' and every component's. */
export function styledClasses(
  ir: ProjectIR,
  components: Record<string, { inner: string[] }> = {},
): Set<string> {
  const out = classCandidates(ir)
  const owners = [...Object.values(ir.features), ...Object.values(ir.kits)]
  for (const o of owners) for (const c of Object.values(o.components)) for (const x of c.owned) out.add(x)
  for (const { inner } of Object.values(components)) for (const x of inner) out.add(x)
  return out
}
