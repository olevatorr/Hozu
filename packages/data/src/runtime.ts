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
import { fail, failureOf, implementationOf, type ResolverSet, type Run, resolverSetOf } from './resolvers.ts'
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
  stale: boolean
  gen: number
  refreshing: boolean
}

export interface ErrorInfo {
  effect?: string
  path?: string
}

export type OnError = (error: unknown, info: ErrorInfo) => void

export interface DataRuntimeOptions {
  build: BuildResult
  resolvers: ResolverSet
  now?: () => number
  onError?: OnError
  env?: unknown
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
  endpoint(ref: string, input: Json, ctx: { request: unknown }): Promise<EndpointResult>
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
  | { ok: true; value: unknown; invalidated: string[] }
  | { ok: false; status: 400 | 404 | 500; message: string; fields: Record<string, string | null> | null }

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
  now = Date.now,
  onError = () => {},
  env: rawEnv = {},
}: DataRuntimeOptions): DataRuntime {
  const { ir, bindings } = build
  const parsedEnv = bindings.env.server?.(rawEnv)
  if (parsedEnv && !parsedEnv.ok)
    throw new Error(`Invalid server environment: ${parsedEnv.issues.join('; ')}`)
  const env = parsedEnv?.ok ? parsedEnv.value : {}
  const effects = new Map<string, Effect>()
  const problems: Diagnostic[] = []
  const problem = (pointer: string, feature: string | null, message: string, cause: string) =>
    problems.push({
      code: 'HZ021',
      severity: codes.HZ021.severity,
      message,
      location: { feature, pointer, source: resolveSource(build.sources, pointer) },
      cause,
      fix: {
        summary: 'Add exactly one implement(decl, …) for every query and mutation',
        snippet: null,
        patch: null,
      },
    })

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
    { run: Run; output: boolean; fields: string[]; tags: ((input: Json) => string)[] }
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
      const run = runs.get(ref)
      if (!run) {
        problem(
          join('', 'features', feature.id, kind === 'query' ? 'queries' : 'mutations', symbol),
          feature.id,
          `${ref} has no implementation`,
          'Every query and mutation needs a resolver.',
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
        )
      else
        endpoints.set(ref, {
          run,
          output: e.output !== null,
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

  const cache = new Map<string, Entry>()
  const tagIndex = new Map<string, Set<Entry>>()
  const stats: Stats = { entries: 0, fetches: 0, hits: 0, deduped: 0, invalidated: 0 }

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
    let entry = cache.get(key)
    if (!entry) {
      entry = { value: null, at: 0, stale: false, gen: 0, refreshing: false }
      cache.set(key, entry)
      stats.entries++
      for (const tag of effect.tags.map((t) => t(input))) {
        let set = tagIndex.get(tag)
        if (!set) {
          set = new Set()
          tagIndex.set(tag, set)
        }
        set.add(entry)
      }
    }
    return entry
  }

  function invalidate(tags: string[]): number {
    let count = 0
    for (const tag of new Set(tags))
      for (const entry of tagIndex.get(tag) ?? []) {
        entry.gen++
        if (!entry.stale) count++
        entry.stale = true
      }
    stats.invalidated += count
    return count
  }

  function scope(initial?: unknown, { preview = false }: { preview?: boolean } = {}): RequestData {
    let session: unknown = initial ?? null
    let checked = false
    let readSession = false
    let written: { value: unknown } | null = null
    const memo = new Map<string, Promise<Result>>()

    const sessionCtx = <T extends object>(ctx: T) =>
      Object.defineProperty(ctx as T & { session: unknown }, 'session', {
        enumerable: true,
        get: () => {
          readSession = true
          return session
        },
      })
    const setSession = (value: unknown) => {
      const issues = value === null ? null : check('#session', value)
      if (issues) throw new Error(`Invalid session: ${issues.join('; ')}`)
      session = value
      checked = true
      written = { value }
      memo.clear()
    }

    async function execute(
      effect: Effect,
      input: Json,
      files: Map<string, FileLike> = new Map(),
    ): Promise<Result> {
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
        preview,
        fail,
        file,
        setSession:
          effect.kind === 'mutation'
            ? setSession
            : () => {
                throw new Error('Only mutations can set the session')
              },
      }
      try {
        out = await effect.run(input, effect.scope === 'user' ? sessionCtx(ctx) : (ctx as never))
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

    async function refresh(effect: Effect, entry: Entry, input: Json): Promise<Result> {
      const gen = entry.gen
      const started = now()
      const result = await execute(effect, input)
      if (result.ok && entry.gen === gen) {
        entry.value = result
        entry.at = started
        entry.stale = false
      }
      return result
    }

    async function read(effect: Effect, key: string, input: Json): Promise<Result> {
      if (preview || !cached(effect)) return execute(effect, input)
      const entry = entryOf(effect, key, input)
      const f = effect.freshness as Exclude<Freshness, { kind: 'request' } | { kind: 'live' }>
      if (entry.value && !entry.stale) {
        const age = now() - entry.at
        if (f.kind === 'static' || age < f.seconds * 1000) {
          stats.hits++
          return entry.value
        }
        if (f.kind === 'swr') {
          stats.hits++
          if (!entry.refreshing) {
            entry.refreshing = true
            void refresh(effect, entry, input).finally(() => {
              entry.refreshing = false
            })
          }
          return entry.value
        }
      }
      return refresh(effect, entry, input)
    }

    const validSession = (): Result | null => {
      if (checked || session === null || session === undefined) return null
      const issues = check('#session', session)
      if (issues) return unexpected(`Invalid session: ${issues.join('; ')}`)
      checked = true
      return null
    }

    async function run(
      ref: string,
      raw: Json,
      files: Map<string, FileLike> = new Map(),
    ): Promise<Result | MutationResult> {
      const effect = effects.get(ref)
      if (!effect) return unexpected(`Unknown effect ${ref}`)
      if (effect.scope === 'user') {
        const bad = validSession()
        if (bad) return effect.kind === 'mutation' ? { ...bad, invalidated: [] } : bad
      }
      const parsed = parse(ref, raw)
      if (!parsed.ok)
        return effect.kind === 'mutation'
          ? { ...invalid(effect.fields, parsed.issues), invalidated: [] }
          : unexpected(`Invalid input for ${ref}: ${parsed.issues.join('; ')}`)
      const input = parsed.value
      const key = `${ref}${canonicalStringify(input)}`
      if (effect.kind === 'query') {
        const hit = memo.get(key)
        if (hit) {
          stats.deduped++
          return hit
        }
        const next = read(effect, key, input)
        memo.set(key, next)
        return next
      }
      const before = written
      const result = await execute(effect, input, files)
      memo.clear()
      const extra =
        written && written !== before ? { session: (written as { value: unknown }).value as Json } : {}
      if (!result.ok) return { ...result, invalidated: [], ...extra }
      const tags = [...new Set(effect.tags.map((t) => t(input)))]
      invalidate(tags)
      return { ...result, invalidated: tags, ...extra }
    }

    async function endpoint(
      ref: string,
      raw: Json,
      { request }: { request: unknown },
    ): Promise<EndpointResult> {
      const e = endpoints.get(ref)
      if (!e) return { ok: false, status: 404, message: `Unknown endpoint ${ref}`, fields: null }
      const parsed = parse(ref, raw)
      if (!parsed.ok) {
        const bad = invalid(e.fields, parsed.issues) as unknown as {
          data: { message: string; fields: Record<string, string | null> }
        }
        return { ok: false, status: 400, message: bad.data.message, fields: bad.data.fields }
      }
      const report = (error: unknown): EndpointResult => {
        onError(error, { effect: ref })
        return { ok: false, status: 500, message: 'Internal error', fields: null }
      }
      let out: unknown
      try {
        out = await e.run(
          parsed.value,
          sessionCtx({
            env,
            preview,
            fail,
            setSession,
            file: async () => null,
            request,
          }) as never,
        )
      } catch (error) {
        return report(error)
      }
      memo.clear()
      const done = (value: unknown, ok: boolean): EndpointResult => {
        const tags = ok ? [...new Set(e.tags.map((t) => t(parsed.value)))] : []
        invalidate(tags)
        return { ok: true, value, invalidated: tags }
      }
      if (!e.output)
        return isResponse(out)
          ? done(out, (out as { status: number }).status < 400)
          : report(new Error(`${ref} must return a Response`))
      const wrong = check(`${ref}#output`, out)
      return wrong ? report(new Error(`Invalid output from ${ref}: ${wrong.join('; ')}`)) : done(out, true)
    }

    return {
      get session() {
        return session
      },
      get readSession() {
        return readSession
      },
      get written() {
        return written
      },
      run,
      endpoint,
    }
  }

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
    stats: () => ({ ...stats }),
  }
}

function pointerOf(ir: BuildResult['ir'], ref: string): string {
  const [feature, symbol] = ref.split('.') as [string, string]
  const registry = ir.features[feature]?.queries[symbol] ? 'queries' : 'mutations'
  return join('', 'features', feature, registry, symbol)
}
