import type { Json } from '@tenon/core/ir'

export interface Snapshot {
  state: string
  context: Json
  entry: number
}

export type Input =
  | { type: 'event'; event: string; payload: Json }
  | { type: 'done'; entry: number; result: Json }
  | { type: 'failed'; entry: number; error: string; data: Json }
  | { type: 'timer'; entry: number; ms: number }

export type Effect =
  | { type: 'invoke'; entry: number; effect: string; input: Json }
  | { type: 'timer'; entry: number; ms: number }
  | { type: 'navigate'; url: string }

export interface Step {
  snapshot: Snapshot
  effects: Effect[]
  taken: string | null
}

export type Fns = Record<string, (input: never) => unknown>

export interface Env {
  context?: Json
  input?: Json
  event?: Json
  result?: Json
  error?: Json
  params?: Json
  search?: Json
  bindings?: Json[]
  dom?: (field: string) => Json
  routes?: Record<string, string>
}

export type Getter = (env: Env) => Json
export type Test = (env: Env) => boolean
export type Update = (context: Json, env: Env) => Json

export interface CompiledTransition {
  id: string
  guard: Test | null
  target: number
  assign: Update[]
  navigate: Getter | null
}

export interface CompiledState {
  name: string
  final: boolean
  on: Map<string, CompiledTransition[]>
  invoke: {
    effect: string
    input: Getter
    done: CompiledTransition[]
    failed: Map<string, CompiledTransition[]>
  } | null
  after: Map<number, CompiledTransition[]>
  timers: number[]
}

export interface CompiledMachine {
  feature: string
  initial: number
  initialContext: Json
  states: CompiledState[]
  index: Map<string, number>
  transitions: string[]
}
