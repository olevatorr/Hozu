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

/** `hozu devtools messages` (ADR 0060 D): every string to translate, or what a translation (`--check`) lacks. */
export type DevtoolsMessagesOutput =
  | { hozu: string; messages: Record<string, string> }
  | { file: string; missing: string[]; unknown: string[]; placeholders: string[] }

/** `hozu export` (ADR 0059 H): files written for a static host, and what only a server can answer. */
export interface ExportOutput {
  out: string
  written: string[]
  skipped: { route: string; reason: string }[]
  needsServer: { path: string; effect: string; reason: string }[]
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
  /** What the app's `onError` received while answering this request (ADR 0069 A2). */
  serverErrors: ServerError[]
}

/** One call of the app's `onError` (ADR 0069 A2): a resolver that threw, an invalid input, a failed stream. */
export interface ServerError {
  message: string
  /** The effect (`feature.symbol`) whose resolver or input failed, when known. */
  effect?: string
  /** The request path, when known. */
  path?: string
  /** The other fields `onError` received, such as the schema issues of an invalid input and where it came from. */
  details?: Record<string, unknown>
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
  /** `server`: the app's `onError` was called outside any step (opening the page); a step lists its own. */
  kind: 'exception' | 'console' | 'request' | 'server'
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
  /** What the step did to the document: kept it, loaded the same URL again, or loaded another one (ADR 0063 C3). */
  document?: 'in place' | 'reloaded' | 'navigated'
  /** With the document kept: how many elements are new after the step (a region drawn again). */
  replaced?: number
  /**
   * Elements the step removed and built again unchanged: same tag, class, text, `name`, `id`, `href`, `src`, `type`
   * and parent path (ADR 0067 C2, ADR 0069 A3). `count` counts every such element, `elements` names the outermost
   * ones as CSS-like paths (`main > form > input[name=card]`).
   */
  flashes?: { count: number; elements: string[] }
  /**
   * How a navigation arrived (ADR 0072 D3): from a speculation prerender or loaded, and the milliseconds from the
   * activation (prerendered) or the navigation start to the first contentful paint.
   */
  arrived?: { prerendered: boolean; ms: number }
  /** Layout shift no input explains (layout-shift entries without recent input, summed, as CLS counts them). */
  shift?: number
  /** What the app's `onError` received during the step (ADR 0069 A2). */
  serverErrors?: ServerError[]
  url: string
  /** The status of the page the step loaded, when it is not 200 (a 403 an access check expects). */
  status?: number
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
  /** Both modes made a request and the resulting text differs. */
  differs?: boolean
  /** The words that differ, at most three lines (ADR 0070 B6); a URL pair first when the pages differ. */
  differences?: { on: string; off: string }[]
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

/** `hozu show`: the notes the agent shows the person under hozu dev (ADR 0056 D). */
export interface ShowOutput {
  added: AgentNoteOutput | null
  removed: number
  notes: AgentNoteOutput[]
}

export interface AgentNoteOutput {
  n: number
  id: string
  label: string
  at: string | null
  path: string | null
  within: string | null
  text: string
  created: string
  /** Set when the target no longer names what the note was written for (the view changed); re-add the note. */
  stale?: string
}

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
  /** Each step's changes: `summary` joins `changes` with "; ". */
  steps: { from: string; to: string; summary: string; changes: string[] }[]
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
  kind: 'query' | 'mutation' | 'endpoint'
  /** An endpoint's HTTP status (ADR 0056 C). */
  status?: number
  runs: Runs
  input: Json
  result: { ok: true; value: Json } | { ok: false; error: string; data: Json }
  /** Milliseconds for the request. */
  ms: number
  /** Tags a mutation or a writing endpoint invalidated. */
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

/** `hozu gen` (ADR 0068). */
export interface GenOutput {
  contracts: {
    /** The contract file, relative to the working directory. */
    file: string
    package: string
    /** The effects it implements (feature.symbol), each with the fingerprint its calls carry (ADR 0070 C3). */
    effects: { ref: string; fingerprint: string }[]
    /** False when the file already held this contract. */
    written: boolean
    /** Effects that cannot be remote (the server refuses to start with them, HZ093). */
    problems: string[]
    /**
     * Number fields named like an id or a count, which may want z.int() (ADR 0070 C4), and enums without a title that
     * became several Go types, which a title makes one; not diagnostics.
     */
    notes: string[]
  }[]
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
