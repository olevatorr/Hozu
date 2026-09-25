import type { MutationDef, QueryDef } from '../builders/effects.ts'
import type { EventDef } from '../builders/event.ts'
import type { FeatureConfig } from '../builders/feature.ts'
import type { FnDef } from '../builders/fn.ts'
import { type TagDef, tagUseOf } from '../builders/tag.ts'
import type { ExportsIR, FeatureIR, Freshness, QueryIR, TagExprIR } from '../ir/types.ts'
import { type Decl, defOf } from '../model/decl.ts'
import { RecorderError, refProxy } from '../model/expr.ts'
import type { Schema } from '../schema/standard.ts'
import { buildContract } from './contract.ts'
import { buildMachine } from './machine.ts'
import { type At, at, FeatureScope, type ProjectScope } from './scope.ts'
import { buildView } from './view.ts'

const exportKeys = ['events', 'queries', 'mutations', 'tags', 'fns', 'views'] as const

const mapRecord = <T, U>(record: Record<string, T>, fn: (key: string, value: T) => U): Record<string, U> =>
  Object.fromEntries(Object.entries(record ?? {}).map(([k, v]) => [k, fn(k, v)]))

function freshness(scope: FeatureScope, f: QueryDef['freshness'], p: At): Freshness {
  if (f === 'static' || f === 'live') return { kind: f }
  if (typeof f === 'object' && f && 'revalidate' in f && f.revalidate > 0)
    return { kind: 'revalidate', seconds: f.revalidate }
  if (typeof f === 'object' && f && 'swr' in f && f.swr > 0) return { kind: 'swr', seconds: f.swr }
  scope.report(
    'TN014',
    p,
    `Invalid freshness ${JSON.stringify(f)}`,
    "Use 'static', 'live', { revalidate: seconds } or { swr: seconds }.",
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

function errors(scope: FeatureScope, record: Record<string, Schema>, p: At): Record<string, string> {
  return mapRecord(record, (name, schema) => {
    if (name === 'Unexpected')
      scope.report(
        'TN014',
        at(p, name),
        '"Unexpected" is a reserved error name',
        'The framework always adds Unexpected ({ message }).',
      )
    return scope.schema(schema, at(p, name))
  })
}

function bindEffect(
  scope: FeatureScope,
  ref: string,
  d: { input: Schema; output: Schema; errors: Record<string, Schema> },
) {
  scope.bind(`${ref}#input`, d.input)
  scope.bind(`${ref}#output`, d.output)
  for (const [name, schema] of Object.entries(d.errors ?? {})) scope.bind(`${ref}#error:${name}`, schema)
}

export function buildFeature(project: ProjectScope, id: string, config: FeatureConfig): FeatureIR {
  const scope = new FeatureScope(project, id)
  if (typeof config.intent?.summary !== 'string' || !config.intent.summary.trim())
    scope.report(
      'TN014',
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
          'TN007',
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
            'TN006',
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

  const machine = buildMachine(scope, config.machine)
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
          'TN014',
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
        errors: errors(scope, d.errors, at(p, 'errors')),
        invalidates: tagExprs(scope, d.invalidates, at(p, 'invalidates')),
      }
    }),
    fns: mapRecord(config.fns, (sym, f) => {
      const d = defOf<FnDef>(f)
      project.bindings.fns[`${id}.${sym}`] = d.impl
      return {
        input: scope.schema(d.input, scope.at('fns', sym, 'input')),
        output: scope.schema(d.output, scope.at('fns', sym, 'output')),
        sourceHash: scope.fingerprint(String(d.impl)),
      }
    }),
    machine,
    views: mapRecord(config.views, (sym, v) => buildView(scope, sym, v)),
    contracts: mapRecord(config.contracts, (sym, c) => buildContract(scope, sym, c)),
  }
  return ir
}
