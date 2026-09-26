import {
  type BuildResult,
  buildProject,
  type FeatureIR,
  join,
  type ProjectIR,
  type ViewNode,
} from '@tenonkit/core/ir'
import cartProject from '../../../../examples/cart/tenon.config.ts'

let cached: BuildResult | undefined

export const cartBuild = (): BuildResult => (cached ??= buildProject(cartProject))

export const cartIR = (): ProjectIR => structuredClone(cartBuild().ir)

export function findNode(
  feature: FeatureIR,
  view: string,
  match: (node: ViewNode) => boolean,
): { node: ViewNode; pointer: string } {
  const walk = (node: ViewNode, pointer: string): { node: ViewNode; pointer: string } | null => {
    if (match(node)) return { node, pointer }
    const children: [ViewNode, string][] =
      node.kind === 'el' || node.kind === 'when'
        ? node.children.map((c, i) => [c, join(pointer, 'children', i)])
        : node.kind === 'each'
          ? [[node.item, join(pointer, 'item')]]
          : node.kind === 'query'
            ? [
                [node.ready, join(pointer, 'ready')],
                ...(node.pending ? ([[node.pending, join(pointer, 'pending')]] as [ViewNode, string][]) : []),
                ...Object.entries(node.failed).map(([k, n]): [ViewNode, string] => [
                  n,
                  join(pointer, 'failed', k),
                ]),
              ]
            : []
    for (const [child, p] of children) {
      const hit = walk(child, p)
      if (hit) return hit
    }
    return null
  }
  const hit = walk(feature.views[view]!.root, join('', 'features', feature.id, 'views', view, 'root'))
  if (!hit) throw new Error(`No node matched in ${feature.id}.${view}`)
  return hit
}

export const nodeAt = (ir: ProjectIR, pointer: string): ViewNode => {
  let node: unknown = ir
  for (const token of pointer.slice(1).split('/'))
    node = (node as Record<string, unknown>)[token.replaceAll('~1', '/').replaceAll('~0', '~')]
  return node as ViewNode
}
