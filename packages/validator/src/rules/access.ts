import {
  type AccessIR,
  type At,
  type FeatureIR,
  type JsonSchema,
  resolveAt,
  type ValueExpr,
} from '@hozu/core/ir'
import type { Ctx } from '../context.ts'
import { featurePointer } from '../walk.ts'

type Schema = JsonSchema & {
  properties?: Record<string, Schema>
  items?: Schema
  anyOf?: Schema[]
  oneOf?: Schema[]
  allOf?: Schema[]
  type?: string | string[]
}

const branches = (s: Schema): Schema[] => [s, ...(s.anyOf ?? []), ...(s.oneOf ?? []), ...(s.allOf ?? [])]

/** Whether `path` names a field of `schema` (through nullable unions); an untyped schema accepts any path. */
export function hasPath(schema: Schema | undefined, path: readonly string[]): boolean {
  if (!schema) return false
  if (path.length === 0) return true
  const [head, ...rest] = path
  const options = branches(schema)
  if (options.every((o) => !o.properties && !o.anyOf && !o.oneOf && !o.allOf && o.type === undefined))
    return true
  return options.some((o) => o.properties?.[head!] !== undefined && hasPath(o.properties[head!], rest))
}

const rowOf = (s: Schema | undefined): Schema | undefined => {
  if (!s) return undefined
  const array = branches(s).find((b) => b.items)
  return array?.items ?? s
}

const refPath = (v: ValueExpr, ref: 'result' | 'session'): readonly string[] | null =>
  'ref' in v && v.ref === ref ? v.path : null

/** ADR 0056 B: who may run each server-run effect is declared (HZ088), only where it is enforced (HZ089, HZ090). */
export function access(ctx: Ctx) {
  const { ir } = ctx
  for (const f of Object.values(ir.features)) {
    for (const [sym, q] of Object.entries(f.queries)) {
      const at = (...extra: string[]) => featurePointer(f.id, 'queries', sym, 'access', ...extra)
      const enforced = q.scope === 'user' && q.runs === 'server'
      if (enforced && !q.access) missing(ctx, f.id, at(), `${f.id}.${sym}`, 'query')
      if (q.access && !enforced)
        unenforced(
          ctx,
          f.id,
          at(),
          `${f.id}.${sym}`,
          q.scope === 'public' ? 'a public query' : `a runs: '${q.runs}' query`,
        )
      if (enforced && q.access?.kind === 'anyone')
        ctx.report(
          'HZ090',
          f.id,
          at(),
          `${f.id}.${sym} is user data that anyone may read`,
          "access: 'anyone' lets every visitor, signed in or not, run this scope: 'user' query.",
          {
            summary: 'Say who may read it',
            snippet: "access: 'signedIn',",
            patch: [{ op: 'replace', path: resolveAt(at()), value: { kind: 'signedIn' } }],
          },
        )
      if (enforced && q.access) fields(ctx, f, at, q.access, rowOf(f.schemas[q.output] as Schema))
    }
    for (const [sym, m] of Object.entries(f.mutations)) {
      const at = (...extra: string[]) => featurePointer(f.id, 'mutations', sym, 'access', ...extra)
      const enforced = m.runs === 'server'
      if (enforced && !m.access) missing(ctx, f.id, at(), `${f.id}.${sym}`, 'mutation')
      if (m.access && !enforced) unenforced(ctx, f.id, at(), `${f.id}.${sym}`, `a runs: '${m.runs}' mutation`)
      if (enforced && m.access) {
        const load = m.access.kind === 'owner' ? m.access.load : null
        const loaded = load ? queryOf(ctx, load.query) : null
        if (load && !loaded)
          ctx.report(
            'HZ088',
            f.id,
            at('load'),
            `${f.id}.${sym}: { owner: { load } } names ${load.query}, which is not a query`,
            'load is the query that reads the row the rule checks.',
          )
        const row = loaded
          ? rowOf(loaded.feature.schemas[loaded.query.output] as Schema)
          : (f.schemas[m.input] as Schema)
        fields(ctx, f, at, m.access, row)
      }
    }
  }
}

function queryOf(ctx: Ctx, ref: string) {
  const [fid, sym] = ref.split('.') as [string, string]
  const feature = ctx.ir.features[fid]
  const query = feature?.queries[sym]
  return feature && query ? { feature, query } : null
}

function missing(ctx: Ctx, feature: string, at: At, ref: string, kind: 'query' | 'mutation') {
  ctx.report(
    'HZ088',
    feature,
    at,
    `${ref} does not say who may ${kind === 'query' ? 'read' : 'run'} it`,
    kind === 'query'
      ? "Every server-run scope: 'user' query declares access, so reading another visitor's data cannot be written by accident."
      : 'Every server-run mutation declares access, so a change to another visitor’s data cannot be written by accident.',
    {
      summary: "Declare access ('signedIn' refuses by default; choose the rule that fits)",
      snippet:
        kind === 'query'
          ? "access: 'signedIn',"
          : "access: 'signedIn',   // or 'anyone', { owner: { … } }, { allow: (…) => … }",
      patch: [{ op: 'add', path: resolveAt(at), value: { kind: 'signedIn' } }],
    },
  )
}

function unenforced(ctx: Ctx, feature: string, at: At, ref: string, what: string) {
  ctx.report(
    'HZ089',
    feature,
    at,
    `${ref} is ${what}: its access is never checked`,
    'A public query never sees the session, and a browser-run effect never reaches the server’s session.',
    { summary: 'Remove access', snippet: null, patch: [{ op: 'remove', path: resolveAt(at) }] },
  )
}

function fields(
  ctx: Ctx,
  f: FeatureIR,
  at: (...extra: string[]) => At,
  rule: AccessIR,
  row: Schema | undefined,
) {
  if (rule.kind !== 'owner') return
  const rowPath = refPath(rule.row, 'result')
  const sessionPath = refPath(rule.session, 'session')
  if (!rowPath || !hasPath(row, rowPath))
    ctx.report(
      'HZ088',
      f.id,
      at('row'),
      `owner reads row.${rowPath?.join('.') ?? '?'}, which the row does not have`,
      'The framework checks each row it sees, so the row (the query output, or the row load reads) carries its owner.',
      {
        summary: "Add the owner field to the output, or use 'signedIn' and scope the resolver",
        snippet: null,
        patch: null,
      },
    )
  if (!sessionPath || !hasPath((ctx.ir.session ?? undefined) as Schema | undefined, sessionPath))
    ctx.report(
      'HZ088',
      f.id,
      at('session'),
      `owner reads session.${sessionPath?.join('.') ?? '?'}, which the session does not have`,
      'The rule compares the row’s owner with a field of project({ session }).',
    )
}
