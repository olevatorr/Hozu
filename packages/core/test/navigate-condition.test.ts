import { event, feature, invoke, machine, mutation, on, project, route, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { zodAdapter } from '@hozu/schema-zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const home = route({ path: '/', params: null, search: null })
const story = route({ path: '/stories/:id', params: z.object({ id: z.string() }), search: null })
const save = mutation({ input: z.object({}), output: z.object({}), runs: 'server', access: 'anyone' })
const Save = event({ payload: z.object({}) })

const appWith = (navigate: 'condition' | 'guards') => {
  const m = machine({
    context: z.object({ returnTo: z.string().nullable() }),
    initialContext: { returnTo: null },
    initial: 'idle',
    states: ({ ctx }) => ({
      idle: { on: [on(Save, { target: 'saving' })] },
      saving: {
        invoke: invoke(save, {
          input: {},
          done:
            navigate === 'condition'
              ? {
                  target: 'idle',
                  navigate: () =>
                    ctx.returnTo !== null ? ui.link(story, { id: ctx.returnTo }) : ui.link(home, null),
                }
              : [
                  {
                    guard: () => ctx.returnTo !== null,
                    target: 'idle',
                    navigate: () => ui.link(story, { id: ctx.returnTo ?? '' }),
                  },
                  { target: 'idle', navigate: () => ui.link(home, null) },
                ],
          failed: { Unexpected: 'idle' },
        }),
      },
    }),
  })
  return project({
    schema: zodAdapter,
    routes: { home, story },
    pages: [],
    features: [
      feature({ id: 'stories', intent: { summary: 'ADR 0060 B' }, declarations: [{ save, Save, m }] }),
    ],
  })
}

describe('a condition inside navigate (ADR 0060 B)', () => {
  it('is HZ014 at the transition, and the fix is the guarded list', () => {
    const d = buildProject(appWith('condition'), { sources: false }).diagnostics.find(
      (x) => x.code === 'HZ014',
    )
    expect(d?.location.pointer).toBe('/features/stories/machine/states/saving/invoke/done/0/navigate')
    expect(d?.message).toBe('navigate must return one ui.link(route, params, search)')
    expect(d?.cause).toContain('a condition inside it (?:, &&, ??)')
    expect(d?.fix?.snippet).toContain('guard: () =>')
  })

  it('accepts the guarded list it suggests', () => {
    const codes = buildProject(appWith('guards'), { sources: false }).diagnostics.map((x) => x.code)
    expect(codes).not.toContain('HZ014')
  })
})
