import { resolveAt } from '@hozu/core/ir'
import type { Ctx } from '../context.ts'
import { featurePointer, transitionsOf } from '../walk.ts'

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
  const fresh = new Set<string>()
  for (const f of Object.values(ctx.ir.features))
    for (const q of Object.values(f.queries))
      if (q.runs !== 'server' || !['static', 'revalidate', 'swr'].includes(q.freshness.kind))
        for (const t of q.tags) fresh.add(t.tag)
  const reported = new Set<string>()
  for (const f of Object.values(ctx.ir.features))
    for (const site of transitionsOf(f))
      site.transition.refresh?.forEach((t, i) => {
        const once =
          site.trigger.kind === 'on' ? `${site.trigger.event} ${t.tag}` : `${site.state} ${i} ${t.tag}`
        if (t.tag === '?' || fresh.has(t.tag) || reported.has(once)) return
        reported.add(once)
        const cached = carried.has(t.tag)
        ctx.report(
          'HZ019',
          f.id,
          site.at('refresh', i),
          cached
            ? `refresh names ${t.tag}, but every query with that tag is cached on the server, so it answers the same data`
            : `refresh names ${t.tag}, but no query carries that tag`,
          cached
            ? "A refresh reads through the query's freshness: 'static', { revalidate } and { swr } answer from the server cache until it expires or a write invalidates the tag."
            : 'The refresh reads nothing again; either a query is missing the tag or the transition names the wrong one.',
          {
            summary: cached
              ? "Give the query freshness: 'request' (read on every refresh) or { poll: seconds }"
              : 'Tag the query the refresh is for',
            snippet: null,
            patch: null,
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
      if (q.scope === 'user' && kind !== 'request' && kind !== 'live' && kind !== 'poll')
        ctx.report(
          'HZ049',
          f.id,
          p,
          `${f.id}.${sym} is user-scoped with freshness ${kind === 'static' ? "'static'" : `{ ${kind}: … }`}`,
          "User data is never cached across requests: 'request' reads it once per request, 'live' also pushes updates, { poll } reads it again on a timer.",
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
