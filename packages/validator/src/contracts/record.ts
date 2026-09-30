import type {
  AssignOp,
  EndpointMode,
  EndpointStatus,
  GuardExpr,
  HeadFailureIR,
  ValueExpr,
} from '@hozu/core/ir'

export interface EnteredRecord {
  state: string
  effect: string | null
  input: ValueExpr | null
  timers: number[]
  final: boolean
}

export interface BehaviorRecord {
  guard: GuardExpr | null
  assign: AssignOp[]
  navigate: ValueExpr | null
  enters: EnteredRecord
  fns: Record<string, string | null>
}

export interface LockEntryV2 {
  behavior: string
  summary: string
  decides: boolean
  fields: BehaviorRecord
  contracts: Record<string, string>
}

export interface EndpointLockV2 {
  mode: EndpointMode
  failed: Record<string, EndpointStatus>
}

export interface PagesLockV2 {
  head: Record<string, Record<string, HeadFailureIR>>
  endpoints: Record<string, EndpointLockV2>
  redirects: Record<string, { to: string; permanent: boolean }>
}

export interface LockfileV2 {
  version: 2
  features: Record<string, Record<string, LockEntryV2>>
  pages: PagesLockV2
}
