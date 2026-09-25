import { resolveAt } from '@tenon/core/ir'
import type { Ctx } from '../context.ts'
import { featurePointer } from '../walk.ts'

export function invalidations(ctx: Ctx) {
  const carried = new Set<string>()
  for (const f of Object.values(ctx.ir.features))
    for (const q of Object.values(f.queries)) for (const t of q.tags) carried.add(t.tag)
  for (const f of Object.values(ctx.ir.features))
    for (const [sym, m] of Object.entries(f.mutations))
      m.invalidates.forEach((t, i) => {
        if (t.tag === '?' || carried.has(t.tag)) return
        const p = featurePointer(f.id, 'mutations', sym, 'invalidates', i)
        ctx.report(
          'TN019',
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
      if (q.scope === 'user')
        ctx.report(
          'TN020',
          f.id,
          featurePointer(f.id, 'queries', sym, 'scope'),
          `${f.id}.${sym} is user-scoped but the project declares no session`,
          'User-scoped data needs an authenticated identity to partition its cache (ADR 0005 D2).',
          {
            summary:
              "Declare project({ session: schema }), or decide the data is public and change scope to 'public'",
            snippet: 'session: z.object({ userId: z.string() })',
            patch: null,
          },
        )
}
