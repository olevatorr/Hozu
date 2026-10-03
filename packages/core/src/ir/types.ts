export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

export type JsonSchema = { [key: string]: Json }

export interface ProjectIR {
  irVersion: 3
  site: SiteIR | null
  session: JsonSchema | null
  routes: Record<string, RouteIR>
  pages: Record<string, PageIR>
  notFound: string | null
  error: string | null
  http: HttpIR
  env: {
    server: JsonSchema | null
    public: JsonSchema | null
    /** The env files the CLI reads, relative to the config; a later one wins, the shell wins over all (ADR 0052). */
    files: string[]
    /** Public variable → server variable holding its internal URL, read by `'either'` effects on the server. */
    internal: Record<string, string>
  } | null
  features: Record<string, FeatureIR>
  kits: Record<string, KitIR>
}

export interface KitIR {
  schemas: Record<string, JsonSchema>
  components: Record<string, ComponentIR>
}

export interface HttpIR {
  basePath: string
  trailingSlash: 'never' | 'always'
  redirects: RedirectIR[]
  headers: HeaderRuleIR[]
}

export interface RedirectIR {
  from: string
  to: ValueExpr
  permanent: boolean
}

export interface HeaderRuleIR {
  routes: string[] | 'all'
  set: Record<string, string>
}

export interface SiteIR {
  url: string
  name: string
  lang: string
  icon: string | null
  themeColor: string | null
  locales: string[] | null
  offline: string | null
}

export interface PageIR {
  views: string[]
  assert: 'static' | 'cacheable' | null
  head: HeadIR
  entries: EntriesIR | null
}

export interface HeadIR {
  query: { ref: string; input: ValueExpr } | null
  title: ValueExpr
  description: ValueExpr
  type: 'website' | 'article'
  image: ValueExpr
  published: ValueExpr
  noindex: boolean
  failed: Record<string, HeadFailureIR>
}

export type HeadFailureIR = { redirect: string } | { status: 403 | 404 | 410 }

export interface EntriesIR {
  query: string
  input: ValueExpr
  params: ValueExpr
}

export interface RouteIR {
  path: string
  params: JsonSchema | null
  search: JsonSchema | null
}

export interface FeatureIR {
  id: string
  intent: IntentIR
  imports: string[]
  exports: ExportsIR
  schemas: Record<string, JsonSchema>
  tags: Record<string, TagIR>
  events: Record<string, EventIR>
  queries: Record<string, QueryIR>
  mutations: Record<string, MutationIR>
  fns: Record<string, FnIR>
  machine: MachineIR | null
  views: Record<string, ViewIR>
  components: Record<string, ComponentIR>
  endpoints: Record<string, EndpointIR>
  contracts: Record<string, ContractIR>
  messages: MessagesIR | null
  /** The feature's `fetch.ts` (ADR 0049): implementations of its `'either'` / `'browser'` effects. */
  fetch: { sourceHash: string } | null
  /** The origins its browser-run effects call, added to CSP `connect-src` (ADR 0051). */
  connect: ConnectIR[]
}

/** An origin (`https://api.github.com`) or a public env variable holding a URL. */
export type ConnectIR = { origin: string } | { env: string }

export interface EndpointIR {
  method: 'GET' | 'POST'
  path: string
  input: string
  output: string | null
  mode: EndpointMode
  raw?: true
  errors?: Record<string, string>
  failed?: Record<string, EndpointStatus>
  invalidates?: TagExprIR[]
}

export type EndpointMode = 'json' | 'redirect' | 'response'

export type EndpointStatus = 400 | 401 | 403 | 404 | 409 | 410 | 422 | 429

export type ComponentLoad = 'eager' | 'visible' | 'idle'

export interface ComponentIR {
  tag: string
  props: string
  variants: Record<string, string[]>
  defaults: Record<string, string>
  slots: string[]
  children: boolean
  events: string[]
  emits: Record<string, string>
  extend: boolean
  owned: string[]
  client: { load: ComponentLoad; sourceHash: string } | null
  sourceHash: string
}

export interface UseIR {
  component: string
  variant: Record<string, string>
  added: string[]
  overrides: string[]
}

export interface IntentIR {
  summary: string
  invariants: string[]
}

export interface ExportsIR {
  events: string[]
  queries: string[]
  mutations: string[]
  tags: string[]
  fns: string[]
  views: string[]
  endpoints: string[]
}

export interface TagIR {
  param: string | null
}

export interface EventIR {
  payload: string
}

export type Scope = 'public' | 'user'

export type Freshness =
  | { kind: 'static' }
  | { kind: 'revalidate'; seconds: number }
  | { kind: 'swr'; seconds: number }
  | { kind: 'live' }
  | { kind: 'request' }

export interface QueryIR {
  input: string
  output: string
  errors: Record<string, string>
  scope: Scope
  freshness: Freshness
  tags: TagExprIR[]
  runs: Runs
}

export interface MutationIR {
  input: string
  output: string
  errors: Record<string, string>
  invalidates: TagExprIR[]
  runs: Runs
}

/** What an effect's implementation needs (ADR 0049): server secrets, browser credentials, or neither. */
export type Runs = 'server' | 'browser' | 'either'

export interface TagExprIR {
  tag: string
  param: ValueExpr | null
}

export interface FnIR {
  input: string
  output: string
  sourceHash: string
}

export interface MachineIR {
  context: string
  initialContext: Json
  initial: string
  states: Record<string, StateIR>
}

export interface StateIR {
  final: boolean
  on: Record<string, TransitionIR[]>
  ignore: string[]
  invoke: InvokeIR | null
  after: AfterIR[]
}

export interface InvokeIR {
  effect: string
  input: ValueExpr
  done: TransitionIR[]
  failed: Record<string, TransitionIR[]>
}

export interface AfterIR {
  ms: number
  transition: TransitionIR
}

export interface TransitionIR {
  guard: GuardExpr | null
  target: string
  assign: AssignOp[]
  navigate: ValueExpr | null
}

export type RefSource =
  | 'context'
  | 'event'
  | 'result'
  | 'error'
  | 'input'
  | 'params'
  | 'search'
  | 'dom'
  | 'locale'
  | 'alternate'
  | 'env'

export type ValueExpr =
  | { ref: RefSource; path: string[] }
  | { ref: 'binding'; depth: number; path: string[] }
  | { literal: Json }
  | { object: Record<string, ValueExpr> }
  | { fn: string; arg: ValueExpr }
  | { test: GuardExpr }
  | { link: string; params: ValueExpr; search: ValueExpr }
  | { endpoint: string; input: ValueExpr | null }
  | FormRefIR

export type FormRefIR = {
  formRef: string
}

export type AssignOp =
  | { op: 'set' | 'append' | 'inc'; path: string[]; value: ValueExpr }
  | { op: 'removeWhere'; path: string[]; key: string | null; value: ValueExpr }

export type CompareOp = 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte'

export type GuardExpr =
  | { op: CompareOp; left: ValueExpr; right: ValueExpr }
  | { op: 'and' | 'or'; args: GuardExpr[] }
  | { op: 'not'; arg: GuardExpr }
  | { op: 'fn'; fn: string; arg: ValueExpr }

export interface ViewIR {
  machine: string | null
  route: string | null
  seed: Record<string, ValueExpr> | null
  root: ViewNode
}

export type { DomEvent, DomField, DomFields } from './events.ts'

export interface SendIR {
  event: string
  payload: ValueExpr
}

export type ViewNode =
  | ElementNode
  | TextNode
  | WhenNode
  | IfNode
  | EachNode
  | QueryNode
  | EmbedNode
  | ComponentNode
  | GlobalNode
  | HtmlNode

export interface ElementNode {
  id: string
  kind: 'el'
  tag: string
  class: string | null
  toggle: Record<string, ValueExpr>
  vars: Record<string, ValueExpr>
  attrs: Record<string, ValueExpr>
  on: Record<string, SendIR>
  children: ViewNode[]
  ref?: FormRefIR
  use?: UseIR
}

export interface ComponentNode {
  id: string
  kind: 'component'
  use: UseIR
  class: string | null
  toggle: Record<string, ValueExpr>
  vars: Record<string, ValueExpr>
  props: ValueExpr
  on: Record<string, SendIR>
  children: ViewNode[]
}

export interface TextNode {
  id: string
  kind: 'text'
  value: ValueExpr
}

export interface WhenNode {
  id: string
  kind: 'when'
  states: string[]
  motion: string | null
  children: ViewNode[]
}

export interface IfNode {
  id: string
  kind: 'if'
  test: GuardExpr
  motion: string | null
  ifTrue: ViewNode[]
  ifFalse: ViewNode[]
}

export interface GlobalNode {
  id: string
  kind: 'global'
  target: 'window' | 'document'
  on: Record<string, SendIR>
}

export interface HtmlNode {
  id: string
  kind: 'html'
  value: ValueExpr
}

export interface EachNode {
  id: string
  kind: 'each'
  source: ValueExpr
  key: string | null
  motion: string | null
  item: ViewNode
}

export interface QueryNode {
  id: string
  kind: 'query'
  query: string
  input: ValueExpr
  ready: ViewNode
  pending: ViewNode | null
  failed: Record<string, ViewNode>
}

export interface EmbedNode {
  id: string
  kind: 'embed'
  view: string
}

export interface ContractIR {
  given: { state: string; context: Json }
  when: StepIR[]
  expect: ExpectIR
}

export type StepIR =
  | { send: string; payload: Json }
  | { done: string; result: Json }
  | { failed: string; error: string; data: Json }
  | { elapse: number }

export interface ExpectIR {
  state: string
  context: Json | null
  effects: EffectCallIR[] | null
}

export type EffectCallIR = { effect: string; input: Json } | { navigate: string }

export interface MessagesIR {
  base: string
  text: Record<string, Record<string, string>>
}
