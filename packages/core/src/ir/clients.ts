import type { ComponentIR, ProjectIR, ViewNode } from './types.ts'

const childrenOf = (n: ViewNode): ViewNode[] => {
  switch (n.kind) {
    case 'el':
    case 'component':
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

/** The declaration of component `id`: `feature.Name` or `kit.Name`. */
export function componentOf(ir: ProjectIR, id: string): ComponentIR | null {
  const dot = id.indexOf('.')
  const owner = id.slice(0, dot)
  const name = id.slice(dot + 1)
  return ir.features[owner]?.components[name] ?? ir.kits[owner]?.components[name] ?? null
}

export function clientComponentsIn(root: ViewNode, ir: ProjectIR): string[] {
  const out = new Set<string>()
  const seen = new Set<ViewNode>()
  const visit = (n: ViewNode) => {
    if (seen.has(n)) return
    seen.add(n)
    if (n.kind === 'component') out.add(n.use.component)
    if (n.kind === 'embed') {
      const dot = n.view.indexOf('.')
      const view = ir.features[n.view.slice(0, dot)]?.views[n.view.slice(dot + 1)]
      if (view) visit(view.root)
    }
    for (const c of childrenOf(n)) visit(c)
  }
  visit(root)
  return [...out]
}

export function usedClientComponents(ir: ProjectIR): string[] {
  const used = new Set<string>()
  const visit = (n: ViewNode) => {
    if (n.kind === 'component') used.add(n.use.component)
    for (const c of childrenOf(n)) visit(c)
  }
  for (const feature of Object.values(ir.features))
    for (const view of Object.values(feature.views)) visit(view.root)
  return [...used].sort()
}
