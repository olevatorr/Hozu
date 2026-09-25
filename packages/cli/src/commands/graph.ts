import type { FeatureIR, ViewNode } from '@tenon/core/ir'
import type { GraphEdge, GraphNode, GraphOutput } from '../contract.ts'
import { type Loaded, requireFeature } from '../load.ts'

const local = (ref: string) => ref.slice(ref.indexOf('.') + 1)

function collectViewEdges(node: ViewNode, from: string, edges: GraphEdge[], nodes: Map<string, GraphNode>) {
  const add = (id: string, kind: GraphNode['kind'], label: string) => {
    if (!nodes.has(id)) nodes.set(id, { id, kind, label, initial: false, final: false })
  }
  switch (node.kind) {
    case 'if':
      for (const child of [...node.then, ...node.else]) collectViewEdges(child, from, edges, nodes)
      return
    case 'el':
    case 'widget':
    case 'global':
      for (const send of Object.values(node.on)) {
        add(`event:${send.event}`, 'event', send.event)
        edges.push({
          from,
          to: `event:${send.event}`,
          kind: 'send',
          label: node.kind === 'el' ? node.tag : node.kind === 'widget' ? node.widget : node.target,
        })
      }
      if (node.kind !== 'global')
        for (const child of node.children) collectViewEdges(child, from, edges, nodes)
      return
    case 'when':
      for (const child of node.children) collectViewEdges(child, from, edges, nodes)
      return
    case 'each':
      collectViewEdges(node.item, from, edges, nodes)
      return
    case 'query':
      add(`query:${node.query}`, 'query', node.query)
      edges.push({ from, to: `query:${node.query}`, kind: 'reads', label: '' })
      for (const child of [
        node.ready,
        ...(node.pending ? [node.pending] : []),
        ...Object.values(node.failed),
      ])
        collectViewEdges(child, from, edges, nodes)
      return
    case 'embed':
      add(`view:${node.view}`, 'view', node.view)
      edges.push({ from, to: `view:${node.view}`, kind: 'embeds', label: '' })
      return
    default:
      return
  }
}

export function graphOf(feature: FeatureIR): GraphOutput {
  const nodes = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []
  const m = feature.machine
  for (const [state, s] of Object.entries(m?.states ?? {})) {
    const id = `state:${state}`
    nodes.set(id, { id, kind: 'state', label: state, initial: m?.initial === state, final: s.final })
    const guarded = (g: unknown) => (g ? ' [guard]' : '')
    for (const [event, list] of Object.entries(s.on))
      for (const t of list)
        edges.push({
          from: id,
          to: `state:${t.target}`,
          kind: 'on',
          label: `${local(event)}${guarded(t.guard)}`,
        })
    if (s.invoke) {
      const effect = `effect:${s.invoke.effect}`
      if (!nodes.has(effect))
        nodes.set(effect, {
          id: effect,
          kind: 'effect',
          label: s.invoke.effect,
          initial: false,
          final: false,
        })
      edges.push({ from: id, to: effect, kind: 'invoke', label: '' })
      for (const t of s.invoke.done)
        edges.push({ from: id, to: `state:${t.target}`, kind: 'done', label: `done${guarded(t.guard)}` })
      for (const [error, list] of Object.entries(s.invoke.failed))
        for (const t of list)
          edges.push({
            from: id,
            to: `state:${t.target}`,
            kind: 'failed',
            label: `failed.${error}${guarded(t.guard)}`,
          })
    }
    for (const a of s.after)
      edges.push({
        from: id,
        to: `state:${a.transition.target}`,
        kind: 'after',
        label: `after ${a.ms}ms${guarded(a.transition.guard)}`,
      })
  }
  for (const [vid, view] of Object.entries(feature.views)) {
    const id = `view:${feature.id}.${vid}`
    nodes.set(id, { id, kind: 'view', label: `${feature.id}.${vid}`, initial: false, final: false })
    collectViewEdges(view.root, id, edges, nodes)
  }
  for (const imported of feature.imports) {
    const id = `feature:${imported}`
    nodes.set(id, { id, kind: 'feature', label: imported, initial: false, final: false })
    edges.push({ from: `feature:${feature.id}`, to: id, kind: 'import', label: '' })
  }
  if (feature.imports.length)
    nodes.set(`feature:${feature.id}`, {
      id: `feature:${feature.id}`,
      kind: 'feature',
      label: feature.id,
      initial: false,
      final: false,
    })
  return { feature: feature.id, nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)), edges }
}

export const runGraph = (loaded: Loaded, id: string | undefined): GraphOutput =>
  graphOf(requireFeature(loaded.build().ir, id))

export function mermaid(graph: GraphOutput): string {
  const states = graph.nodes.filter((n) => n.kind === 'state')
  if (!states.length) return `stateDiagram-v2\n  note "${graph.feature} has no machine"\n`
  const lines = ['stateDiagram-v2']
  for (const s of states) if (s.initial) lines.push(`  [*] --> ${s.label}`)
  for (const e of graph.edges)
    if (e.from.startsWith('state:') && e.to.startsWith('state:'))
      lines.push(`  ${e.from.slice(6)} --> ${e.to.slice(6)}: ${e.label}`)
  for (const s of states) if (s.final) lines.push(`  ${s.label} --> [*]`)
  return `${lines.join('\n')}\n`
}
