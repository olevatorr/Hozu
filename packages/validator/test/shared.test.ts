import { contract, event, feature, invoke, machine, mutation, on, project } from '@hozu/core'
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
      'Shared on/0 is not covered by any contract (copied into idle, touring; one contract that fires idle/on/f.Search/0 covers every copy)',
    ])
  })

  it('does not count a hand-written identical transition of another state as covered', () => {
    const twins = machine({
      context: z.object({ q: z.string() }),
      initialContext: { q: '' },
      initial: 'idle',
      states: () => ({
        idle: {
          on: [on(Search, { target: 'found', guard: (e) => e.q !== '' }), on(Start, { target: 'touring' })],
        },
        touring: { on: [on(Search, { target: 'found', guard: (e) => e.q !== '' })], ignore: [Start] },
        found: { final: true },
      }),
    })
    const one = contract(twins, {
      given: { state: 'idle' },
      when: [{ send: Search, payload: { q: 'park' } }],
      expect: { state: 'found' },
    })
    expect(hz016({ Search, Start, twins, one }).map((d) => d.message)).toEqual([
      'Transition touring/on/f.Search/0 is not covered by any contract',
    ])
  })

  it('does not count an identical done branch of another state as covered', () => {
    const save = mutation({
      input: z.object({}),
      output: z.object({ ok: z.boolean() }),
      runs: 'server',
      access: 'anyone',
    })
    const saver = machine({
      context: z.object({ q: z.string() }),
      initialContext: { q: '' },
      initial: 'idle',
      states: () => ({
        idle: { on: [on(Search, { target: 'saving' }), on(Start, { target: 'again' })] },
        saving: {
          invoke: invoke(save, {
            input: {},
            done: [{ target: 'idle', guard: (r) => r.ok === true }, { target: 'idle' }],
            failed: { Unexpected: 'idle' },
          }),
        },
        again: {
          invoke: invoke(save, {
            input: {},
            done: [{ target: 'idle', guard: (r) => r.ok === true }, { target: 'idle' }],
            failed: { Unexpected: 'idle' },
          }),
        },
      }),
    })
    const saves = contract(saver, {
      given: { state: 'idle' },
      when: [
        { send: Search, payload: { q: 'x' } },
        { done: save, result: { ok: true } },
      ],
      expect: { state: 'idle', effects: [{ effect: save, input: {} }] },
    })
    expect(hz016({ Search, Start, save, saver, saves }).map((d) => d.message)).toEqual([
      'Transition again/invoke/done/0 is not covered by any contract',
    ])
  })
})
