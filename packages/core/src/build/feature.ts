import type { MutationDef, QueryDef } from '../builders/effects.ts'
import type { EndpointDef } from '../builders/endpoint.ts'
import type { EventDef } from '../builders/event.ts'
import type { FeatureParts } from '../builders/feature.ts'
import type { FnDef } from '../builders/fn.ts'
import type { MessagesDef } from '../builders/i18n.ts'
import { type TagDef, tagUseOf } from '../builders/tag.ts'
import { hashJson, sha256 } from '../canonical/hash.ts'
import type {
  ConnectIR,
  EndpointIR,
  EndpointMode,
  EndpointStatus,
  ExportsIR,
  FeatureIR,
  Freshness,
  MessagesIR,
  QueryIR,
  Runs,
  TagExprIR,
} from '../ir/types.ts'
import { helpersOf } from '../lower.ts'
import { type Decl, defOf } from '../model/decl.ts'
import { RecorderError, refProxy } from '../model/expr.ts'
import { builtin } from '../platform.ts'
import { toParse } from '../schema/check.ts'
import type { Schema } from '../schema/standard.ts'
import { buildComponent } from './components.ts'
import { buildContract } from './contract.ts'
import { finishForms } from './forms.ts'
import { buildMachine } from './machine.ts'
import { type At, at, FeatureScope, filePath, type ProjectScope } from './scope.ts'
import { buildView } from './view.ts'

const exportKeys = ['events', 'queries', 'mutations', 'tags', 'fns', 'views', 'endpoints'] as const

const mapRecord = <T, U>(record: Record<string, T>, fn: (key: string, value: T) => U): Record<string, U> =>
  Object.fromEntries(Object.entries(record ?? {}).map(([k, v]) => [k, fn(k, v)]))

function freshness(scope: FeatureScope, f: QueryDef['freshness'], p: At): Freshness {
  if (f === 'static' || f === 'live' || f === 'request') return { kind: f }
  if (typeof f === 'object' && f && 'revalidate' in f && f.revalidate > 0)
    return { kind: 'revalidate', seconds: f.revalidate }
  if (typeof f === 'object' && f && 'swr' in f && f.swr > 0) return { kind: 'swr', seconds: f.swr }
  scope.report(
    'HZ014',
    p,
    `Invalid freshness ${JSON.stringify(f)}`,
    "Use 'static', 'request', 'live', { revalidate: seconds } or { swr: seconds }.",
  )
  return { kind: 'static' }
}

function tagExprs(scope: FeatureScope, record: (input: unknown) => unknown, p: At): TagExprIR[] {
  return scope.attempt(p, () => {
    const uses = record(refProxy('input', 0))
    if (!Array.isArray(uses)) throw new RecorderError('Tag lists must be arrays: [myTag()]')
    return uses.map((u, i) => {
      const use = tagUseOf(u)
      if (!use) throw new RecorderError('Tag lists may only contain tag uses: [myTag()]')
      return {
        tag: scope.ref(use.tag, ['tag'], at(p, i)),
        param: use.param === null ? null : scope.value(use.param, at(p, i)),
      }
    })
  }, [])
}

function errors(
  scope: FeatureScope,
  record: Record<string, Schema>,
  p: At,
  mutation = false,
): Record<string, string> {
  return mapRecord(record, (name, schema) => {
    if (name === 'Unexpected' || (mutation && name === 'Invalid'))
      scope.report(
        'HZ014',
        at(p, name),
        `"${name}" is a reserved error name`,
        name === 'Unexpected'
          ? 'The framework always adds Unexpected ({ message }).'
          : "The framework adds Invalid ({ message, fields }) to every mutation: it is returned when the input fails its schema, and resolvers return it with fail('Invalid', { message, fields }).",
      )
    return scope.schema(schema, at(p, name))
  })
}

function bindInput(scope: FeatureScope, ref: string, schema: Schema) {
  scope.bind(`${ref}#input`, schema)
  const parse = toParse(schema)
  if (!parse) return
  scope.project.bindings.parses ??= {}
  scope.project.bindings.parses[`${ref}#input`] = parse
}

function bindEffect(
  scope: FeatureScope,
  ref: string,
  d: { input: Schema; output: Schema; errors: Record<string, Schema> },
) {
  bindInput(scope, ref, d.input)
  scope.bind(`${ref}#output`, d.output)
  for (const [name, schema] of Object.entries(d.errors ?? {})) scope.bind(`${ref}#error:${name}`, schema)
}

const plainJson = (v: unknown): boolean =>
  v === null ||
  typeof v === 'string' ||
  typeof v === 'boolean' ||
  (typeof v === 'number' && Number.isFinite(v)) ||
  (Array.isArray(v) && v.every(plainJson)) ||
  (typeof v === 'object' &&
    Object.getPrototypeOf(v) === Object.prototype &&
    Object.values(v).every(plainJson))

const RUNS = new Set<unknown>(['server', 'browser', 'either'])

function runsOf(scope: FeatureScope, runs: unknown, effectScope: unknown, p: At): Runs {
  if (!RUNS.has(runs)) {
    scope.report('HZ014', p, `Invalid runs ${JSON.stringify(runs)}`, "Use 'server', 'browser' or 'either'.")
    return 'server'
  }
  if (runs === 'either' && effectScope === 'user')
    scope.report(
      'HZ081',
      p,
      "A query with scope: 'user' cannot run on either side",
      "'either' runs on the server and in any browser without credentials, so it is for public data. Per-visitor data needs the server session (runs: 'server') or the visitor's browser credentials (runs: 'browser').",
      {
        summary: "Use runs: 'server' (session) or runs: 'browser' (browser credentials)",
        snippet: "runs: 'server'",
        patch: null,
      },
    )
  return runs as Runs
}

/** The names a module exports (`export const x`, `export function x`, `export { a, b as c }`). */
export function exportNames(source: string): string[] {
  const out = new Set<string>()
  for (const m of source.matchAll(
    /export\s+(?:const|let|var|async\s+function|function)\s+([A-Za-z_$][\w$]*)/g,
  ))
    out.add(m[1]!)
  for (const m of source.matchAll(/export\s*\{([^}]*)\}/g))
    for (const part of m[1]!.split(',')) {
      const name = part
        .trim()
        .split(/\s+as\s+/)
        .pop()
        ?.trim()
      if (name) out.add(name)
    }
  return [...out]
}

/** The origins of the absolute URLs written in a fetch module. */
const withoutComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')

export const literalOrigins = (source: string): string[] => {
  const code = withoutComments(source)
  return [
    ...new Set([...code.matchAll(/\bhttps?:\/\/[A-Za-z0-9.-]+(?::\d+)?/g)].map((m) => new URL(m[0]).origin)),
  ].sort()
}

function connectOf(scope: FeatureScope, list: readonly unknown[]): ConnectIR[] {
  const out: ConnectIR[] = []
  list.forEach((entry, i) => {
    if (entry && typeof entry === 'object' && typeof (entry as { env?: unknown }).env === 'string') {
      out.push({ env: (entry as { env: string }).env })
      return
    }
    let url: URL | null = null
    try {
      url = typeof entry === 'string' ? new URL(entry) : null
    } catch {}
    if (
      url &&
      /^https?:$/.test(url.protocol) &&
      (url.pathname === '/' || url.pathname === '') &&
      !url.search
    ) {
      out.push({ origin: url.origin })
      return
    }
    scope.report(
      'HZ081',
      scope.at('connect', String(i)),
      `connect[${i}] of ${scope.id} is not an origin: ${JSON.stringify(entry)}`,
      "connect lists the origins fetch.ts calls from the browser, as 'https://host' (no path), or { env: 'NAME' } for a public env variable holding a URL.",
      { summary: 'Use the origin only', snippet: "connect: ['https://api.example.com']", patch: null },
    )
  })
  return out
}

function fetchOf(
  scope: FeatureScope,
  url: URL | null,
  found: { exports: string[] | null; origins: string[] },
): FeatureIR['fetch'] {
  if (!url) return null
  const listed = scope.project.manifest?.fetches?.[scope.id]
  if (listed) return { sourceHash: listed.hash }
  const fs = builtin('node:fs')
  const file = filePath(url)
  if (!file || !fs?.existsSync(file)) {
    scope.report(
      'HZ081',
      scope.at('fetch'),
      file ? `Fetch module ${file} does not exist` : 'fetch must be a file URL',
      "Declare it with new URL('./fetch.ts', import.meta.url); it exports one implement<typeof model.x>(…) per effect.",
      {
        summary: 'Create features/<name>/fetch.ts',
        snippet: "fetch: new URL('./fetch.ts', import.meta.url)",
        patch: null,
      },
    )
    return null
  }
  scope.project.bindings.fetches[scope.id] = file
  const text = fs.readFileSync(file, 'utf8')
  found.exports = exportNames(text)
  found.origins = literalOrigins(text)
  scope.project.fetchScans.set(scope.id, {
    origins: found.origins,
    env: [
      ...new Set([...withoutComments(text).matchAll(/\benv\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]!)),
    ].sort(),
  })
  return { sourceHash: sha256(text).slice(0, 16) }
}

export function buildFeature(project: ProjectScope, id: string, config: FeatureParts): FeatureIR {
  const fetched: { exports: string[] | null; origins: string[] } = { exports: null, origins: [] }
  const scope = new FeatureScope(project, id)
  if (typeof config.intent?.summary !== 'string' || !config.intent.summary.trim())
    scope.report(
      'HZ014',
      scope.at('intent', 'summary'),
      'intent.summary must be a non-empty string',
      'Intent is the context agents read first.',
    )
  const imports = [
    ...new Set(
      (config.imports ?? []).map((f, i) => {
        const fid = project.features.get(f)
        if (fid) return fid
        scope.report(
          'HZ007',
          scope.at('imports', i),
          'Imported feature is not part of the project',
          'List it in project({ features }).',
        )
        return '?'
      }),
    ),
  ].sort()
  const exports = Object.fromEntries(
    exportKeys.map((key) => [
      key,
      (config.exports?.[key] ?? [])
        .map((decl: Decl, i: number) => {
          const owner = project.owners.get(decl)
          if (owner?.feature === id) return owner.symbol
          scope.report(
            'HZ006',
            scope.at('exports', key, i),
            owner
              ? `Cannot export ${owner.feature}.${owner.symbol} from ${id}`
              : 'Exported value is not declared in this feature',
            'A feature exports only its own declarations.',
          )
          return null
        })
        .filter((s): s is string => s !== null)
        .sort(),
    ]),
  ) as unknown as ExportsIR

  for (const key of ['queries', 'mutations', 'endpoints', 'views', 'contracts', 'fns'] as const)
    for (const [sym, decl] of Object.entries(config[key] ?? {})) scope.escapes(decl, scope.at(key, sym))
  if (config.machine) scope.escapes(config.machine, scope.at('machine'))
  const machine = buildMachine(scope, config.machine)
  const own = Object.keys(config.events).map((sym) => `${id}.${sym}`)
  for (const state of Object.values(machine?.states ?? {}))
    if (state.invoke) state.ignore = own.filter((e) => !state.on[e]?.length).sort()
  const ir: FeatureIR = {
    id,
    intent: {
      summary: String(config.intent?.summary ?? ''),
      invariants: [...(config.intent?.invariants ?? [])].map(String),
    },
    imports,
    exports,
    schemas: scope.schemas,
    tags: mapRecord(config.tags, (sym, t) => {
      const param = defOf<TagDef>(t).param
      return { param: param === null ? null : scope.schema(param, scope.at('tags', sym, 'param')) }
    }),
    events: mapRecord(config.events, (sym, e) => {
      const payload = defOf<EventDef>(e).payload
      scope.bind(`${id}.${sym}#payload`, payload)
      return { payload: scope.schema(payload, scope.at('events', sym, 'payload')) }
    }),
    queries: mapRecord(config.queries, (sym, q): QueryIR => {
      const d = defOf<QueryDef>(q)
      const p = scope.at('queries', sym)
      bindEffect(scope, `${id}.${sym}`, d)
      if (d.scope !== 'public' && d.scope !== 'user')
        scope.report(
          'HZ014',
          at(p, 'scope'),
          `Invalid scope ${JSON.stringify(d.scope)}`,
          "Use 'public' or 'user'.",
        )
      return {
        input: scope.schema(d.input, at(p, 'input')),
        output: scope.schema(d.output, at(p, 'output')),
        errors: errors(scope, d.errors, at(p, 'errors')),
        scope: d.scope === 'public' ? 'public' : 'user',
        freshness: freshness(scope, d.freshness, at(p, 'freshness')),
        runs: runsOf(scope, d.runs, d.scope, at(p, 'runs')),
        tags: tagExprs(scope, d.tags, at(p, 'tags')),
      }
    }),
    mutations: mapRecord(config.mutations, (sym, m) => {
      const d = defOf<MutationDef>(m)
      const p = scope.at('mutations', sym)
      bindEffect(scope, `${id}.${sym}`, d)
      return {
        input: scope.schema(d.input, at(p, 'input')),
        output: scope.schema(d.output, at(p, 'output')),
        errors: errors(scope, d.errors, at(p, 'errors'), true),
        invalidates: tagExprs(scope, d.invalidates, at(p, 'invalidates')),
        runs: runsOf(scope, d.runs, null, at(p, 'runs')),
      }
    }),
    fns: mapRecord(config.fns, (sym, f) => {
      const d = defOf<FnDef>(f)
      project.bindings.fns[`${id}.${sym}`] = d.impl
      const helpers: Record<string, string> = {}
      for (const [name, get] of Object.entries(helpersOf().get(f) ?? {})) {
        const value = get()
        if (typeof value === 'function') helpers[name] = String(value)
        else if (plainJson(value)) helpers[name] = JSON.stringify(value)
        else
          scope.report(
            'HZ047',
            scope.at('fns', sym),
            `fn ${sym} uses \`${name}\`, whose value cannot be sent to the browser`,
            'A constant a fn body uses is copied into the browser as JSON: numbers, strings, booleans, null, arrays and plain objects.',
            { summary: `Make \`${name}\` a JSON value, or pass it as input`, snippet: null, patch: null },
          )
      }
      if (Object.keys(helpers).length) project.bindings.fnHelpers[`${id}.${sym}`] = helpers
      return {
        input: scope.schema(d.input, scope.at('fns', sym, 'input')),
        output: scope.schema(d.output, scope.at('fns', sym, 'output')),
        sourceHash: scope.fingerprint(
          Object.keys(helpers).length ? `${String(d.impl)}\n${JSON.stringify(helpers)}` : String(d.impl),
        ),
      }
    }),
    machine,
    components: mapRecord(config.components, (sym, c) =>
      buildComponent(scope, scope.at('components', sym), c),
    ),
    endpoints: mapRecord(config.endpoints, (sym, e) => buildEndpoint(scope, sym, defOf<EndpointDef>(e))),
    views: mapRecord(config.views, (sym, v) => buildView(scope, sym, v)),
    contracts: mapRecord(config.contracts, (sym, c) => buildContract(scope, sym, c)),
    messages: config.messages ? buildMessages(defOf<MessagesDef>(config.messages)) : null,
    fetch: fetchOf(scope, config.fetch, fetched),
    connect: connectOf(scope, config.connect),
  }
  const effects = [
    ...Object.entries(ir.queries).map(([sym, e]) => [sym, 'queries', e.runs] as const),
    ...Object.entries(ir.mutations).map(([sym, e]) => [sym, 'mutations', e.runs] as const),
  ]
  if (fetched.exports) {
    const exported = new Set(fetched.exports)
    for (const [sym, kind, runs] of effects)
      if (runs !== 'server' && !exported.has(sym))
        scope.report(
          'HZ081',
          scope.at(kind, sym, 'runs'),
          `${id}.${sym} runs ${runs === 'browser' ? 'in the browser' : 'on either side'} but fetch.ts exports no ${sym}`,
          "Effects that do not run only on the server are implemented in the feature's fetch.ts, one export per effect under its name (ADR 0049).",
          {
            summary: `export const ${sym} = implement<typeof model.${sym}>(…) in fetch.ts, or runs: 'server' with a resolver in app.ts`,
            snippet: `export const ${sym} = implement<typeof model.${sym}>(async (input, { fail, signal }) => { … })`,
            patch: null,
          },
        )
    const runsOfName = new Map(effects.map(([sym, , runs]) => [sym, runs]))
    for (const name of exported)
      if (runsOfName.get(name) !== 'browser' && runsOfName.get(name) !== 'either')
        scope.report(
          'HZ081',
          scope.at('fetch'),
          runsOfName.has(name)
            ? `fetch.ts implements ${id}.${name}, which has runs: 'server'`
            : `fetch.ts exports ${name}, which is not a query or mutation of ${id}`,
          'fetch.ts exports exactly the effects that run in the browser or on either side, under their names.',
          {
            summary: runsOfName.has(name)
              ? `Remove ${name} from fetch.ts (its resolver is in app.ts), or drop runs: 'server'`
              : `Rename or remove ${name}: each export must be named after an effect of ${id}`,
            snippet: null,
            patch: null,
          },
        )
  }
  const local = effects.some(([, , runs]) => runs !== 'server')
  if (local && !ir.fetch && !config.fetch)
    scope.report(
      'HZ081',
      scope.at('fetch'),
      `Feature ${id} has effects that run in the browser or either side, but no fetch module`,
      "An effect without runs: 'server' is implemented in the feature's fetch.ts (ADR 0049); the default is 'either'.",
      {
        summary:
          "Add fetch: new URL('./fetch.ts', import.meta.url) to feature({...}) and implement each effect there, or mark effects that need the server runs: 'server'",
        snippet: "fetch: new URL('./fetch.ts', import.meta.url)",
        patch: null,
      },
    )
  finishForms(scope)
  return ir
}

const modes: Record<string, EndpointMode> = { redirect: 'redirect', response: 'response' }
const statuses = new Set([400, 401, 403, 404, 409, 410, 422, 429])

function buildEndpoint(scope: FeatureScope, sym: string, d: EndpointDef): EndpointIR {
  const ref = `${scope.id}.${sym}`
  const p = scope.at('endpoints', sym)
  const raw = d.input === 'raw'
  if (!raw) bindInput(scope, ref, d.input as Schema)
  const mode = typeof d.output === 'string' ? (modes[d.output] ?? 'json') : 'json'
  if (typeof d.output === 'string' && !modes[d.output])
    scope.report(
      'HZ014',
      at(p, 'output'),
      `Invalid endpoint output ${JSON.stringify(d.output)}`,
      "Use a schema (JSON), 'redirect' or 'response'.",
    )
  if (mode === 'json' && typeof d.output !== 'string') scope.bind(`${ref}#output`, d.output)
  const errorRefs = errors(scope, d.errors ?? {}, at(p, 'errors'), true)
  for (const [name, schema] of Object.entries(d.errors ?? {})) scope.bind(`${ref}#error:${name}`, schema)
  const failed: Record<string, EndpointStatus> = {}
  for (const [name, status] of Object.entries(d.failed ?? {})) {
    if (statuses.has(status)) failed[name] = status
    else
      scope.report(
        'HZ014',
        at(p, 'failed', name),
        `Endpoint status ${JSON.stringify(status)} for ${name} is not allowed`,
        'A declared endpoint error answers 400, 401, 403, 404, 409, 410, 422 or 429.',
      )
  }
  const invalidates = d.invalidates ? tagExprs(scope, d.invalidates, at(p, 'invalidates')) : []
  const empty = `s_${hashJson({}).slice(0, 16)}`
  if (raw) scope.schemas[empty] = {}
  return {
    method: d.method,
    path: String(d.path),
    input: raw ? empty : scope.schema(d.input, at(p, 'input')),
    output: mode === 'json' ? scope.schema(d.output, at(p, 'output')) : null,
    mode,
    ...(raw ? { raw: true as const } : {}),
    ...(Object.keys(errorRefs).length ? { errors: errorRefs } : {}),
    ...(Object.keys(failed).length || d.failed ? { failed } : {}),
    ...(invalidates.length ? { invalidates } : {}),
  }
}

const buildMessages = (d: MessagesDef): MessagesIR => ({
  base: String(d.base),
  text: Object.fromEntries(
    Object.entries(d.text ?? {}).map(([locale, text]) => [
      locale,
      Object.fromEntries(Object.entries(text ?? {}).map(([k, v]) => [k, String(v)])),
    ]),
  ),
})
