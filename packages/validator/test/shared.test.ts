import { contract, event, feature, machine, on, project } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { zodAdapter } from '@hozu/schema-zod'
import { verify } from '@hozu/validator'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const Search = event({ payload: z.object({ q: z.string() }) })
const Start = event({ payload: z.object({}) })
const finder = machine({
  context: z.object({ q: z.string() }),
  initialContext: { q: '' },
  initial: 'idle',
  on: ({ ctx }) => [
    on(Search, {
      guard: (e) => e.q !== '',
      assign: (e) => {
        ctx.q = e.q
      },
    }),
  ],
  states: () => ({
    idle: { on: [on(Start, { target: 'touring' })] },
    touring: { ignore: [Start] },
  }),
})
const searches = contract(finder, {
  given: { state: 'idle' },
  when: [{ send: Search, payload: { q: 'park' } }],
  expect: { state: 'idle', changes: { q: 'park' } },
})

const hz016 = (declarations: Record<string, unknown>) => {
  const build = buildProject(
    project({
      schema: zodAdapter,
      routes: {},
      pages: [],
      features: [feature({ id: 'f', intent: { summary: 'shared' }, declarations: [declarations] })],
    }),
    { sources: false },
  )
  return verify(build.ir, { bindings: build.bindings }).diagnostics.filter((d) => d.code === 'HZ016')
}

describe('a shared transition needs one contract (ADR 0041 D)', () => {
  it('covers every copy of a deciding shared transition with one contract', () => {
    expect(hz016({ Search, Start, finder, searches })).toEqual([])
  })

  it('still asks for a contract when no copy is covered', () => {
    expect(hz016({ Search, Start, finder }).map((d) => d.message)).toEqual([
      'Transition idle/on/f.Search/0 is not covered by any contract',
      'Transition touring/on/f.Search/0 is not covered by any contract',
    ])
  })
})
