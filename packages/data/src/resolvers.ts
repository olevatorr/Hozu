import type { EndpointDecl, MutationDecl, ProjectDecl, QueryDecl, Scope } from '@hozu/core'

export const FAIL = Symbol.for('hozu.fail')
const IMPLEMENTATION = Symbol.for('hozu.implementation')
const RESOLVERS = Symbol.for('hozu.resolvers')

export interface Failure<E> {
  readonly [FAIL]: { error: keyof E & string; data: unknown }
}

export type Fail<E> = <K extends keyof E & string>(error: K, data: E[K]) => Failure<E>

type Out<O, E> = O | Failure<E> | Promise<O | Failure<E>>

export type QueryContext<Sc extends Scope, Session, E, Env = unknown> = Sc extends 'user'
  ? { session: Session | null; fail: Fail<E>; env: Env; preview: boolean }
  : { fail: Fail<E>; env: Env; preview: boolean }

export interface InvalidInput<I = Record<string, unknown>> {
  message: string
  fields: { [K in keyof I & string]?: string | null }
}

export type WithInvalid<E, I = Record<string, unknown>> = E & { Invalid: InvalidInput<I> }

export interface MutationContext<Session, E, Env = unknown, I = Record<string, unknown>> {
  env: Env
  preview: boolean
  session: Session | null
  fail: Fail<WithInvalid<E, I>>
  setSession(value: Session | null): void
  file(token: string): Promise<Upload | null>
}

export type WebRequest = typeof globalThis extends { Request: { prototype: infer R } } ? R : unknown

export interface EndpointContext<Session, Env = unknown> {
  request: WebRequest
  env: Env
  preview: boolean
  session: Session | null
  setSession(value: Session | null): void
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
    env: unknown
    preview: boolean
    session: unknown
    fail: Fail<any>
    setSession(value: unknown): void
    file(token: string): Promise<Upload | null>
    request?: unknown
  },
) => unknown

export interface Implementation {
  readonly [IMPLEMENTATION]: { decl: object; run: Run }
}

export interface Implement<Session, Env = unknown> {
  <I, O, E, Sc extends Scope>(
    decl: QueryDecl<I, O, E, Sc>,
    run: (input: I, ctx: QueryContext<Sc, Session, E, Env>) => Out<O, E>,
  ): Implementation
  <I, O, E>(
    decl: MutationDecl<I, O, E>,
    run: (
      input: I,
      ctx: MutationContext<Session, NoInfer<E>, Env, NoInfer<I>>,
    ) => Out<O, WithInvalid<NoInfer<E>, NoInfer<I>>>,
  ): Implementation
  <I, O>(
    decl: EndpointDecl<I, O>,
    run: (input: I, ctx: EndpointContext<Session, Env>) => O | Promise<O>,
  ): Implementation
}

export interface ResolverSet {
  readonly [RESOLVERS]: { project: object; list: Implementation[] }
}

const implement = ((decl: object, run: Run): Implementation =>
  Object.freeze({ [IMPLEMENTATION]: { decl, run } })) as Implement<any>

export const resolvers = <Session, Env>(
  project: ProjectDecl<Session, Env>,
  define: (implement: Implement<Session, Env>) => Implementation[],
): ResolverSet =>
  Object.freeze({ [RESOLVERS]: { project, list: define(implement as Implement<Session, Env>) } })

export const implementationOf = (i: Implementation) => i[IMPLEMENTATION]

export const resolverSetOf = (r: ResolverSet) => r[RESOLVERS]

export const fail: Fail<any> = (error, data) => Object.freeze({ [FAIL]: { error, data } })

export const failureOf = (value: unknown): Failure<any>[typeof FAIL] | null =>
  typeof value === 'object' && value !== null ? ((value as Partial<Failure<any>>)[FAIL] ?? null) : null
