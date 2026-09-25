export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

export type JsonSchema = { [key: string]: Json }

export interface ProjectIR {
  irVersion: 1
  site: SiteIR | null
  session: JsonSchema | null
  routes: Record<string, RouteIR>
  pages: Record<string, PageIR>
  notFound: string | null
  error: string | null
  http: HttpIR
  features: Record<string, FeatureIR>
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
  redirects: Record<string, string>
}

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
  widgets: Record<string, WidgetIR>
  contracts: Record<string, ContractIR>
}

export interface WidgetIR {
  tag: string
  props: string
  events: Record<string, string>
  load: 'eager' | 'visible' | 'idle'
  wraps: boolean
  sourceHash: string
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

export interface QueryIR {
  input: string
  output: string
  errors: Record<string, string>
  scope: Scope
  freshness: Freshness
  tags: TagExprIR[]
}

export interface MutationIR {
  input: string
  output: string
  errors: Record<string, string>
  invalidates: TagExprIR[]
}

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

export type RefSource = 'context' | 'event' | 'result' | 'error' | 'input' | 'params' | 'search' | 'dom'

export type ValueExpr =
  | { ref: RefSource; path: string[] }
  | { ref: 'binding'; depth: number; path: string[] }
  | { literal: Json }
  | { object: Record<string, ValueExpr> }
  | { fn: string; arg: ValueExpr }
  | { test: GuardExpr }
  | { link: string; params: ValueExpr; search: ValueExpr }

export type AssignOp =
  | { op: 'set' | 'append' | 'inc'; path: string[]; value: ValueExpr }
  | { op: 'removeWhere'; path: string[]; key: string; value: ValueExpr }

export type CompareOp = 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte'

export type GuardExpr =
  | { op: CompareOp; left: ValueExpr; right: ValueExpr }
  | { op: 'and' | 'or'; args: GuardExpr[] }
  | { op: 'not'; arg: GuardExpr }
  | { op: 'fn'; fn: string; arg: ValueExpr }

export interface ViewIR {
  machine: string | null
  route: string | null
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
  | WidgetNode
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
}

export interface WidgetNode {
  id: string
  kind: 'widget'
  widget: string
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
