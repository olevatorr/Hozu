import type { Diagnostic, ExportsIR, FeatureIR } from '@tenon/core/ir'

export interface CliError {
  error: { code: 'usage' | 'config' | 'unknown-feature'; message: string; suggestions: string[] }
}

export interface Coverage {
  covered: number
  total: number
}

export interface ValidateOutput {
  ok: boolean
  hash: string
  summary: { errors: number; warnings: number }
  coverage: Record<string, Coverage>
  lock: 'missing' | 'checked' | 'updated' | 'skipped'
  diagnostics: Diagnostic[]
}

export interface InspectSummary {
  states: number
  transitions: number
  events: number
  queries: number
  mutations: number
  views: number
  contracts: number
  hydrates: boolean
  imports: string[]
  exports: ExportsIR
}

export interface InspectOutput {
  feature: string
  hash: string
  summary: InspectSummary
  ir: FeatureIR
}

export type GraphNodeKind = 'state' | 'effect' | 'event' | 'feature' | 'view' | 'query'

export type GraphEdgeKind =
  | 'on'
  | 'done'
  | 'failed'
  | 'after'
  | 'invoke'
  | 'import'
  | 'send'
  | 'reads'
  | 'embeds'

export interface GraphNode {
  id: string
  kind: GraphNodeKind
  label: string
  initial: boolean
  final: boolean
}

export interface GraphEdge {
  from: string
  to: string
  kind: GraphEdgeKind
  label: string
}

export interface GraphOutput {
  feature: string
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface ExplainTransition {
  id: string
  from: string
  to: string
  trigger: string
  guard: string | null
  assign: string[]
  navigate: string | null
  coveredBy: string[]
}

export interface ExplainSend {
  view: string
  node: string
  event: string
  handled: boolean
}

export interface ExplainOutput {
  feature: string
  state: string
  initial: boolean
  final: boolean
  invoke: { effect: string; input: string; errors: string[] } | null
  outgoing: ExplainTransition[]
  incoming: ExplainTransition[]
  sends: ExplainSend[]
}
