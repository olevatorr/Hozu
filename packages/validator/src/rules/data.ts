import { resolveAt } from '@hozu/core/ir'
import type { Ctx } from '../context.ts'
import { featurePointer } from '../walk.ts'

export function invalidations(ctx: Ctx) {
  const carried = new Set<string>()
  for (const f of Object.values(ctx.ir.features))
    for (const q of Object.values(f.queries)) for (const t of q.tags) carried.add(t.tag)
  for (const f of Object.values(ctx.ir.features))
    for (const [kind, sym, list] of [
      ...Object.entries(f.mutations).map(([sym, m]) => ['mutations', sym, m.invalidates] as const),
      ...Object.entries(f.endpoints).map(([sym, e]) => ['endpoints', sym, e.invalidates ?? []] as const),
    ])
      list.forEach((t, i) => {
        if (t.tag === '?' || carried.has(t.tag)) return
        const p = featurePointer(f.id, kind, sym, 'invalidates', i)
        ctx.report(
          'HZ019',
          f.id,
          p,
          `${f.id}.${sym} invalidates ${t.tag}, but no query carries that tag`,
          'The invalidation has no effect; either a query is missing the tag or the mutation names the wrong one.',
          {
            summary: 'Tag the affected query, or remove this invalidation',
            snippet: null,
            patch: [{ op: 'remove', path: resolveAt(p) }],
          },
        )
      })
}

export function sessions(ctx: Ctx) {
  if (ctx.ir.session !== null) return
  for (const f of Object.values(ctx.ir.features))
    for (const [sym, q] of Object.entries(f.queries))
      if (q.scope === 'user' && q.runs !== 'browser')
        ctx.report(
          'HZ020',
          f.id,
          featurePointer(f.id, 'queries', sym, 'scope'),
          `${f.id}.${sym} is user-scoped but the project declares no session`,
          'User-scoped data is read per request for the identity the session declares; public resolvers never see it (ADR 0005 D2).',
          {
            summary:
              "Declare project({ session: schema }), or decide the data is public and change scope to 'public'",
            snippet: 'session: z.object({ userId: z.string() })',
            patch: null,
          },
        )
}

const REQUEST = { kind: 'request' }

export function queryFreshness(ctx: Ctx) {
  for (const f of Object.values(ctx.ir.features))
    for (const [sym, q] of Object.entries(f.queries)) {
      const p = featurePointer(f.id, 'queries', sym, 'freshness')
      const kind = q.freshness.kind
      if (q.scope === 'user' && kind !== 'request' && kind !== 'live')
        ctx.report(
          'HZ049',
          f.id,
          p,
          `${f.id}.${sym} is user-scoped with freshness ${kind === 'static' ? "'static'" : `{ ${kind}: … }`}`,
          "User data is never cached across requests: 'request' reads it once per request, 'live' also pushes updates.",
          {
            summary: "Use freshness: 'request'",
            snippet: "freshness: 'request',",
            patch: [{ op: 'replace', path: resolveAt(p), value: REQUEST }],
          },
        )
      else if (kind === 'live' && q.tags.length === 0)
        ctx.report(
          'HZ050',
          f.id,
          p,
          `${f.id}.${sym} is 'live' but carries no tags`,
          "A live query refreshes when one of its tags is invalidated; without tags it behaves like 'request' (principle 1).",
          {
            summary: "Add the tags its writers invalidate, or use freshness: 'request'",
            snippet: 'tags: () => [itemsTag()],',
            patch: [{ op: 'replace', path: resolveAt(p), value: REQUEST }],
          },
        )
    }
}

export function getEndpointWrites(ctx: Ctx) {
  for (const f of Object.values(ctx.ir.features))
    for (const [sym, e] of Object.entries(f.endpoints))
      if (e.method === 'GET' && e.invalidates?.length) {
        const p = featurePointer(f.id, 'endpoints', sym, 'method')
        ctx.report(
          'HZ062',
          f.id,
          p,
          `GET endpoint ${f.id}.${sym} invalidates tags`,
          'A GET request can be prefetched, prerendered or replayed, so a write behind it may run without intent. E-mail confirmation links are a legitimate exception.',
          {
            summary: "Use method: 'POST', or keep GET on purpose (e-mail links)",
            snippet: "method: 'POST',",
            patch: [{ op: 'replace', path: resolveAt(p), value: 'POST' }],
          },
        )
      }
}
