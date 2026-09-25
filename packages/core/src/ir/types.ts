export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

export type JsonSchema = { [key: string]: Json }

export interface ProjectIR {
  irVersion: 1
  site: SiteIR | null
  session: JsonSchema | null
  routes: Record<string, RouteIR>
  pages: Record<string, PageIR>
  features: Record<string, FeatureIR>
}

export interface SiteIR {
  url: string
  name: string
  lang: string
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
}

export interface EntriesIR {
  query: string
  input: ValueExpr
  params: ValueExpr
}

export interface RouteIR {
  path: string
  params: JsonSchema | null
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
  contracts: Record<string, ContractIR>
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
  navigate: string | null
}

export type RefSource = 'context' | 'event' | 'result' | 'error' | 'input' | 'params'

export type ValueExpr =
  | { ref: RefSource; path: string[] }
  | { ref: 'binding'; depth: number; path: string[] }
  | { literal: Json }
  | { object: Record<string, ValueExpr> }
  | { fn: string; arg: ValueExpr }

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

export type DomEvent = 'click' | 'submit'

export interface SendIR {
  event: string
  payload: ValueExpr
}

export type ViewNode = ElementNode | TextNode | WhenNode | EachNode | QueryNode | EmbedNode

export interface ElementNode {
  id: string
  kind: 'el'
  tag: string
  class: string | null
  attrs: Record<string, ValueExpr>
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
  children: ViewNode[]
}

export interface EachNode {
  id: string
  kind: 'each'
  source: ValueExpr
  key: string
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

export interface EffectCallIR {
  effect: string
  input: Json
}
