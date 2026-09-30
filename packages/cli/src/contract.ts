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

export type LockState = 'missing' | 'current' | 'stale' | 'updated' | 'skipped'

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

export type PlanOutput = RoutePlan

export interface BuildOutput {
  out: string
  manifest: string
  files: string[]
}

export interface SkillOutput {
  written: string[]
  /** Guides with text outside the markers that equals no known template: paste `block` by hand. */
  custom: { guide: string; block: string }[]
}

export interface MigrateStaleEntry {
  feature: string
  id: string
  kind: 'missing' | 'removed' | 'behavior' | 'contracts'
  was: string | null
  now: string | null
}

export interface MigrateNote {
  file: string
  line: number
  rule: string
  message: string
  see?: string
  behaviour?: boolean
}

export interface MigrateGuide {
  file: string
  state: 'written' | 'current' | 'replaced' | 'marked' | 'custom'
  block: string | null
}

export interface MigrateOutput {
  ok: boolean
  installed: string | null
  stale: { skipped: string | null; entries: MigrateStaleEntry[] }
  changed: string[]
  removed: string[]
  notes: MigrateNote[]
  guide: MigrateGuide[]
  ir: { compared: boolean; skipped: string | null; differences: string[] }
  next: string[]
  check: CheckOutput | null
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
  method: 'GET'
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

export interface RequestFormField {
  name: string
  value: string
  kind: string
  outside: boolean
}

export interface RequestFormGroup {
  name: string
  type: 'checkbox' | 'radio' | 'select'
  options: { value: string; checked: boolean }[]
  outside: boolean
}

export interface RequestFormButton {
  text: string
  name: string | null
  value: string | null
  outside: boolean
}

export interface RequestForm {
  action: string
  method: 'get' | 'post'
  id: string | null
  label: string | null
  fields: RequestFormField[]
  groups: RequestFormGroup[]
  buttons: RequestFormButton[]
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
  parts?: { name: string | null; at: string | null }[]
  contracts: number
  contractsAt: string | null
}

export interface MapFile {
  file: string
  roles: string[]
}

export interface MapOutput {
  session: string | null
  verify: string
  files: MapFile[]
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

export interface BrowseChange {
  mode: BrowseMode
  ok: boolean
  note: string | null
  jsOnly: string | null
  requested: boolean
  navigated: boolean
  url: string
  added: string[]
  removed: string[]
}

export interface BrowseElsewhere {
  actor: string
  mode: BrowseMode
  added: string[]
  removed: string[]
}

export interface BrowseStep {
  step: string
  ok: boolean
  note: string | null
  actor?: string
  modes?: BrowseChange[]
  differs?: boolean
  elsewhere?: BrowseElsewhere[]
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
  modes?: BrowseMode[]
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
  mode?: BrowseMode
}
