import type { ProjectIR, ViewNode } from './types.ts'

const childrenOf = (n: ViewNode): ViewNode[] => {
  switch (n.kind) {
    case 'el':
    case 'widget':
    case 'when':
      return n.children
    case 'if':
      return [...n.ifTrue, ...n.ifFalse]
    case 'each':
      return [n.item]
    case 'query':
      return [n.ready, ...(n.pending ? [n.pending] : []), ...Object.values(n.failed)]
    default:
      return []
  }
}

export function usedWidgets(ir: ProjectIR): string[] {
  const used = new Set<string>()
  const visit = (n: ViewNode) => {
    if (n.kind === 'widget') used.add(n.widget)
    for (const c of childrenOf(n)) visit(c)
  }
  for (const feature of Object.values(ir.features))
    for (const view of Object.values(feature.views)) visit(view.root)
  return [...used].sort()
}
