type J = any

/** One entry per mapping: which 0.7 → 0.8 difference it allows, and the rewrite (or version bump) behind it. */
export const MAPPINGS = {
  irVersion: 'irVersion 1 → 2 (the upgrade)',
  exportsEndpoints: 'exports.endpoints: [] (the upgrade)',
  endpointMode: "endpoint mode: 'json' for a schema output, 'response' for output: 'response' (the upgrade)",
  headFailed: 'head.redirects → head.failed { error: { redirect } } (rewrite head)',
  headFailed404: 'head.failed { error: { status: 404 } } for an unmapped error (rewrite head)',
  freshness: "user-scoped static / revalidate / swr → 'request' (rewrite freshness)",
  linkFolding: 'ui.link search fields null or equal to the route default fold away (rewrite link)',
  incPlus: 'inc → set %plus: ctx.x += v ≡ ctx.x = ctx.x + v (record-time normalisation, op → TS)',
  truthyCall: '%truthy(fnCall) → fnCall (record-time normalisation)',
  andOr: 'nested and / or flatten (record-time normalisation)',
  condGuard: 'a guard-position %cond → and / or / not (record-time normalisation)',
  formRef: "a string form attribute and its form's id → { formRef } (rewrite form)",
} as const
export type Mapping = keyof typeof MAPPINGS
export type Counts = Partial<Record<Mapping, number>>

const isObject = (v: unknown): v is Record<string, J> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

function defaultsOf(search: J): Record<string, J> {
  const out: Record<string, J> = {}
  for (const [k, v] of Object.entries(isObject(search?.properties) ? search.properties : {}))
    if (isObject(v) && 'default' in v) out[k] = v.default
  return out
}

const foldable = (v: J, fallback: J) =>
  v === null || (v !== undefined && typeof v !== 'object' && v === fallback)

function foldSearch(search: J, defaults: Record<string, J>): J {
  if (isObject(search) && 'literal' in search) {
    const l = search.literal
    if (!isObject(l)) return search
    const kept = Object.entries(l).filter(([k, v]) => !foldable(v, defaults[k]))
    return kept.length ? { literal: Object.fromEntries(kept) } : { literal: null }
  }
  if (isObject(search) && isObject(search.object)) {
    const kept = Object.entries(search.object).filter(
      ([k, v]) => !(isObject(v) && 'literal' in v && foldable(v.literal, defaults[k])),
    )
    return kept.length ? { object: Object.fromEntries(kept) } : { literal: null }
  }
  return search
}

/** A value used as a guard, as the 0.8 recorder's `test` lowers it. */
function asGuard(v: J): J {
  if (isObject(v) && isObject(v.test) && Object.keys(v).length === 1) return v.test
  if (isObject(v) && typeof v.fn === 'string' && 'arg' in v) return { op: 'fn', fn: v.fn, arg: v.arg }
  return { op: 'fn', fn: '%truthy', arg: { object: { v } } }
}

let counts: Counts = {}
const count = (m: Mapping, n = 1) => {
  if (n > 0) counts[m] = (counts[m] ?? 0) + n
}

const both = (x: J, y: J, op: 'and' | 'or') => ({
  op,
  args: [x, y].flatMap((g) => (g.op === op ? g.args : [g])),
})

/** The 0.8 `condGuard` over IR: a guard-position `%cond` → and / or / not. */
function condGuard(arg: J): J | null {
  const o = isObject(arg?.object) ? arg.object : null
  if (!o || !('c' in o) || !('a' in o) || !('b' in o)) return null
  const test = guard(asGuard(o.c))
  const not = { op: 'not', arg: test }
  const lit = (v: J, b: boolean) => isObject(v) && 'literal' in v && v.literal === b
  const tested = test.op === 'fn' && test.fn === '%truthy' ? test.arg?.object?.v : undefined
  const same = (x: J) => equal(x, o.c) || (tested !== undefined && equal(x, tested))
  const g = (v: J) => guard(asGuard(v))
  if (lit(o.a, true) && lit(o.b, false)) return test
  if (lit(o.a, false) && lit(o.b, true)) return not
  if (same(o.b) || lit(o.b, false)) return both(test, g(o.a), 'and')
  if (same(o.a) || lit(o.a, true)) return both(test, g(o.b), 'or')
  if (lit(o.a, false)) return both(not, g(o.b), 'and')
  if (lit(o.b, true)) return both(not, g(o.a), 'or')
  return both(both(test, g(o.a), 'and'), both(not, g(o.b), 'and'), 'or')
}

function guard(g: J): J {
  if (!isObject(g)) return g
  if (g.op === 'and' || g.op === 'or') {
    const args = (g.args as J[]).map(guard)
    count('andOr', args.filter((a) => a.op === g.op).length)
    return { ...g, args: args.flatMap((a) => (a.op === g.op ? a.args : [a])) }
  }
  if (g.op === 'not') return { ...g, arg: guard(g.arg) }
  const cond = (arg: J) => {
    const out = condGuard(arg)
    if (out) count('condGuard')
    return out ?? g
  }
  if (g.op === 'fn' && g.fn === '%cond') return cond(g.arg)
  if (g.op === 'fn' && g.fn === '%truthy') {
    const v = g.arg?.object?.v
    if (isObject(v) && typeof v.fn === 'string' && 'arg' in v && Object.keys(v).length === 2) {
      if (v.fn === '%cond') return cond(v.arg)
      count('truthyCall')
      return { op: 'fn', fn: v.fn, arg: v.arg }
    }
  }
  return g
}

const GUARD_KEYS = new Set(['guard', 'test'])
const isGuard = (v: J) =>
  isObject(v) &&
  typeof v.op === 'string' &&
  ['and', 'or', 'not', 'fn', 'eq', 'neq', 'lt', 'lte', 'gt', 'gte'].includes(v.op)

function walk(v: J, visit: (v: J, key: string | null) => J, key: string | null = null): J {
  const next = visit(v, key)
  if (Array.isArray(next)) return next.map((x) => walk(x, visit, key))
  if (isObject(next)) {
    const out: Record<string, J> = {}
    for (const [k, x] of Object.entries(next)) out[k] = walk(x, visit, k)
    return out
  }
  return next
}

function forms(feature: J) {
  const owners = new Map<string, J[]>()
  const used = new Set<string>()
  const scan = (v: J, inEach: boolean) => {
    if (Array.isArray(v)) return v.forEach((x) => scan(x, inEach))
    if (!isObject(v)) return
    if (v.kind === 'el' && typeof v.attrs?.id?.literal === 'string' && v.tag === 'form')
      owners.set(v.attrs.id.literal, [...(owners.get(v.attrs.id.literal) ?? []), { node: v, inEach }])
    if (v.kind === 'el' && typeof v.attrs?.form?.literal === 'string') used.add(v.attrs.form.literal)
    for (const [k, x] of Object.entries(v)) scan(x, inEach || (v.kind === 'each' && k === 'item'))
  }
  scan(feature.views, false)
  const ids = new Map<string, string>()
  for (const [value, list] of owners)
    if (used.has(value) && list.length === 1 && !list[0].inEach) ids.set(value, list[0].node.id)
  if (!ids.size) return
  count('formRef', ids.size)
  const rewrite = (v: J) => {
    if (Array.isArray(v)) return v.forEach(rewrite)
    if (!isObject(v)) return
    if (v.kind === 'el') {
      const id = v.tag === 'form' ? ids.get(v.attrs?.id?.literal) : undefined
      if (id && id === v.id) {
        v.attrs.id = { formRef: id }
        v.ref = { formRef: id }
      }
      const to = ids.get(v.attrs?.form?.literal)
      if (to) v.attrs.form = { formRef: to }
    }
    for (const x of Object.values(v)) rewrite(x)
  }
  rewrite(feature.views)
}

/**
 * The 0.7 IR in 0.8 terms (ADR 0043 Migration): what `hozu migrate 0.8` must produce for an unchanged app.
 * Every mapping here is one rewrite's allowed difference; anything else is a behaviour change.
 */
export function normalize07(input: J, into?: Counts): J {
  counts = into ?? {}
  const ir = clone(input)
  count('irVersion', ir.irVersion === 2 ? 0 : 1)
  ir.irVersion = 2
  const routes: Record<string, J> = ir.routes ?? {}
  for (const f of Object.values(ir.features ?? {}) as J[]) {
    count('exportsEndpoints', f.exports?.endpoints ? 0 : 1)
    f.exports = { ...f.exports, endpoints: f.exports?.endpoints ?? [] }
    for (const e of Object.values(f.endpoints ?? {}) as J[])
      if (!e.mode) {
        e.mode = e.output === null ? 'response' : 'json'
        count('endpointMode')
      }
    for (const q of Object.values(f.queries ?? {}) as J[])
      if (q.scope === 'user' && ['static', 'revalidate', 'swr'].includes(q.freshness?.kind)) {
        q.freshness = { kind: 'request' }
        count('freshness')
      }
    forms(f)
  }
  for (const page of Object.values(ir.pages ?? {}) as J[]) {
    const head = page.head
    if (!head || !('redirects' in head) || 'failed' in head) continue
    const failed: Record<string, J> = {}
    for (const [k, v] of Object.entries(head.redirects ?? {})) {
      failed[k] = { redirect: v }
      count('headFailed')
    }
    const ref = typeof head.query?.ref === 'string' ? (head.query.ref as string).split('.') : null
    const errors = ref ? Object.keys(ir.features?.[ref[0]!]?.queries?.[ref[1]!]?.errors ?? {}) : []
    for (const e of errors)
      if (!(e in failed)) {
        failed[e] = { status: 404 }
        count('headFailed404')
      }
    delete head.redirects
    head.failed = failed
  }
  return walk(ir, (v, key) => {
    if (!isObject(v)) return v
    if (typeof v.link === 'string' && 'search' in v && routes[v.link]) {
      const search = foldSearch(v.search, defaultsOf(routes[v.link].search))
      count('linkFolding', equal(search, v.search) ? 0 : 1)
      return { ...v, search }
    }
    if (v.op === 'inc' && Array.isArray(v.path) && 'value' in v) {
      count('incPlus')
      return {
        op: 'set',
        path: v.path,
        value: { fn: '%plus', arg: { object: { a: { ref: 'context', path: v.path }, b: v.value } } },
      }
    }
    if (key !== null && GUARD_KEYS.has(key) && isGuard(v)) return guard(v)
    return v
  })
}

/** The 0.8 IR in 0.9 terms (ADR 0045 L); phase 1 adds only the version and the empty component maps. */
export function normalize08(input: J): J {
  const ir = clone(input)
  ir.irVersion = 3
  ir.kits ??= {}
  for (const f of Object.values(ir.features ?? {}) as J[]) f.components ??= {}
  return ir
}

/** JSON pointers where two IRs differ, capped per call. */
export function differences(a: J, b: J, limit = 50, path = '', out: string[] = []): string[] {
  if (out.length >= limit || equal(a, b)) return out
  if (!isObject(a) || !isObject(b)) {
    if (Array.isArray(a) && Array.isArray(b) && a.length === b.length)
      for (let i = 0; i < a.length; i++) differences(a[i], b[i], limit, `${path}/${i}`, out)
    else out.push(path || '/')
    return out
  }
  for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort())
    differences(a[k], b[k], limit, `${path}/${k.replaceAll('~', '~0').replaceAll('/', '~1')}`, out)
  return out
}
