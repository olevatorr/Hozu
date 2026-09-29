import { contract, event, feature, machine, on, project } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { zodAdapter } from '@hozu/schema-zod'
import { verify } from '@hozu/validator'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const Save = event({ payload: z.object({}) })
const editor = machine({
  context: z.object({ draft: z.string(), saved: z.boolean() }),
  initialContext: { draft: '', saved: false },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: {
      on: [
        on(Save, {
          target: 'idle',
          guard: () => ctx.draft.length >= 2,
          assign: () => {
            ctx.saved = true
          },
        }),
      ],
    },
  }),
})
const saves = contract(editor, {
  given: { state: 'idle', context: { draft: 'ok' } },
  when: [{ send: Save, payload: {} }],
  expect: { state: 'idle', changes: { saved: true } },
})
const ignoresShort = contract(editor, {
  given: { state: 'idle', context: { draft: 'a' } },
  when: [{ send: Save, payload: {} }],
  expect: { state: 'idle' },
})

describe('.length of a string (ADR 0039)', () => {
  it('validates and runs, so a guard on a text length decides', () => {
    const build = buildProject(
      project({
        schema: zodAdapter,
        routes: {},
        pages: [],
        features: [
          feature({
            id: 'f',
            intent: { summary: 'length' },
            declarations: [{ Save, editor, saves, ignoresShort }],
          }),
        ],
      }),
      { sources: false },
    )
    expect(build.diagnostics).toEqual([])
    expect(verify(build.ir, { bindings: build.bindings }).diagnostics).toEqual([])
  })
})
