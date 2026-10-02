import type { MutationDecl, QueryDecl } from './builders/effects.ts'

type Implementation<D> =
  D extends QueryDecl<infer I, infer O, infer E>
    ? FetchImplementation<I, O, E>
    : D extends MutationDecl<infer I, infer O, infer E>
      ? FetchImplementation<I, O, E & { Invalid: { message: string; fields: Record<string, string | null> } }>
      : never

/** Thrown by `fail`; the runner turns it into the declared error result. */
export class FetchFailure {
  readonly error: string
  readonly data: unknown
  constructor(error: string, data: unknown) {
    this.error = error
    this.data = data
  }
}

export interface FetchContext<E> {
  /** Ends the call with a declared error (or `Invalid` for a mutation). */
  fail<K extends keyof E & string>(error: K, data: E[K]): never
  /** Aborted when the input changes or the page goes away. */
  signal: AbortSignal
  /** The parsed `public` environment (ADR 0019); server env and the session never reach here. */
  env: Record<string, unknown>
}

export type FetchImplementation<I = any, O = any, E = any> = (
  input: I,
  context: FetchContext<E>,
) => O | Promise<O>

/**
 * One effect of a feature's `fetch.ts` (ADR 0049), exported under the effect's name:
 * `export const myRepos = implement<typeof model.myRepos>(async (input, { fail, signal, env }) => …)`.
 * It runs in the browser, and on the server for `runs: 'either'`.
 */
export const implement = <D extends QueryDecl | MutationDecl>(fn: Implementation<D>): Implementation<D> => fn
