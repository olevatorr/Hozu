import type { MutationDecl, ProjectDecl, QueryDecl, Scope } from '@tenon/core'

export const FAIL = Symbol.for('tenon.fail')
const IMPLEMENTATION = Symbol.for('tenon.implementation')
const RESOLVERS = Symbol.for('tenon.resolvers')

export interface Failure<E> {
  readonly [FAIL]: { error: keyof E & string; data: unknown }
}

export type Fail<E> = <K extends keyof E & string>(error: K, data: E[K]) => Failure<E>

type Out<O, E> = O | Failure<E> | Promise<O | Failure<E>>

export type QueryContext<Sc extends Scope, Session, E> = Sc extends 'user'
  ? { session: Session | null; fail: Fail<E> }
  : { fail: Fail<E> }

export interface MutationContext<Session, E> {
  session: Session | null
  fail: Fail<E>
  setSession(value: Session | null): void
  file(token: string): Promise<Upload | null>
}

export interface Upload {
  name: string
  type: string
  size: number
  bytes: Uint8Array
}

export type Run = (
  input: unknown,
  ctx: {
    session: unknown
    fail: Fail<any>
    setSession(value: unknown): void
    file(token: string): Promise<Upload | null>
  },
) => unknown

export interface Implementation {
  readonly [IMPLEMENTATION]: { decl: object; run: Run }
}

export interface Implement<Session> {
  <I, O, E, Sc extends Scope>(
    decl: QueryDecl<I, O, E, Sc>,
    run: (input: I, ctx: QueryContext<Sc, Session, E>) => Out<O, E>,
  ): Implementation
  <I, O, E>(
    decl: MutationDecl<I, O, E>,
    run: (input: I, ctx: MutationContext<Session, E>) => Out<O, E>,
  ): Implementation
}

export interface ResolverSet {
  readonly [RESOLVERS]: { project: object; list: Implementation[] }
}

const implement = ((decl: object, run: Run): Implementation =>
  Object.freeze({ [IMPLEMENTATION]: { decl, run } })) as Implement<any>

export const resolvers = <Session>(
  project: ProjectDecl<Session>,
  define: (implement: Implement<Session>) => Implementation[],
): ResolverSet => Object.freeze({ [RESOLVERS]: { project, list: define(implement as Implement<Session>) } })

export const implementationOf = (i: Implementation) => i[IMPLEMENTATION]

export const resolverSetOf = (r: ResolverSet) => r[RESOLVERS]

export const fail: Fail<any> = (error, data) => Object.freeze({ [FAIL]: { error, data } })

export const failureOf = (value: unknown): Failure<any>[typeof FAIL] | null =>
  typeof value === 'object' && value !== null ? ((value as Partial<Failure<any>>)[FAIL] ?? null) : null
