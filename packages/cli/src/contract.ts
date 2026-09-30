import type { RoutePlan } from '@hozu/compiler'
import type { Diagnostic, ExportsIR, FeatureIR } from '@hozu/core/ir'
import type { Impact } from '@hozu/validator'

export interface CliError {
  error: { code: 'usage' | 'config' | 'unknown-feature' | 'build'; message: string; suggestions: string[] }
}

export interface Coverage {
  covered: number
  total: number
  transitions: number
}

export type LockState = 'missing' | 'checked' | 'current' | 'stale' | 'updated' | 'skipped'

export interface ValidateOutput {
  ok: boolean
  hash: string
  summary: { errors: number; warnings: number }
  coverage: Record<string, Coverage>
  lock: LockState
  styles: 'checked' | 'unavailable'
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

export type ImpactOutput = Impact

export interface PlanOutput extends RoutePlan {
  soft: Record<string, string[]>
}

export interface BuildOutput {
  out: string
  manifest: string
  files: string[]
}

export interface SkillOutput {
  written: string[]
}

export interface TypeIssue {
  file: string
  line: number
  column: number
  code: string
  message: string
}

export interface CheckOutput {
  ok: boolean
  types: { ok: boolean; skipped: boolean; errors: TypeIssue[] }
  validate: ValidateOutput
}

export interface RequestStep {
  method: 'GET' | 'POST'
  path: string
  status: number
  location: string | null
  cookies: string[]
  title: string | null
  alerts: string[]
  text: string | null
  truncated: boolean
  elements: RequestElement[]
  forms: RequestForm[]
}

export interface RequestElement {
  selector: string
  tag: string
  attrs: Record<string, string>
  text: string
}

export interface RequestForm {
  action: string
  fields: Record<string, string>
  buttons: string[]
}

export interface RequestOutput {
  steps: RequestStep[]
}

export interface MapRoute {
  id: string
  path: string
  search: string[]
  views: string[]
  head: string | null
  at: string | null
}

export interface MapState {
  name: string
  initial: boolean
  final: boolean
  on: { event: string; targets: string[] }[]
  invoke: { effect: string; done: string[]; failed: Record<string, string[]> } | null
  ignore: string[]
  after: { ms: number; target: string }[]
  at: string | null
}

export interface MapFeature {
  id: string
  queries: {
    name: string
    scope: string
    freshness: string
    errors: string[]
    tags: string[]
    at: string | null
  }[]
  mutations: { name: string; errors: string[]; invalidates: string[]; at: string | null }[]
  endpoints: { name: string; method: string; path: string; at: string | null }[]
  events: { name: string; fields: string[]; at: string | null }[]
  fns: string[]
  context: string[]
  machineAt: string | null
  states: MapState[]
  views: { name: string; machine: boolean; route: string | null; at: string | null }[]
  contracts: number
  contractsAt: string | null
}

export interface MapOutput {
  routes: MapRoute[]
  features: MapFeature[]
}

export interface AddOutput {
  created: string[]
  edited: string[]
  manual: string[]
  declarations: Record<string, string[]>
  texts: { file: string; line: number; text: string }[]
}

export interface DocsOutput {
  topic: string | null
  text: string
  topics: { name: string; title: string }[]
}

export type BrowseMode = 'on' | 'off'

export interface BrowseError {
  kind: 'exception' | 'console' | 'request'
  text: string
  at: string | null
  url?: string
  type?: string
  actor?: string
  mode?: BrowseMode
}

export interface BrowseWidget {
  name: string
  state: 'mounted' | 'failed' | 'not mounted'
  width: number | null
  height: number | null
  canvases: number
  elements: number
  hint: string | null
}

export interface BrowseStep {
  step: string
  ok: boolean
  note: string | null
}

export interface BrowseOutput {
  path: string
  url: string
  status: number
  title: string
  hydrated: boolean
  steps: BrowseStep[]
  errors: BrowseError[]
  widgets: BrowseWidget[]
  text: string
  truncated: boolean
  elements: RequestElement[]
  screenshot: string | null
  actors?: BrowseActor[]
}

export interface BrowseActor {
  name: string
  url: string
  status: number
  title: string
  steps: BrowseStep[]
  errors: BrowseError[]
  text: string
}
