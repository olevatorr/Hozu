import type { RoutePlan } from '@hozu/compiler'
import type {
  ComponentIR,
  ComponentLoad,
  DevNode,
  Diagnostic,
  ExportsIR,
  FeatureIR,
  Json,
  Runs,
} from '@hozu/core/ir'
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
  summary: { errors: number; warnings: number; accepted: number }
  coverage: Record<string, Coverage>
  lock: LockState
  /** With --update-lock: every change the update accepted, with its now: (ADR 0056 A7). */
  lockAccepted?: string[]
  styles: 'checked' | 'unavailable'
  diagnostics: Diagnostic[]
  /** Warnings the project keeps on purpose (`project({ accept })`, ADR 0053 C), with their reasons. */
  accepted: { code: string; message: string; at: string; reason: string }[]
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
  /** Each query and mutation: where it runs and where it is implemented (ADR 0049). */
  effects: Record<string, { kind: 'query' | 'mutation'; runs: Runs; implemented: 'resolver' | 'fetch.ts' }>
}

export interface InspectFeatureOutput {
  feature: string
  hash: string
  summary: InspectSummary
  ir: FeatureIR
}

export interface ComponentOwner {
  kind: 'kit' | 'feature'
  id: string
}

export interface ComponentUseSite {
  feature: string
  node: string
  at: string | null
  variant: Record<string, string>
  added: string[]
  overrides: string[]
}

export interface InspectComponentOutput {
  component: string
  owner: ComponentOwner
  hash: string
  ir: ComponentIR
  uses: ComponentUseSite[]
}

export type InspectOutput = InspectFeatureOutput | InspectComponentOutput

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
  invoke: { effect: string; input: string; errors: string[]; runs: Runs } | null
  outgoing: ExplainTransition[]
  incoming: ExplainTransition[]
  sends: ExplainSend[]
}

export interface ComponentImpact {
  target: string
  kind: 'component'
  owner: ComponentOwner
  uses: ComponentUseSite[]
  features: string[]
}

export type ImpactOutput = Impact | ComponentImpact

/** `hozu why` (ADR 0053 F): what the target is, where (file:line), and what `explain`, `impact` or `locate` says. */
export type WhyOutput =
  | { target: string; kind: 'state'; at: string | null; state: ExplainOutput }
  | { target: string; kind: 'declaration' | 'component'; at: string | null; impact: ImpactOutput }
  | { target: string; kind: 'node' | 'page'; at: string | null; node: LocateOutput }

export type PlanOutput = RoutePlan

export interface BuildOutput {
  out: string
  manifest: string
  files: string[]
}

export interface SkillOutput {
  written: string[]
  /** Guides without hozu markers: paste `block` by hand. */
  custom: { guide: string; block: string }[]
}

export interface TypeIssue {
  file: string
  line: number
  column: number
  code: string
  message: string
}

export interface CheckOverrides {
  component: string
  overrides: number
  uses: ComponentUseSite[]
}

export interface CheckOutput {
  ok: boolean
  types: { ok: boolean; skipped: boolean; errors: TypeIssue[] }
  validate: ValidateOutput
  overrides: CheckOverrides[]
  /** Milliseconds; the type check runs in parallel with loading and validating (ADR 0050 D). */
  timings: { types: number; load: number; validate: number }
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
  components?: string[]
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
    /** Where it runs (ADR 0049): 'server', 'browser' or 'either'. */
    runs: string
    access: string | null
    at: string | null
  }[]
  mutations: {
    name: string
    errors: string[]
    invalidates: string[]
    runs: string
    access: string | null
    at: string | null
  }[]
  /** The feature's fetch.ts (ADR 0049), when it has one. */
  fetch: string | null
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

export interface MapKit {
  id: string
  components: number
}

export interface MapOutput {
  session: string | null
  verify: string
  kits?: MapKit[]
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

export interface DocsComponentProp {
  name: string
  type: string
  required: boolean
  default?: Json
}

export interface DocsComponent {
  id: string
  owner: ComponentOwner
  tag: string
  variants: Record<string, { values: string[]; default: string | null }>
  props: DocsComponentProp[]
  slots: string[]
  children: boolean
  events: string[]
  emits: string[]
  extend: boolean
  client: ComponentLoad | null
}

export interface DocsComponentsOutput {
  text: string
  components: DocsComponent[]
}

export interface RenderOutput {
  ok: boolean
  component: string
  variant: Record<string, string>
  html: string
  class: string
  owned: string[]
  diagnostics: Diagnostic[]
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

export interface BrowseComponent {
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
  components: BrowseComponent[]
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

export type LocateOutput = DevNode

export interface RequestsOutput {
  requests: {
    number: string
    file: string
    title: string
    status: 'open' | 'done'
    created: string
    result: string | null
    locations: string[]
  }[]
  done: { number: string; result: string } | null
  prompt: string | null
}

export interface MigrateNote {
  file: string
  line: number
  message: string
  see: string | null
}

export interface MigrateOutput {
  ok: boolean
  /** The installed Hozu version (from node_modules/@hozu/core). */
  from: string
  /** The CLI's version: where the chain of steps ends. */
  to: string
  /**
   * `rewrite`: the source was older than the CLI, so it was rewritten and the dependencies raised.
   * `verify`: the dependencies are current, so the saved IR was compared and the app checked.
   * `current`: nothing to migrate.
   */
  phase: 'rewrite' | 'verify' | 'current'
  dryRun: boolean
  steps: { from: string; to: string; summary: string }[]
  changed: { file: string; edits: number }[]
  notes: MigrateNote[]
  packages: { name: string; from: string; to: string }[]
  record: string | null
  ir: { compared: boolean; skipped: string | null; differences: string[] }
  guide: string[]
  check: CheckOutput | null
  next: string[]
}

/** `hozu call` (ADR 0050 F): one query or mutation through the app's handler. */
export interface CallOutput {
  effect: string
  kind: 'query' | 'mutation'
  runs: Runs
  input: Json
  result: { ok: true; value: Json } | { ok: false; error: string; data: Json }
  /** Milliseconds for the request. */
  ms: number
  /** Tags a mutation invalidated. */
  invalidated: string[]
  /** The queries those tags refresh. */
  refreshes: string[]
}

export interface EnvVariable {
  name: string
  side: 'server' | 'public'
  /** No default, so startup refuses without it. */
  required: boolean
  default: string | null
  /** Set now: in the shell or one of the env files. */
  set: boolean
  description: string | null
  /** A public variable: the server variable with its internal URL; a server one: the public variable it serves. */
  internal: string | null
}

/** `hozu env` (ADR 0052). */
export interface EnvOutput {
  /** project({ env: { files } }). */
  files: string[]
  /** The files that existed and were read. */
  read: string[]
  variables: EnvVariable[]
  reserved: { name: string; purpose: string; set: boolean }[]
  /** `.env.example` when --example wrote it. */
  example: string | null
}
