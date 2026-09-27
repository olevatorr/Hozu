import type { ProjectIR, ViewNode } from '@hozu/core/ir'

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

export function assertWidgetBundle(ir: ProjectIR, urls: Record<string, string>, given: boolean) {
  const missing = usedWidgets(ir).filter((ref) => !urls[ref])
  if (!missing.length) return
  throw new Error(
    given
      ? `The widget bundle has no client code for ${missing.join(', ')}; check the diagnostics of bundleWidgets (HZ029).`
      : `Widgets ${missing.join(', ')} are used in views, but no widget bundle was given, so their client code would never load. Pass \`widgets: await bundleWidgets(build)\` from @hozu/bundle (npm install @hozu/bundle), or serve the output of \`hozu build\`.`,
  )
}
