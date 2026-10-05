import { feature, project, query } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { zodAdapter } from '@hozu/schema-zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const appWith = (freshness: { poll: number }, scope: 'public' | 'user') => {
  const q = query({
    input: z.object({}),
    output: z.number(),
    scope,
    freshness,
    runs: 'server',
    ...(scope === 'user' ? { access: 'signedIn' as const } : {}),
  } as never)
  return project({
    schema: zodAdapter,
    session: z.object({ user: z.string() }),
    routes: {},
    pages: [],
    features: [feature({ id: 'quotes', intent: { summary: 'ADR 0063 C1' }, declarations: [{ q }] })],
  })
}

describe('freshness { poll } (ADR 0063 C1)', () => {
  it('records the interval, for public and user data alike', () => {
    for (const scope of ['public', 'user'] as const) {
      const build = buildProject(appWith({ poll: 30 }, scope), { sources: false })
      expect(build.ir.features.quotes!.queries.q!.freshness).toEqual({ kind: 'poll', seconds: 30 })
      expect(build.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code)).toEqual([])
    }
  })

  it('refuses an interval under five seconds', () => {
    const codes = buildProject(appWith({ poll: 2 }, 'public'), { sources: false }).diagnostics.map(
      (d) => d.code,
    )
    expect(codes).toContain('HZ014')
  })
})
