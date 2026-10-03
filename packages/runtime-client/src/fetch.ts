import type { Json, ValueExpr } from '@hozu/core/ir'
import type { PagePayload } from './hydrate.ts'
import type { Result, Store } from './mount.ts'

const FETCH_FAIL = Symbol.for('hozu.fetchFail')

type S = Record<string, any>

/**
 * Checks a value against the subset of JSON Schema the IR emits, and returns it with undeclared object keys
 * removed (as a schema parse strips them on the server).
 */
export function checked(
  schema: S,
  value: unknown,
  root: S = schema,
  at = '',
): { issues: string[]; value: unknown } {
  const issues: string[] = []
  const where = at || '(root)'
  let s = schema
  if (typeof s.$ref === 'string')
    s =
      s.$ref
        .split('/')
        .slice(1)
        .reduce((o: S, k: string) => o?.[k], root) ?? {}
  const alternatives = s.anyOf ?? s.oneOf
  if (Array.isArray(alternatives)) {
    for (const alt of alternatives) {
      const r = checked(alt, value, root, at)
      if (!r.issues.length) return r
    }
    return { issues: [`${where}: matches none of the allowed shapes`], value }
  }
  if ('const' in s && value !== s.const) issues.push(`${where}: expected ${JSON.stringify(s.const)}`)
  if (Array.isArray(s.enum) && !s.enum.includes(value))
    issues.push(`${where}: expected one of ${s.enum.join(', ')}`)
  const types: string[] = s.type === undefined ? [] : Array.isArray(s.type) ? s.type : [s.type]
  const is = (t: string) =>
    t === 'null'
      ? value === null
      : t === 'array'
        ? Array.isArray(value)
        : t === 'integer'
          ? Number.isInteger(value)
          : t === 'object'
            ? typeof value === 'object' && value !== null && !Array.isArray(value)
            : typeof value === t
  if (types.length && !types.some(is)) return { issues: [`${where}: expected ${types.join(' or ')}`], value }
  if (typeof value === 'string') {
    if (s.minLength !== undefined && value.length < s.minLength) issues.push(`${where}: too short`)
    if (s.maxLength !== undefined && value.length > s.maxLength) issues.push(`${where}: too long`)
    if (s.pattern && !new RegExp(s.pattern).test(value)) issues.push(`${where}: does not match ${s.pattern}`)
  }
  if (typeof value === 'number') {
    if (s.minimum !== undefined && value < s.minimum) issues.push(`${where}: below ${s.minimum}`)
    if (s.maximum !== undefined && value > s.maximum) issues.push(`${where}: above ${s.maximum}`)
  }
  if (Array.isArray(value)) {
    if (!s.items) return { issues, value }
    const out = value.map((x, i) => {
      const r = checked(s.items, x, root, `${at}${at ? '.' : ''}${i}`)
      issues.push(...r.issues)
      return r.value
    })
    return { issues, value: out }
  }
  if (typeof value === 'object' && value !== null && s.properties) {
    const v = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const key of s.required ?? []) if (!(key in v)) issues.push(`${at}${at ? '.' : ''}${key}: required`)
    for (const [key, sub] of Object.entries(s.properties as Record<string, S>))
      if (key in v) {
        const r = checked(sub, v[key], root, `${at}${at ? '.' : ''}${key}`)
        issues.push(...r.issues)
        out[key] = r.value
      }
    if (s.additionalProperties && typeof s.additionalProperties === 'object')
      for (const key of Object.keys(v)) if (!(key in out)) out[key] = v[key]
    return { issues, value: out }
  }
  return { issues, value }
}

const unexpected = (message: string): Result => ({ ok: false, error: 'Unexpected', data: { message } })

/** Runs a page's browser-run effects (ADR 0049): loads each feature's fetch bundle once, checks every boundary. */
export function createRunner(
  payload: PagePayload,
  fns: Record<string, never>,
  shared: Store,
  /** From the initial bundle, so this chunk shares no module with it (budget P7). */
  tools: {
    stringify: (value: unknown) => string
    compile: (v: ValueExpr, fns: Record<string, never>) => (scope: never) => Json
  },
  load: (url: string) => Promise<Record<string, unknown>> = (url) => import(/* @vite-ignore */ url),
) {
  const effects = payload.effects ?? {}
  const modules = new Map<string, Promise<Record<string, unknown>>>()
  const controllers = new Set<AbortController>()
  globalThis.addEventListener?.('pagehide', () => {
    for (const c of controllers) c.abort()
  })
  const moduleOf = (feature: string) => {
    let m = modules.get(feature)
    if (!m) {
      const url = payload.fetches?.[feature]
      m = url ? load(url) : Promise.reject(new Error(`No fetch bundle for ${feature}`))
      modules.set(feature, m)
    }
    return m
  }
  const tagsOf = (ref: string, input: Json): string[] =>
    (effects[ref]?.tags ?? []).map((t) =>
      t.param ? `${t.tag}(${tools.stringify(tools.compile(t.param, fns)({ input } as never))})` : t.tag,
    )
  async function run(ref: string, input: Json): Promise<Result> {
    const e = effects[ref]
    if (!e) return unexpected(`${ref} does not run in the browser`)
    const given = checked(e.input as S, input)
    if (given.issues.length)
      return e.kind === 'mutation'
        ? { ok: false, error: 'Invalid', data: { message: given.issues.join('; '), fields: {} } }
        : unexpected(`Invalid input: ${given.issues.join('; ')}`)
    const dot = ref.indexOf('.')
    const controller = new AbortController()
    controllers.add(controller)
    try {
      const impl = (await moduleOf(ref.slice(0, dot)))[ref.slice(dot + 1)]
      if (typeof impl !== 'function') return unexpected(`fetch.ts exports no ${ref.slice(dot + 1)}`)
      const value = await (impl as (i: unknown, c: unknown) => unknown)(given.value, {
        fail: (error: string, data: unknown) => {
          throw { [FETCH_FAIL]: { error, data } }
        },
        signal: controller.signal,
        env: payload.env ?? {},
      })
      const out = checked(e.output as S, value)
      return out.issues.length
        ? unexpected(`${ref} returned a value that does not match its output: ${out.issues.join('; ')}`)
        : { ok: true, value: out.value as Json }
    } catch (error) {
      const marked = (error as Record<symbol, { error: string; data: unknown }> | null)?.[FETCH_FAIL]
      if (marked) return { ok: false, error: marked.error, data: (marked.data ?? null) as Json }
      return unexpected(error instanceof Error ? error.message : String(error))
    } finally {
      controllers.delete(controller)
    }
  }
  const isQuery = (ref: string) => effects[ref]?.kind === 'query'
  /** Re-reads the browser-run queries in the page store that carry one of these tags. */
  async function reread(tags: string[]): Promise<boolean> {
    let changed = false
    for (const key of [...shared.data.keys()]) {
      const ref = Object.keys(effects).find(
        (r) => isQuery(r) && key.startsWith(r) && '{["tfn0123456789-'.includes(key[r.length] ?? ''),
      )
      if (!ref) continue
      const input = JSON.parse(key.slice(ref.length)) as Json
      if (!tagsOf(ref, input).some((t) => tags.includes(t))) continue
      shared.data.set(key, await run(ref, input))
      shared.versions.set(key, (shared.versions.get(key) ?? 0) + 1)
      changed = true
    }
    return changed
  }
  /** Runs a browser-run mutation, then re-reads what its tags name. */
  async function mutate(
    ref: string,
    input: Json,
  ): Promise<{ result: Result; changed: boolean; tags: string[] }> {
    const result = await run(ref, input)
    const tags = result.ok ? tagsOf(ref, input) : []
    return { result, changed: tags.length ? await reread(tags) : false, tags }
  }
  return { run, mutate, reread, runs: (ref: string) => ref in effects }
}

export type Runner = ReturnType<typeof createRunner>
