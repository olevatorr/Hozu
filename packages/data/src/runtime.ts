import type { MutationDecl, QueryDecl } from '@hozu/core'
import {
  type AccessIR,
  type BuildResult,
  canonicalStringify,
  codes,
  type Diagnostic,
  type Freshness,
  type Json,
  join,
  type RemoteEffect,
  remoteContract,
  resolveSource,
  type TagExprIR,
} from '@hozu/core/ir'
import { compileGuard, compileValue, type Getter } from '@hozu/machine'
import { type DataCache, Lru, memoryDataCache } from './cache.ts'
import {
  fail,
  failureOf,
  implementationOf,
  REDIRECT,
  type RemoteOptions,
  type ResolverSet,
  type Run,
  redirectOf,
  resolverSetOf,
} from './resolvers.ts'
import type { MutationResult, Result, Stats } from './types.ts'

export class DataRuntimeError extends Error {
  readonly diagnostics: Diagnostic[]
  constructor(diagnostics: Diagnostic[]) {
    super(diagnostics.map((d) => `${d.code} ${d.message}`).join('\n'))
    this.name = 'DataRuntimeError'
    this.diagnostics = diagnostics
  }
}

interface Effect {
  ref: string
  kind: 'query' | 'mutation'
  scope: 'public' | 'user'
  freshness: Freshness
  tags: ((input: Json) => string)[]
  errors: Set<string>
  fields: string[]
  run: Run
  access: Access | null
}

/** A compiled access rule (ADR 0056 B). */
type Access =
  | { kind: 'anyone' }
  | { kind: 'signedIn' }
  | { kind: 'allow'; test: (env: object) => boolean }
  | {
      kind: 'owner'
      row: (row: Json) => Json
      session: (session: unknown) => Json
      load: { query: string; input: (input: Json) => Json } | null
    }

const same = (a: Json, b: Json) =>
  a != null && b != null && (a === b || canonicalStringify(a) === canonicalStringify(b))

const forbidden = (): Result => ({ ok: false, error: 'Forbidden', data: { message: 'Forbidden' } })

interface Entry {
  value: Result | null
  at: number
  refreshing: boolean
}

export interface ErrorInfo {
  effect?: string
  path?: string
}

export type OnError = (error: unknown, info: ErrorInfo) => void

/** A feature's fetch module (ADR 0049): one implementation per `'either'` / `'browser'` effect, by symbol. */
export type FetchModule = Record<string, unknown>

/** Loads a feature's fetch module; null when this host cannot (an edge without the module bundled in). */
export type FetchLoader = (feature: string) => Promise<FetchModule | null>

const FETCH_FAIL = Symbol.for('hozu.fetchFail')

interface HttpReply {
  status: number
  ok: boolean
  text(): Promise<string>
  json(): Promise<unknown>
}

const http = (url: string, init: object): Promise<HttpReply> =>
  (globalThis as unknown as { fetch: (url: string, init: object) => Promise<HttpReply> }).fetch(url, init)

const timeout = (ms: number): unknown =>
  (globalThis as unknown as { AbortSignal: { timeout(ms: number): unknown } }).AbortSignal.timeout(ms)

const base64 = (bytes: Uint8Array) => {
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return (globalThis as unknown as { btoa(s: string): string }).btoa(text)
}

const fileUrl = (path: string) =>
  `file://${path.startsWith('/') ? '' : '/'}${encodeURI(path.replace(/\\/g, '/'))}`

export interface DataRuntimeOptions {
  build: BuildResult
  resolvers: ResolverSet
  /** How this host loads `fetch.ts` for `'either'` effects; by default, `import()` of the file the build recorded. */
  fetches?: FetchLoader
  now?: () => number
  onError?: OnError
  /** The raw environment to parse; `null` skips parsing (tools that check bindings, not a running app). */
  env?: unknown
  /** Public query results (ADR 0050 A); by default `memoryDataCache()`, at most 10,000 entries. */
  cache?: DataCache
  /** Seconds after which a `'static'` entry is read again (ADR 0050 B); by default never. */
  staticTtl?: number
}

export interface FileLike {
  name: string
  type: string
  size: number
  arrayBuffer(): Promise<ArrayBuffer>
}

export interface RequestData {
  readonly session: unknown
  readonly readSession: boolean
  readonly written: { value: unknown } | null
  run(ref: string, input: Json, files?: Map<string, FileLike>): Promise<Result | MutationResult>
  endpoint(ref: string, input: Json, ctx: { request: unknown; bytes?: Uint8Array }): Promise<EndpointResult>
}

export interface DataRuntime {
  scope(session?: unknown, options?: { preview?: boolean }): RequestData
  query<I, O, E>(decl: QueryDecl<I, O, E, any>, input: I, session?: unknown): Promise<Result<O, E>>
  mutate<I, O, E>(
    decl: MutationDecl<I, O, E, any>,
    input: I,
    session?: unknown,
  ): Promise<MutationResult<O, E>>
  run(ref: string, input: Json, session?: unknown): Promise<Result | MutationResult>
  invalidate(tags: string[]): number
  tagsOf(ref: string, input: Json): string[]
  stats(): Stats
}

export type EndpointResult =
  | { ok: true; value: unknown; invalidated: string[]; redirect?: unknown }
  | {
      ok: false
      status: number
      error: string
      message: string
      fields: Record<string, string | null> | null
      /** Every field of the declared error's data, so the answer carries all of them (ADR 0056 A2). */
      data?: Record<string, unknown>
    }

const isResponse = (value: unknown): boolean =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { status?: unknown }).status === 'number' &&
  typeof (value as { headers?: unknown }).headers === 'object'

const unexpected = (message: string): Result => ({ ok: false, error: 'Unexpected', data: { message } })

const invalid = (keys: string[], issues: string[], given: Record<string, Json> = {}): Result => {
  const fields: Record<string, Json> = Object.fromEntries(keys.map((k) => [k, null]))
  for (const [k, v] of Object.entries(given)) if (typeof v === 'string') fields[k] = v
  for (const issue of issues) {
    const at = issue.indexOf(': ')
    const key = at < 0 ? '' : (issue.slice(0, at).split('.')[0] ?? '')
    if (key in fields && fields[key] === null) fields[key] = at < 0 ? issue : issue.slice(at + 2)
  }
  return { ok: false, error: 'Invalid', data: { message: issues.join('; '), fields } }
}

const tagKey = (tag: TagExprIR, get: Getter | null) => (input: Json) =>
  get ? `${tag.tag}(${canonicalStringify(get({ input }))})` : tag.tag

export function createDataRuntime({
  build,
  resolvers,
  cache = memoryDataCache(),
  staticTtl,
  now = Date.now,
  onError = () => {},
  env: rawEnv = {},
  fetches,
}: DataRuntimeOptions): DataRuntime {
  const { ir, bindings } = build
  const parsedEnv = rawEnv === null ? undefined : bindings.env.server?.(rawEnv)
  if (parsedEnv && !parsedEnv.ok)
    throw new Error(`Invalid server environment: ${parsedEnv.issues.join('; ')}`)
  const env = parsedEnv?.ok ? parsedEnv.value : {}
  const effects = new Map<string, Effect>()
  const problems: Diagnostic[] = []
  const problem = (
    pointer: string,
    feature: string | null,
    message: string,
    cause: string,
    symbol?: string,
    fix?: { summary: string; snippet: string | null },
  ) =>
    problems.push({
      code: 'HZ021',
      severity: codes.HZ021.severity,
      message,
      location: { feature, pointer, source: resolveSource(build.sources, pointer) },
      cause,
      fix: {
        ...(fix ?? {
          summary:
            'Add exactly one implement(decl, …) for every query, mutation and endpoint, in the resolvers of app.ts',
          snippet: symbol ? `implement(${symbol}, (input, ctx) => …),` : null,
        }),
        patch: null,
      },
    })

  const parsedPublic = rawEnv === null ? undefined : bindings.env.public?.(rawEnv)
  const publicEnv = parsedPublic?.ok ? parsedPublic.value : {}
  /** What fetch.ts reads on this server: the public env, with internal URLs where env.internal names one (ADR 0052). */
  const serverSideEnv: Record<string, unknown> = { ...(publicEnv as Record<string, unknown>) }
  for (const [key, server] of Object.entries(ir.env?.internal ?? {})) {
    const value = (env as Record<string, unknown>)[server]
    if (value !== undefined && value !== null && value !== '') serverSideEnv[key] = value
  }
  const loaded = new Map<string, Promise<FetchModule | null>>()
  const loadFetch: FetchLoader =
    fetches ??
    (async (feature) => {
      const file = bindings.fetches[feature]
      return file ? ((await import(/* @vite-ignore */ fileUrl(file))) as FetchModule) : null
    })
  const moduleOf = (feature: string) => {
    let m = loaded.get(feature)
    if (!m) {
      m = loadFetch(feature)
      loaded.set(feature, m)
    }
    return m
  }
  /** An `'either'` effect on this server: its fetch.ts implementation, with `fail` turned into a declared error. */
  const eitherRun =
    (feature: string, symbol: string): Run =>
    async (input, ctx) => {
      const mod = await moduleOf(feature)
      const impl = mod?.[symbol]
      if (typeof impl !== 'function')
        throw new Error(
          `${feature}.${symbol} runs on either side, but this server cannot load its fetch.ts; pass createHandler(app, { fetches })`,
        )
      try {
        return await (impl as (i: unknown, c: unknown) => unknown)(input, {
          fail: (error: string, data: unknown) => {
            throw { [FETCH_FAIL]: { error, data } }
          },
          signal: new (
            globalThis as unknown as { AbortController: new () => { signal: unknown } }
          ).AbortController().signal,
          env: serverSideEnv,
        })
      } catch (e) {
        const marked =
          typeof e === 'object' && e !== null
            ? (e as Record<symbol, { error: string; data: unknown }>)[FETCH_FAIL]
            : undefined
        if (marked) return ctx.fail(marked.error as never, marked.data as never)
        throw e
      }
    }
  const runsOf = (ref: string) => {
    const [f, s] = [ref.slice(0, ref.indexOf('.')), ref.slice(ref.indexOf('.') + 1)]
    return ir.features[f]?.queries[s]?.runs ?? ir.features[f]?.mutations[s]?.runs ?? 'server'
  }

  const runs = new Map<string, Run>()
  const remotes = new Map<RemoteOptions, string[]>()
  for (const impl of resolverSetOf(resolvers).list) {
    const { decl, run, remote } = implementationOf(impl)
    const ref = bindings.refs.get(decl)
    if (!ref) {
      problem(
        '',
        null,
        'Resolver implements a declaration that is not part of this project',
        'Only registered queries, mutations and endpoints can be implemented.',
        undefined,
        {
          summary:
            "Remove this implement(...), or add the declaration to its feature's declarations (a module listed in feature({ declarations }))",
          snippet: null,
        },
      )
      continue
    }
    if (remote) {
      if (runs.has(ref))
        problem(
          pointerOf(ir, ref),
          ref.split('.')[0]!,
          `${ref} is implemented twice`,
          'Each effect has exactly one implementation.',
          undefined,
          {
            summary: `List ${ref.split('.')[1]} in one remote() or one implement(…), not both`,
            snippet: null,
          },
        )
      remotes.set(remote, [...(remotes.get(remote) ?? []), ref])
      runs.set(ref, run)
      continue
    }
    if (runsOf(ref) !== 'server') {
      problem(
        pointerOf(ir, ref),
        ref.split('.')[0]!,
        `${ref} is implemented in the server resolvers, but runs: '${runsOf(ref)}'`,
        "Effects that are not runs: 'server' are implemented in the feature's fetch.ts (ADR 0049).",
        undefined,
        {
          summary: `Add runs: 'server' to ${ref} if it needs the server (a database, a secret, the session); otherwise move this implementation to the feature's fetch.ts`,
          snippet: "runs: 'server',",
        },
      )
      continue
    }
    if (runs.has(ref))
      problem(
        pointerOf(ir, ref),
        ref.split('.')[0]!,
        `${ref} is implemented twice`,
        'Each effect has exactly one implementation.',
        undefined,
        {
          summary: `Remove one of the two implement(${ref.split('.')[1]}, …) in the resolvers of app.ts`,
          snippet: null,
        },
      )
    runs.set(ref, run)
  }

  const serverEnv = (ir.env?.server?.properties ?? {}) as Record<string, unknown>
  for (const [options, refs] of remotes) {
    const contract = remoteContract(ir, refs)
    const hz093 = (ref: string | null, message: string, summary: string) =>
      problems.push({
        code: 'HZ093',
        severity: codes.HZ093.severity,
        message,
        location: {
          feature: ref?.split('.')[0] ?? null,
          pointer: ref ? pointerOf(ir, ref) : '/app',
          source: ref ? resolveSource(build.sources, pointerOf(ir, ref)) : null,
        },
        cause:
          'A remote service answers JSON for server effects only, through the contract hozu gen writes (ADR 0068).',
        fix: { summary, snippet: null, patch: null },
      })
    for (const p of contract.problems)
      hz093(
        p.ref,
        p.message,
        'Implement it with implement(…) in app.ts (or fetch.ts for a browser-run effect), and remove it from remote()',
      )
    if (!options.secret?.env)
      hz093(
        null,
        'remote() has no secret, so anyone who reaches the service could call it with any session',
        "Add secret: { env: 'SERVICE_SECRET' } to remote() and the same value to the service's Options.Secret",
      )
    for (const variable of [options.url, options.secret])
      if (typeof variable === 'object' && variable && !(variable.env in serverEnv))
        hz093(
          null,
          `remote() reads ${variable.env}, which project({ env: { server } }) does not declare`,
          `Add ${variable.env}: z.string().min(16) to the server env schema of hozu.config.ts`,
        )
    const secretValue = options.secret?.env ? (env as Record<string, unknown>)[options.secret.env] : undefined
    if (typeof secretValue === 'string' && secretValue.length < 16)
      hz093(
        null,
        `remote() secret ${options.secret.env} holds ${secretValue.length} characters; it needs 16 or more`,
        `Set ${options.secret.env} to a random value of 16 characters or more (openssl rand -hex 16)`,
      )
    for (const effect of contract.effects)
      runs.set(effect.ref, remoteRun(options, effect, contract.fingerprint))
  }

  const tagsOf = (list: TagExprIR[]) =>
    list.map((t) => tagKey(t, t.param ? compileValue(t.param, bindings.fns) : null))
  const endpoints = new Map<
    string,
    {
      run: Run
      mode: 'json' | 'redirect' | 'response'
      raw: boolean
      failed: Record<string, number>
      fields: string[]
      tags: ((input: Json) => string)[]
    }
  >()
  for (const feature of Object.values(ir.features)) {
    const register = (
      kind: 'query' | 'mutation',
      symbol: string,
      errors: Record<string, string>,
      tags: TagExprIR[],
      scope: 'public' | 'user',
      freshness: Freshness,
      access: AccessIR | undefined,
      fields: string[] = [],
    ) => {
      const ref = `${feature.id}.${symbol}`
      const where = kind === 'query' ? feature.queries[symbol]?.runs : feature.mutations[symbol]?.runs
      if (where === 'browser') return
      const run = where === 'either' ? eitherRun(feature.id, symbol) : runs.get(ref)
      if (!run) {
        problem(
          join('', 'features', feature.id, kind === 'query' ? 'queries' : 'mutations', symbol),
          feature.id,
          `${ref} has no implementation`,
          'Every query and mutation needs a resolver.',
          symbol,
        )
        return
      }
      effects.set(ref, {
        ref,
        kind,
        scope,
        freshness,
        errors: new Set(Object.keys(errors)),
        fields,
        tags: tagsOf(tags),
        run,
        access: where === 'server' && access ? compileAccess(access) : null,
      })
    }
    for (const [symbol, q] of Object.entries(feature.queries))
      register('query', symbol, q.errors, q.tags, q.scope, q.freshness, q.access)
    for (const [symbol, e] of Object.entries(feature.endpoints ?? {})) {
      const ref = `${feature.id}.${symbol}`
      const run = runs.get(ref)
      if (!run)
        problem(
          join('', 'features', feature.id, 'endpoints', symbol),
          feature.id,
          `${ref} has no implementation`,
          'Every endpoint needs a resolver.',
          symbol,
        )
      else
        endpoints.set(ref, {
          run,
          mode: e.mode,
          raw: e.raw === true,
          failed: e.failed ?? {},
          fields: Object.keys((feature.schemas[e.input]?.properties as object | undefined) ?? {}),
          tags: tagsOf(e.invalidates ?? []),
        })
    }
    for (const [symbol, m] of Object.entries(feature.mutations))
      register('mutation', symbol, m.errors, m.invalidates, 'user', { kind: 'request' }, m.access, [
        ...Object.keys((feature.schemas[m.input]?.properties as object | undefined) ?? {}),
      ])
  }
  if (problems.length) throw new DataRuntimeError(problems)

  /** A server effect answered by a service of another language over HTTP (ADR 0068). */
  function remoteRun(options: RemoteOptions, effect: RemoteEffect, fingerprint: string): Run {
    const read = (from: string | { env: string }, what: string) => {
      const value = typeof from === 'string' ? from : (env as Record<string, unknown>)[from.env]
      if (typeof value !== 'string' || !value)
        throw new Error(
          `${effect.ref} is remote, but ${what} ${typeof from === 'string' ? '' : from.env} is not set`,
        )
      return value
    }
    return async (input, ctx) => {
      const url = read(options.url, 'its URL')
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        'x-hozu-fingerprint': fingerprint,
      }
      headers['x-hozu-secret'] = read(options.secret, 'its secret')
      const session = effect.session ? ((ctx as { session?: unknown }).session ?? null) : null
      const request = ctx.request as { headers?: Iterable<[string, string]> } | undefined
      const forwarded =
        effect.kind === 'endpoint' && request?.headers
          ? Object.fromEntries([...request.headers].filter(([name]) => name !== 'cookie'))
          : {}
      const files: Record<string, { name: string; type: string; size: number; data: string }> = {}
      for (const [token, f] of ctx.uploads ?? [])
        files[token] = {
          name: f.name,
          type: f.type,
          size: f.size,
          data: base64(new Uint8Array(await f.arrayBuffer())),
        }
      const res = await http(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          effect: effect.ref,
          input,
          session,
          preview: ctx.preview,
          headers: forwarded,
          files,
        }),
        signal: timeout(options.timeout ?? 10_000),
      })
      if (res.status === 409)
        throw new Error(
          `${effect.ref}: the service at ${url} was built from another contract; run hozu gen and rebuild it`,
        )
      if (!res.ok)
        throw new Error(`${effect.ref}: ${url} answered ${res.status} ${(await res.text()).slice(0, 200)}`)
      const reply = (await res.json()) as {
        ok?: unknown
        fail?: { name: string; data: unknown }
        session?: unknown
      }
      if (Object.hasOwn(reply, 'session')) ctx.setSession(reply.session)
      return reply.fail ? ctx.fail(reply.fail.name, reply.fail.data) : reply.ok
    }
  }

  function compileAccess(a: AccessIR): Access {
    const fns = bindings.fns as never
    if (a.kind === 'anyone') return { kind: 'anyone' }
    if (a.kind === 'signedIn') return { kind: 'signedIn' }
    if (a.kind === 'allow') {
      const test = compileGuard(a.test, fns)
      return { kind: 'allow', test: (env) => test(env as never) }
    }
    const row = compileValue(a.row, fns)
    const session = compileValue(a.session, fns)
    const input = a.load ? compileValue(a.load.input, fns) : null
    return {
      kind: 'owner',
      row: (r) => row({ result: r } as never),
      session: (s) => session({ session: s } as never),
      load: a.load && input ? { query: a.load.query, input: (i) => input({ input: i } as never) } : null,
    }
  }
  const production = rawEnv !== null && (rawEnv as Record<string, unknown>).NODE_ENV === 'production'
  const reportedRows = new Set<string>()

  const parsedInputs = new Lru<{ input: Json; key: string }>(10_000)
  const stats = { fetches: 0, hits: 0, deduped: 0, invalidated: 0 }

  const check = (key: string, value: unknown): string[] | null => bindings.checks[key]?.(value) ?? null
  const parse = (ref: string, input: Json): { ok: true; value: Json } | { ok: false; issues: string[] } => {
    const p = bindings.parses?.[`${ref}#input`]
    if (p) return p(input) as { ok: true; value: Json } | { ok: false; issues: string[] }
    const issues = check(`${ref}#input`, input)
    return issues ? { ok: false, issues } : { ok: true, value: input }
  }

  const cached = (effect: Effect) =>
    effect.kind === 'query' &&
    effect.scope === 'public' &&
    effect.freshness.kind !== 'request' &&
    effect.freshness.kind !== 'live'

  function entryOf(effect: Effect, key: string, input: Json): Entry {
    let entry = cache.get(key) as Entry | undefined
    if (!entry) {
      entry = { value: null, at: 0, refreshing: false }
      cache.set(
        key,
        entry,
        effect.tags.map((t) => t(input)),
      )
    }
    return entry
  }

  function invalidate(tags: string[]): number {
    const count = cache.deleteTags(tags)
    stats.invalidated += count
    return count
  }

  const noSession = () => {
    throw new Error('Only mutations can set the session')
  }
  const noFiles = new Map<string, FileLike>()

  async function refresh(scope: Scope, effect: Effect, entry: Entry, input: Json): Promise<Result> {
    const started = now()
    const result = await scope.execute(effect, input)
    if (result.ok) {
      entry.value = result
      entry.at = started
    }
    return result
  }

  async function read(scope: Scope, effect: Effect, key: string, input: Json): Promise<Result> {
    if (scope.preview || !cached(effect)) return scope.execute(effect, input)
    const entry = entryOf(effect, key, input)
    const f = effect.freshness as Exclude<Freshness, { kind: 'request' } | { kind: 'live' }>
    if (entry.value) {
      const ttl =
        f.kind === 'static'
          ? (staticTtl ?? Number.POSITIVE_INFINITY)
          : f.kind === 'poll'
            ? f.seconds / 2
            : f.seconds
      if (now() - entry.at < ttl * 1000) {
        stats.hits++
        return entry.value
      }
      if (f.kind === 'swr') {
        stats.hits++
        if (!entry.refreshing) {
          entry.refreshing = true
          void refresh(scope, effect, entry, input).finally(() => {
            entry.refreshing = false
          })
        }
        return entry.value
      }
    }
    return refresh(scope, effect, entry, input)
  }

  class Scope implements RequestData {
    session: unknown
    readSession = false
    written: { value: unknown } | null = null
    readonly preview: boolean
    #checked = false
    #memo: Map<string, Promise<Result>> | null = null

    constructor(session: unknown, preview: boolean) {
      this.session = session ?? null
      this.preview = preview
    }

    #ctx<T extends object>(ctx: T): T & { session: unknown } {
      return Object.defineProperty(ctx as T & { session: unknown }, 'session', {
        enumerable: true,
        get: () => {
          this.readSession = true
          return this.session
        },
      })
    }

    setSession = (value: unknown) => {
      const issues = value === null ? null : check('#session', value)
      if (issues) throw new Error(`Invalid session: ${issues.join('; ')}`)
      this.session = value
      this.#checked = true
      this.written = { value }
      this.#memo = null
    }

    async execute(effect: Effect, input: Json, files: Map<string, FileLike> = noFiles): Promise<Result> {
      stats.fetches++
      let out: unknown
      const file = async (token: string) => {
        const f = files.get(token)
        return f
          ? { name: f.name, type: f.type, size: f.size, bytes: new Uint8Array(await f.arrayBuffer()) }
          : null
      }
      const report = (error: unknown) => {
        onError(error, { effect: effect.ref })
        return unexpected(error instanceof Error ? error.message : String(error))
      }
      const ctx = {
        env,
        preview: this.preview,
        fail,
        file,
        uploads: files,
        setSession: effect.kind === 'mutation' ? this.setSession : noSession,
      }
      try {
        out = await effect.run(input, effect.scope === 'user' ? this.#ctx(ctx) : (ctx as never))
      } catch (error) {
        return report(error)
      }
      const failure = failureOf(out)
      if (failure) {
        if (failure.error === 'Invalid' && effect.kind === 'mutation') {
          const data = failure.data as { message?: unknown; fields?: unknown } | null
          if (typeof data?.message === 'string' && typeof data.fields === 'object' && data.fields !== null) {
            const filled = invalid(effect.fields, [], data.fields as Record<string, Json>)
            return filled.ok
              ? filled
              : { ...filled, data: { ...(filled.data as object), message: data.message } }
          }
          return report(new Error(`Invalid data from ${effect.ref} must be { message, fields }`))
        }
        if (!effect.errors.has(failure.error))
          return report(new Error(`Undeclared error "${failure.error}" from ${effect.ref}`))
        const issues = check(`${effect.ref}#error:${failure.error}`, failure.data)
        if (issues)
          return report(new Error(`Invalid ${failure.error} data from ${effect.ref}: ${issues.join('; ')}`))
        return { ok: false, error: failure.error, data: failure.data as Json }
      }
      const issues = check(`${effect.ref}#output`, out)
      if (issues) return report(new Error(`Invalid output from ${effect.ref}: ${issues.join('; ')}`))
      const owned = effect.kind === 'query' ? this.#owned(effect, out as Json) : null
      if (owned) return owned.result ?? { ok: true, value: owned.rows }
      return { ok: true, value: out as Json }
    }

    /**
     * Query `owner` (ADR 0056 B): one row that is not the visitor's is Forbidden; a list with such rows means the
     * resolver read too much (HZ091): an error in development, the rows dropped and logged once in production.
     */
    #owned(effect: Effect, out: Json): { result: Result | null; rows: Json } | null {
      const a = effect.access
      if (a?.kind !== 'owner') return null
      const me = a.session(this.session)
      const mine = (row: Json) => same(a.row(row), me)
      if (!Array.isArray(out)) return mine(out) ? null : { result: forbidden(), rows: null }
      const foreign = out.filter((row) => !mine(row))
      if (!foreign.length) return null
      const error = new Error(
        `HZ091 ${effect.ref} returned ${foreign.length} row${foreign.length === 1 ? '' : 's'} the visitor does not own: read only the visitor's rows in the resolver`,
      )
      if (!production) {
        onError(error, { effect: effect.ref })
        return { result: unexpected(error.message), rows: null }
      }
      if (!reportedRows.has(effect.ref)) {
        reportedRows.add(effect.ref)
        onError(error, { effect: effect.ref })
      }
      return { result: null, rows: out.filter(mine) }
    }

    /** The access checks made before the resolver runs (ADR 0056 B); null lets it run. */
    async #refused(effect: Effect, input: Json): Promise<Result | null> {
      const a = effect.access
      if (!a || a.kind === 'anyone') return null
      this.readSession = true
      if (this.session === null) return forbidden()
      if (a.kind === 'signedIn') return null
      if (a.kind === 'allow') return a.test({ session: this.session, input }) ? null : forbidden()
      if (effect.kind === 'query') return null
      const me = a.session(this.session)
      if (!a.load) return same(a.row(input), me) ? null : forbidden()
      const loaded = await this.run(a.load.query, a.load.input(input))
      if (!loaded.ok) return forbidden()
      return same(a.row(loaded.value), me) ? null : forbidden()
    }

    #validSession(): Result | null {
      if (this.#checked || this.session === null) return null
      const issues = check('#session', this.session)
      if (issues) return unexpected(`Invalid session: ${issues.join('; ')}`)
      this.#checked = true
      return null
    }

    async run(ref: string, raw: Json, files?: Map<string, FileLike>): Promise<Result | MutationResult> {
      const effect = effects.get(ref)
      if (!effect) return unexpected(`Unknown effect ${ref}`)
      if (effect.scope === 'user') {
        const bad = this.#validSession()
        if (bad) return effect.kind === 'mutation' ? { ...bad, invalidated: [] } : bad
      }
      const shared = cached(effect) ? `${ref}${canonicalStringify(raw)}` : null
      let known = shared === null ? undefined : parsedInputs.get(shared)
      if (!known) {
        const parsed = parse(ref, raw)
        if (!parsed.ok)
          return effect.kind === 'mutation'
            ? { ...invalid(effect.fields, parsed.issues), invalidated: [] }
            : unexpected(`Invalid input for ${ref}: ${parsed.issues.join('; ')}`)
        known = { input: parsed.value, key: `${ref}${canonicalStringify(parsed.value)}` }
        if (shared !== null) parsedInputs.set(shared, known)
      }
      const { input, key } = known
      const refused = await this.#refused(effect, input)
      if (refused) return effect.kind === 'mutation' ? { ...refused, invalidated: [] } : refused
      if (effect.kind === 'query') {
        this.#memo ??= new Map()
        const hit = this.#memo.get(key)
        if (hit) {
          stats.deduped++
          return hit
        }
        const next = read(this, effect, key, input)
        this.#memo.set(key, next)
        return next
      }
      const before = this.written
      const result = await this.execute(effect, input, files)
      this.#memo = null
      const after = this.written as { value: unknown } | null
      const extra = after && after !== before ? { session: after.value as Json } : {}
      if (!result.ok) return { ...result, invalidated: [], ...extra }
      const tags = [...new Set(effect.tags.map((t) => t(input)))]
      invalidate(tags)
      return { ...result, invalidated: tags, ...extra }
    }

    async endpoint(
      ref: string,
      raw: Json,
      { request, bytes }: { request: unknown; bytes?: Uint8Array },
    ): Promise<EndpointResult> {
      const e = endpoints.get(ref)
      if (!e)
        return { ok: false, status: 404, error: 'NotFound', message: `Unknown endpoint ${ref}`, fields: null }
      const parsed = e.raw ? { ok: true as const, value: null } : parse(ref, raw)
      if (!parsed.ok) {
        const bad = invalid(e.fields, parsed.issues) as unknown as {
          data: { message: string; fields: Record<string, string | null> }
        }
        return {
          ok: false,
          status: 400,
          error: 'Invalid',
          message: bad.data.message,
          fields: bad.data.fields,
        }
      }
      const report = (error: unknown): EndpointResult => {
        onError(error, { effect: ref })
        return { ok: false, status: 500, error: 'Unexpected', message: 'Internal error', fields: null }
      }
      let out: unknown
      try {
        out = await e.run(
          parsed.value,
          this.#ctx({
            env,
            preview: this.preview,
            fail,
            setSession: this.setSession,
            file: async () => null,
            request,
            redirect: (to: unknown) => Object.freeze({ [REDIRECT]: to }),
            bytes: e.raw ? (bytes ?? new Uint8Array()) : null,
          }) as never,
        )
      } catch (error) {
        return report(error)
      }
      this.#memo = null
      const failure = failureOf(out)
      if (failure) {
        const { error, data } = failure
        const status = error === 'Invalid' ? 400 : e.failed[error]
        const wrong = error === 'Invalid' ? null : check(`${ref}#error:${error}`, data)
        if (!status || wrong)
          return report(
            new Error(
              `${ref} failed with ${error}, ${status ? `whose data is invalid: ${wrong!.join('; ')}` : 'which it does not declare in failed'}`,
            ),
          )
        const d = (data ?? {}) as { message?: unknown; fields?: unknown }
        return {
          ok: false,
          status,
          error,
          message: typeof d.message === 'string' ? d.message : error,
          fields:
            d.fields && typeof d.fields === 'object' ? (d.fields as Record<string, string | null>) : null,
          ...(data && typeof data === 'object' && !Array.isArray(data)
            ? { data: data as Record<string, unknown> }
            : {}),
        }
      }
      const done = (value: unknown, ok: boolean, redirect?: unknown): EndpointResult => {
        const tags = ok ? [...new Set(e.tags.map((t) => t(parsed.value)))] : []
        invalidate(tags)
        return { ok: true, value, invalidated: tags, ...(redirect ? { redirect } : {}) }
      }
      if (e.mode === 'redirect') {
        const to = redirectOf(out)
        return to ? done(null, true, to) : report(new Error(`${ref} must return redirect(ui.link(…))`))
      }
      if (e.mode === 'response')
        return isResponse(out)
          ? done(out, (out as { status: number }).status < 400)
          : report(new Error(`${ref} must return a Response`))
      const wrong = check(`${ref}#output`, out)
      return wrong ? report(new Error(`Invalid output from ${ref}: ${wrong.join('; ')}`)) : done(out, true)
    }
  }

  const scope = (session?: unknown, { preview = false }: { preview?: boolean } = {}): RequestData =>
    new Scope(session, preview)

  const refOf = (decl: object) => {
    const ref = bindings.refs.get(decl)
    if (!ref) throw new TypeError('This declaration is not part of the project the runtime was built from')
    return ref
  }

  return {
    scope,
    query: (decl, input, session) => scope(session).run(refOf(decl), input as Json) as never,
    mutate: (decl, input, session) => scope(session).run(refOf(decl), input as Json) as never,
    run: (ref, input, session) => scope(session).run(ref, input),
    invalidate,
    tagsOf: (ref, input) => {
      const effect = effects.get(ref)
      const parsed = effect ? parse(ref, input) : null
      return effect && parsed?.ok ? effect.tags.map((t) => t(parsed.value)) : []
    },
    stats: () => ({ entries: cache.size, evictions: cache.evictions, ...stats }),
  }
}

function pointerOf(ir: BuildResult['ir'], ref: string): string {
  const [feature, symbol] = ref.split('.') as [string, string]
  const registry = ir.features[feature]?.queries[symbol] ? 'queries' : 'mutations'
  return join('', 'features', feature, registry, symbol)
}
