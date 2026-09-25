import { type ProjectIR, resolveAt, type TagExprIR } from '@tenon/core/ir'
import { guardRefs, valueRefs } from './sites.ts'
import { closest } from './suggest.ts'
import { transitionsOf, walkView } from './walk.ts'

export type ImpactKind = 'event' | 'query' | 'mutation' | 'tag' | 'fn' | 'view'

export interface ImpactQuery {
  ref: string
  tag: string
  precision: 'exact' | 'param-dependent'
}

export interface ImpactUse {
  feature: string
  at: string
  via: string
}

export interface Impact {
  target: string
  kind: ImpactKind
  tags: string[]
  queries: ImpactQuery[]
  invalidatedBy: string[]
  uses: ImpactUse[]
  features: string[]
}

const registries: [ImpactKind, 'events' | 'queries' | 'mutations' | 'tags' | 'fns' | 'views'][] = [
  ['event', 'events'],
  ['query', 'queries'],
  ['mutation', 'mutations'],
  ['tag', 'tags'],
  ['fn', 'fns'],
  ['view', 'views'],
]

export class UnknownSymbolError extends Error {
  readonly suggestions: string[]
  constructor(message: string, suggestions: string[]) {
    super(message)
    this.suggestions = suggestions
  }
}

function kindOf(ir: ProjectIR, target: string): ImpactKind {
  const dot = target.indexOf('.')
  const [fid, symbol] = dot < 0 ? [target, ''] : [target.slice(0, dot), target.slice(dot + 1)]
  const feature = ir.features[fid]
  const all = Object.values(ir.features).flatMap((f) =>
    registries.flatMap(([, r]) => Object.keys(f[r]).map((s) => `${f.id}.${s}`)),
  )
  if (feature)
    for (const [kind, registry] of registries) if (Object.hasOwn(feature[registry], symbol)) return kind
  const guess = closest(target, all)
  throw new UnknownSymbolError(`Unknown symbol "${target}"`, guess ? [guess] : all)
}

const sameParam = (a: TagExprIR, b: TagExprIR) =>
  a.param === null && b.param === null
    ? true
    : a.param !== null && b.param !== null && 'literal' in a.param && 'literal' in b.param
      ? JSON.stringify(a.param.literal) === JSON.stringify(b.param.literal)
      : null

export function impact(ir: ProjectIR, target: string): Impact {
  const kind = kindOf(ir, target)
  const features = Object.values(ir.features)
  const tags: string[] = []
  const queries: ImpactQuery[] = []
  const invalidatedBy = new Set<string>()
  const uses: ImpactUse[] = []
  const queriesWith = (tag: TagExprIR) => {
    for (const f of features)
      for (const [sym, q] of Object.entries(f.queries))
        for (const t of q.tags)
          if (t.tag === tag.tag) {
            const same = sameParam(tag, t)
            if (same !== false)
              queries.push({
                ref: `${f.id}.${sym}`,
                tag: t.tag,
                precision: same ? 'exact' : 'param-dependent',
              })
          }
  }
  const mutationsWith = (tag: string) => {
    for (const f of features)
      for (const [sym, m] of Object.entries(f.mutations))
        if (m.invalidates.some((t) => t.tag === tag)) invalidatedBy.add(`${f.id}.${sym}`)
  }
  const reads = new Set<string>()
  if (kind === 'mutation') {
    const [fid, sym] = target.split('.') as [string, string]
    for (const t of ir.features[fid]!.mutations[sym]!.invalidates) {
      tags.push(t.tag)
      queriesWith(t)
    }
    for (const q of queries) reads.add(q.ref)
  } else if (kind === 'query') {
    const [fid, sym] = target.split('.') as [string, string]
    for (const t of ir.features[fid]!.queries[sym]!.tags) {
      tags.push(t.tag)
      mutationsWith(t.tag)
    }
    reads.add(target)
  } else if (kind === 'tag') {
    tags.push(target)
    queriesWith({ tag: target, param: null })
    for (const q of queries) q.precision = 'param-dependent'
    mutationsWith(target)
    for (const q of queries) reads.add(q.ref)
  }
  const effects = kind === 'mutation' ? new Set([target, ...reads]) : reads
  for (const f of features) {
    for (const site of transitionsOf(f)) {
      if (kind === 'event' && site.trigger.kind === 'on' && site.trigger.event === target)
        uses.push({ feature: f.id, at: site.pointer, via: `handled in "${site.state}"` })
      if (kind === 'fn') {
        const found = (ref: string) => {
          if (ref === target)
            uses.push({ feature: f.id, at: site.pointer, via: `used by ${site.state} transition` })
        }
        if (site.transition.guard) guardRefs(site.transition.guard, '', found)
        for (const a of site.transition.assign) valueRefs(a.value, '', found)
      }
    }
    for (const [state, s] of Object.entries(f.machine?.states ?? {}))
      if (s.invoke && effects.has(s.invoke.effect))
        uses.push({
          feature: f.id,
          at: `/features/${f.id}/machine/states/${state}/invoke`,
          via: `"${state}" invokes ${s.invoke.effect}`,
        })
    for (const [vid, view] of Object.entries(f.views))
      walkView(ir, f, vid, view, ({ node, pointer }) => {
        const at = resolveAt(pointer)
        if (node.kind === 'query' && reads.has(node.query))
          uses.push({ feature: f.id, at, via: `${node.id} reads ${node.query}` })
        if (node.kind === 'embed' && kind === 'view' && node.view === target)
          uses.push({ feature: f.id, at, via: `${node.id} embeds ${target}` })
        if (node.kind === 'el' && kind === 'event')
          for (const send of Object.values(node.on))
            if (send.event === target) uses.push({ feature: f.id, at, via: `${node.id} sends ${target}` })
        if (kind === 'fn') {
          const found = (ref: string) => {
            if (ref === target) uses.push({ feature: f.id, at, via: `${node.id} uses ${target}` })
          }
          if (node.kind === 'text') valueRefs(node.value, '', found)
          if (node.kind === 'each') valueRefs(node.source, '', found)
        }
      })
  }
  const touched = new Set<string>([target.split('.')[0]!])
  for (const q of queries) touched.add(q.ref.split('.')[0]!)
  for (const m of invalidatedBy) touched.add(m.split('.')[0]!)
  for (const u of uses) touched.add(u.feature)
  return {
    target,
    kind,
    tags: [...new Set(tags)],
    queries,
    invalidatedBy: [...invalidatedBy].sort(),
    uses,
    features: [...touched].sort(),
  }
}
