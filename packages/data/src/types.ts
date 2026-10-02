import type { Json } from '@hozu/core/ir'

export type Unexpected = { ok: false; error: 'Unexpected'; data: { message: string } }

export type Result<O = Json, E = Record<string, Json>> =
  | { ok: true; value: O }
  | { [K in keyof E & string]: { ok: false; error: K; data: E[K] } }[keyof E & string]
  | Unexpected

export type MutationResult<O = Json, E = Record<string, Json>> = Result<O, E> & {
  invalidated: string[]
  session?: Json
}

export interface Stats {
  /** Entries now in the data cache. */
  entries: number
  /** Entries the cache dropped to stay within its bound. */
  evictions: number
  fetches: number
  hits: number
  deduped: number
  invalidated: number
}
