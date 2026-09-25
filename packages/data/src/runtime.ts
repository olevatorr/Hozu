import type { MutationDecl, QueryDecl } from '@tenon/core'
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
} from '@tenon/core/ir'
import { compileValue, type Getter } from '@tenon/machine'
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
  run: Run
}

interface Entry {
  value: Result | null
  at: number
  stale: boolean
  tags: string[]
  inflight: Promise<Result> | null
}

export interface DataRuntimeOptions {
  build: BuildResult
  resolvers: ResolverSet
  now?: () => number
}

export interface FileLike {
  name: string
  type: string
  size: number
  arrayBuffer(): Promise<ArrayBuffer>
}

export interface DataRuntime {
  query<I, O, E>(decl: QueryDecl<I, O, E, any>, input: I, session?: unknown): Promise<Result<O, E>>
  mutate<I, O, E>(decl: MutationDecl<I, O, E>, input: I, session?: unknown): Promise<MutationResult<O, E>>
  run(
    ref: string,
    input: Json,
    session?: unknown,
    files?: Map<string, FileLike>,
  ): Promise<Result | MutationResult>
  invalidate(tags: string[], session?: unknown): number
  stats(): Stats
}

const unexpected = (message: string): Result => ({ ok: false, error: 'Unexpected', data: { message } })

const tagKey = (tag: TagExprIR, get: Getter | null) => (input: Json) =>
  get ? `${tag.tag}(${canonicalStringify(get({ input }))})` : tag.tag

export function createDataRuntime({ build, resolvers, now = Date.now }: DataRuntimeOptions): DataRuntime {
  const { ir, bindings } = build
  const effects = new Map<string, Effect>()
  const problems: Diagnostic[] = []
  const problem = (pointer: string, feature: string | null, message: string, cause: string) =>
    problems.push({
      code: 'TN021',
      severity: codes.TN021.severity,
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
        'Only registered queries and mutations can be implemented.',
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

  for (const feature of Object.values(ir.features)) {
    const register = (
      kind: 'query' | 'mutation',
      symbol: string,
      errors: Record<string, string>,
      tags: TagExprIR[],
      scope: 'public' | 'user',
      freshness: Freshness,
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
        tags: tags.map((t) => tagKey(t, t.param ? compileValue(t.param, bindings.fns) : null)),
        run,
      })
    }
    for (const [symbol, q] of Object.entries(feature.queries))
      register('query', symbol, q.errors, q.tags, q.scope, q.freshness)
    for (const [symbol, m] of Object.entries(feature.mutations))
      register('mutation', symbol, m.errors, m.invalidates, 'user', { kind: 'live' })
  }
  if (problems.length) throw new DataRuntimeError(problems)

  const partitions = new Map<string, Map<string, Entry>>()
  const tagIndex = new Map<string, Map<string, Set<Entry>>>()
  const stats: Stats = { entries: 0, fetches: 0, hits: 0, deduped: 0, invalidated: 0 }
  const live = new Map<string, Promise<Result>>()

  const check = (key: string, value: unknown): string[] | null => bindings.checks[key]?.(value) ?? null

  async function execute(
    effect: Effect,
    input: Json,
    session: unknown,
    setSession: (value: unknown) => void = () => {
      throw new Error('Only mutations can set the session')
    },
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
    try {
      out = await effect.run(input, { session, fail, setSession, file })
    } catch (error) {
      return unexpected(error instanceof Error ? error.message : String(error))
    }
    const failure = failureOf(out)
    if (failure) {
      if (!effect.errors.has(failure.error))
        return unexpected(`Undeclared error "${failure.error}" from ${effect.ref}`)
      const issues = check(`${effect.ref}#error:${failure.error}`, failure.data)
      if (issues) return unexpected(`Invalid ${failure.error} data from ${effect.ref}: ${issues.join('; ')}`)
      return { ok: false, error: failure.error, data: failure.data as Json }
    }
    const issues = check(`${effect.ref}#output`, out)
    if (issues) return unexpected(`Invalid output from ${effect.ref}: ${issues.join('; ')}`)
    return { ok: true, value: out as Json }
  }

  const sessions = new Set<string>()

  function prepare(
    ref: string,
    input: Json,
    session: unknown,
  ): { effect: Effect; partition: string; key: string } | Result {
    const effect = effects.get(ref)
    if (!effect) return unexpected(`Unknown effect ${ref}`)
    let partition = 'public'
    if (effect.scope === 'user') {
      if (session === undefined || session === null) partition = 'user:null'
      else {
        partition = `user:${canonicalStringify(session)}`
        if (!sessions.has(partition)) {
          const issues = check('#session', session)
          if (issues) return unexpected(`Invalid session: ${issues.join('; ')}`)
          sessions.add(partition)
        }
      }
    }
    const key = `${ref}${canonicalStringify(input)}`
    if (!partitions.get(partition)?.has(key)) {
      const issues = check(`${ref}#input`, input)
      if (issues) return unexpected(`Invalid input for ${ref}: ${issues.join('; ')}`)
    }
    return { effect, partition, key }
  }

  function index(partition: string, entry: Entry, tags: string[]) {
    let byTag = tagIndex.get(partition)
    if (!byTag) {
      byTag = new Map()
      tagIndex.set(partition, byTag)
    }
    for (const tag of entry.tags) byTag.get(tag)?.delete(entry)
    for (const tag of tags) {
      let set = byTag.get(tag)
      if (!set) {
        set = new Set()
        byTag.set(tag, set)
      }
      set.add(entry)
    }
    entry.tags = tags
  }

  function refresh(
    effect: Effect,
    partition: string,
    entry: Entry,
    input: Json,
    session: unknown,
  ): Promise<Result> {
    if (entry.inflight) {
      stats.deduped++
      return entry.inflight
    }
    const started = now()
    entry.inflight = execute(effect, input, effect.scope === 'user' ? (session ?? null) : undefined).then(
      (result) => {
        entry.inflight = null
        if (result.ok) {
          entry.value = result
          entry.at = started
          entry.stale = false
          index(
            partition,
            entry,
            effect.tags.map((t) => t(input)),
          )
        }
        return result
      },
    )
    return entry.inflight
  }

  async function read(
    effect: Effect,
    partition: string,
    key: string,
    input: Json,
    session: unknown,
  ): Promise<Result> {
    if (effect.freshness.kind === 'live') {
      const flight = live.get(`${partition}|${key}`)
      if (flight) {
        stats.deduped++
        return flight
      }
      const next = execute(effect, input, effect.scope === 'user' ? (session ?? null) : undefined).finally(
        () => live.delete(`${partition}|${key}`),
      )
      live.set(`${partition}|${key}`, next)
      return next
    }
    let entries = partitions.get(partition)
    if (!entries) {
      entries = new Map()
      partitions.set(partition, entries)
    }
    let entry = entries.get(key)
    if (!entry) {
      entry = { value: null, at: 0, stale: false, tags: [], inflight: null }
      entries.set(key, entry)
      stats.entries++
    }
    const f = effect.freshness
    if (entry.value && !entry.stale) {
      const age = now() - entry.at
      if (f.kind === 'static' || age < f.seconds * 1000) {
        stats.hits++
        return entry.value
      }
      if (f.kind === 'swr') {
        stats.hits++
        void refresh(effect, partition, entry, input, session)
        return entry.value
      }
    }
    return refresh(effect, partition, entry, input, session)
  }

  function invalidate(tags: string[], partitionsToCheck: string[]): number {
    let count = 0
    for (const partition of partitionsToCheck) {
      const byTag = tagIndex.get(partition)
      if (!byTag) continue
      for (const tag of tags)
        for (const entry of byTag.get(tag) ?? []) {
          if (!entry.stale) count++
          entry.stale = true
        }
    }
    stats.invalidated += count
    return count
  }

  async function run(
    ref: string,
    input: Json,
    session?: unknown,
    files: Map<string, FileLike> = new Map(),
  ): Promise<Result | MutationResult> {
    const prepared = prepare(ref, input, session)
    if ('ok' in prepared) return prepared
    const { effect, partition, key } = prepared
    if (effect.kind === 'query') return read(effect, partition, key, input, session)
    let next: { value: unknown } | null = null
    const result = await execute(
      effect,
      input,
      session ?? null,
      (value) => {
        const issues = value === null ? null : check('#session', value)
        if (issues) throw new Error(`Invalid session: ${issues.join('; ')}`)
        next = { value }
      },
      files,
    )
    const written = next as { value: unknown } | null
    const extra = written ? { session: written.value as Json } : {}
    if (!result.ok) return { ...result, invalidated: [], ...extra }
    const tags = [...new Set(effect.tags.map((t) => t(input)))]
    invalidate(tags, partition === 'public' ? ['public'] : ['public', partition])
    return { ...result, invalidated: tags, ...extra }
  }

  const refOf = (decl: object) => {
    const ref = bindings.refs.get(decl)
    if (!ref) throw new TypeError('This declaration is not part of the project the runtime was built from')
    return ref
  }

  return {
    query: (decl, input, session) => run(refOf(decl), input as Json, session) as never,
    mutate: (decl, input, session) => run(refOf(decl), input as Json, session) as never,
    run,
    invalidate: (tags, session) =>
      invalidate(
        tags,
        session === undefined || session === null
          ? ['public']
          : ['public', `user:${canonicalStringify(session)}`],
      ),
    stats: () => ({ ...stats }),
  }
}

function pointerOf(ir: BuildResult['ir'], ref: string): string {
  const [feature, symbol] = ref.split('.') as [string, string]
  const registry = ir.features[feature]?.queries[symbol] ? 'queries' : 'mutations'
  return join('', 'features', feature, registry, symbol)
}
