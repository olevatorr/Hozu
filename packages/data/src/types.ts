import type { Json } from '@tenon/core/ir'

export type Unexpected = { ok: false; error: 'Unexpected'; data: { message: string } }

export type Result<O = Json, E = Record<string, Json>> =
  | { ok: true; value: O }
  | { [K in keyof E & string]: { ok: false; error: K; data: E[K] } }[keyof E & string]
  | Unexpected

export type MutationResult<O = Json, E = Record<string, Json>> = Result<O, E> & { invalidated: string[] }

export interface Stats {
  entries: number
  fetches: number
  hits: number
  deduped: number
  invalidated: number
}
