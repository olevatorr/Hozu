import type { MutationDecl, QueryDecl } from '@hozu/core'
import {
  type BuildResult,
  canonicalStringify,
  codes,
  type Diagnostic,
  type Freshness,
  type Json,
  join,
  resolveSource,
  type TagExprIR,
} from '@hozu/core/ir'
import { compileValue, type Getter } from '@hozu/machine'
import { type DataCache, Lru, memoryDataCache } from './cache.ts'
import {
  fail,
  failureOf,
  implementationOf,
  REDIRECT,
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
}

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

const fileUrl = (path: string) =>
  `file://${path.startsWith('/') ? '' : '/'}${encodeURI(path.replace(/\\/g, '/'))}`

export interface DataRuntimeOptions {
  build: BuildResult
  resolvers: ResolverSet
  /** How this host loads `fetch.ts` for `'either'` effects; by default, `import()` of the file the build recorded. */
  fetches?: FetchLoader
  now?: () => number
  onError?: OnError
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
  mutate<I, O, E>(decl: MutationDecl<I, O, E>, input: I, session?: unknown): Promise<MutationResult<O, E>>
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
  const parsedEnv = bindings.env.server?.(rawEnv)
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
  ) =>
    problems.push({
      code: 'HZ021',
      severity: codes.HZ021.severity,
      message,
      location: { feature, pointer, source: resolveSource(build.sources, pointer) },
      cause,
      fix: {
        summary:
          'Add exactly one implement(decl, …) for every query, mutation and endpoint, in the resolvers of app.ts',
        snippet: symbol ? `implement(${symbol}, (input, ctx) => …),` : null,
        patch: null,
      },
    })

  const parsedPublic = bindings.env.public?.(rawEnv)
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
  for (const impl of resolverSetOf(resolvers).list) {
    const { decl, run } = implementationOf(impl)
    const ref = bindings.refs.get(decl)
    if (!ref) {
      problem(
        '',
        null,
        'Resolver implements a declaration that is not part of this project',
        'Only registered queries, mutations and endpoints can be implemented.',
      )
      continue
    }
    if (runsOf(ref) !== 'server') {
      problem(
        pointerOf(ir, ref),
        ref.split('.')[0]!,
        `${ref} is implemented in the server resolvers, but runs: '${runsOf(ref)}'`,
        "Effects that are not runs: 'server' are implemented in the feature's fetch.ts (ADR 0049).",
      )
      continue
    }
    if (runs.has(ref))
      problem(
        pointerOf(ir, ref),
        ref.split('.')[0]!,
        `${ref} is implemented twice`,
        'Each effect has exactly one implementation.',
      )
    runs.set(ref, run)
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
      })
    }
    for (const [symbol, q] of Object.entries(feature.queries))
      register('query', symbol, q.errors, q.tags, q.scope, q.freshness)
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
      register('mutation', symbol, m.errors, m.invalidates, 'user', { kind: 'request' }, [
        ...Object.keys((feature.schemas[m.input]?.properties as object | undefined) ?? {}),
      ])
  }
  if (problems.length) throw new DataRuntimeError(problems)

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
      const ttl = f.kind === 'static' ? (staticTtl ?? Number.POSITIVE_INFINITY) : f.seconds
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
      return { ok: true, value: out as Json }
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
