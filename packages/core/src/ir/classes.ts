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
        if (n.class) for (const c of classesOf(n.class)) out.add(c)
        for (const key in n.toggle) for (const c of classesOf(key)) out.add(c)
        n.children.forEach(walk)
        return
      case 'when':
        if (n.motion) for (const c of motionClasses(n.motion)) out.add(c)
        n.children.forEach(walk)
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
