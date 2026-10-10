import { event, feature, machine, on, project, route, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { zodAdapter } from '@hozu/schema-zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

describe('a schema that cannot be converted (ADR 0084 A2)', () => {
  it('is HZ014 at the declaration, not a crash of the build', () => {
    const Add = event({ payload: z.object({ id: z.string() }) })
    const Bad = event({ payload: z.object({ inner: (Add as unknown as { payload: never }).payload }) })
    const m = machine({
      context: z.object({ x: z.string() }),
      initialContext: { x: '' },
      initial: 'idle',
      states: () => ({ idle: { on: [on(Add, { target: 'idle' }), on(Bad, { target: 'idle' })] } }),
    })
    const home = route({ path: '/', params: null, search: null })
    const build = buildProject(
      project({
        schema: zodAdapter,
        routes: { home },
        pages: [ui.page(home, { views: [], head: { render: () => ({ title: 'x' }) } })],
        features: [feature({ id: 'f', intent: { summary: 'x' }, declarations: [{ Add, Bad, m }] })],
      }),
      { sources: false },
    )
    expect(build.diagnostics.map((d) => [d.code, d.location.pointer])).toEqual([
      ['HZ014', '/features/f/events/Bad/payload'],
    ])
  })
})
