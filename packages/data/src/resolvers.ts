import type { EndpointDecl, Href, MutationDecl, ProjectDecl, QueryDecl, Redirect, Scope } from '@hozu/core'

export const FAIL = Symbol.for('hozu.fail')
const IMPLEMENTATION = Symbol.for('hozu.implementation')
const RESOLVERS = Symbol.for('hozu.resolvers')

export interface Failure<E> {
  readonly [FAIL]: { error: keyof E & string; data: unknown }
}

export type Fail<E> = <K extends keyof E & string>(error: K, data: E[K]) => Failure<E>

type Out<O, E> = O | Failure<E> | Promise<O | Failure<E>>

/** The framework error a resolver of a user effect may answer, like `access` would (ADR 0069 B8). */
export type WithForbidden<E> = E & { Forbidden: { message?: string } }

export type QueryContext<
  Sc extends Scope,
  Session,
  E,
  Env = unknown,
  Sg extends boolean = false,
> = Sc extends 'user'
  ? {
      session: Sg extends true ? Session : Session | null
      fail: Fail<WithForbidden<E>>
      env: Env
      preview: boolean
    }
  : { fail: Fail<E>; env: Env; preview: boolean }

export interface InvalidInput<I = Record<string, unknown>> {
  message: string
  fields: { [K in keyof I & string]?: string | null }
}

export type WithInvalid<E, I = Record<string, unknown>> = E & { Invalid: InvalidInput<I> }

export interface MutationContext<
  Session,
  E,
  Env = unknown,
  I = Record<string, unknown>,
  Sg extends boolean = false,
> {
  env: Env
  preview: boolean
  session: Sg extends true ? Session : Session | null
  fail: Fail<WithForbidden<WithInvalid<E, I>>>
  setSession(value: Session | null): void
  file(token: string): Promise<Upload | null>
}

export type WebRequest = typeof globalThis extends { Request: { prototype: infer R } } ? R : unknown

export interface EndpointContext<
  Session,
  E = Record<never, never>,
  Env = unknown,
  I = Record<string, unknown>,
> {
  request: WebRequest
  env: Env
  preview: boolean
  session: Session | null
  setSession(value: Session | null): void
  fail: Fail<WithInvalid<E, I>>
  redirect(to: Href): Redirect
  bytes: Uint8Array | null
}

export const REDIRECT = Symbol.for('hozu.redirect')

export const redirectOf = (value: unknown): unknown =>
  typeof value === 'object' && value !== null ? ((value as Record<symbol, unknown>)[REDIRECT] ?? null) : null

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
    /** The files this call carries, by token: a remote() resolver sends them to its service (ADR 0068). */
    uploads?: ReadonlyMap<
      string,
      { name: string; type: string; size: number; arrayBuffer(): Promise<ArrayBuffer> }
    >
    request?: unknown
    redirect?(to: unknown): unknown
    bytes?: Uint8Array | null
  },
) => unknown

/** A service in another language that implements some server effects (ADR 0068). */
export interface RemoteOptions {
  /** Where the service listens, or the server env variable that holds it. */
  url: string | { env: string }
  /** The contract `hozu gen` writes for the service; `hozu check` compares it with the declarations (HZ093). */
  contract: { readonly href: string }
  /**
   * A server env variable (16 characters or more) whose value every call sends as `x-hozu-secret`: the service
   * trusts the session in the call, so it must answer only the Hozu server.
   */
  secret: { env: string }
  /** Milliseconds before a call answers `Unexpected`; 10 000 by default. */
  timeout?: number
}

export interface Implementation {
  readonly [IMPLEMENTATION]: { decl: object; run: Run; remote?: RemoteOptions }
}

export interface Implement<Session, Env = unknown> {
  <I, O, E, Sc extends Scope, Sg extends boolean>(
    decl: QueryDecl<I, O, E, Sc, Sg>,
    run: (input: I, ctx: QueryContext<Sc, Session, E, Env, Sg>) => Out<O, WithForbidden<E>>,
  ): Implementation
  <I, O, E, Sg extends boolean>(
    decl: MutationDecl<I, O, E, any, Sg>,
    run: (
      input: I,
      ctx: MutationContext<Session, NoInfer<E>, Env, NoInfer<I>, Sg>,
    ) => Out<O, WithForbidden<WithInvalid<NoInfer<E>, NoInfer<I>>>>,
  ): Implementation
  <I, O, E>(
    decl: EndpointDecl<I, O, E>,
    run: (
      input: I,
      ctx: EndpointContext<Session, NoInfer<E>, Env, NoInfer<I>>,
    ) => Out<O, WithInvalid<NoInfer<E>, NoInfer<I>>>,
  ): Implementation
}

export interface ResolverSet<Session = unknown, Env = unknown> {
  readonly [RESOLVERS]: { project: object; list: Implementation[] }
  /** Carries the project's session and env types to `app()`; never set. */
  readonly types?: { session: Session; env: Env }
}

const implement = ((decl: object, run: Run): Implementation =>
  Object.freeze({ [IMPLEMENTATION]: { decl, run } })) as Implement<any>

export const resolvers = <Session, Env>(
  project: ProjectDecl<Session, Env>,
  define: (implement: Implement<Session, Env>) => Implementation[],
): ResolverSet<Session, Env> =>
  Object.freeze({ [RESOLVERS]: { project, list: define(implement as Implement<Session, Env>) } })

type AnyDecl = QueryDecl | MutationDecl | EndpointDecl

const unbound: Run = () => {
  throw new Error('A remote resolver runs only inside the data runtime')
}

/** Implements the declarations in a service of another language, called over HTTP with the generated contract. */
export const remote = (options: RemoteOptions, decls: readonly AnyDecl[]): Implementation[] => {
  const shared = Object.freeze({ ...options })
  return decls.map((decl) => Object.freeze({ [IMPLEMENTATION]: { decl, run: unbound, remote: shared } }))
}

export const implementationOf = (i: Implementation) => i[IMPLEMENTATION]

export const resolverSetOf = (r: ResolverSet) => r[RESOLVERS]

export const fail: Fail<any> = (error, data) => Object.freeze({ [FAIL]: { error, data } })

export const failureOf = (value: unknown): Failure<any>[typeof FAIL] | null =>
  typeof value === 'object' && value !== null ? ((value as Partial<Failure<any>>)[FAIL] ?? null) : null

/** Each `remote()` group of a resolver set with the refs it implements, in order (for `hozu gen` and `hozu check`). */
export const remotesOf = (
  set: ResolverSet,
  refOf: (decl: object) => string | undefined,
): { options: RemoteOptions; refs: string[] }[] => {
  const groups = new Map<RemoteOptions, string[]>()
  for (const impl of resolverSetOf(set).list) {
    const { decl, remote: options } = implementationOf(impl)
    const ref = refOf(decl)
    if (!options || !ref) continue
    groups.set(options, [...(groups.get(options) ?? []), ref])
  }
  return [...groups].map(([options, refs]) => ({ options, refs }))
}
