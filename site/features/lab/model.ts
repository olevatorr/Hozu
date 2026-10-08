import { contract, event, machine, on } from '@hozu/core'
import { z } from 'zod'

export const Run = event({ payload: z.object({}) })
export const SetContract = event({ payload: z.object({ missing: z.boolean() }) })
type Stage =
  | 'idle'
  | 'source'
  | 'ir'
  | 'validated'
  | 'compiled'
  | 'brokenSource'
  | 'brokenIr'
  | 'blocked'
  | 'done'
export const m = machine({
  context: z.object({
    missing: z.boolean(),
    scope: z.enum(['public', 'user']),
    freshness: z.enum(['static', 'revalidate', 'swr', 'live']),
    binding: z.boolean(),
  }),
  initialContext: { missing: false, scope: 'public', freshness: 'static', binding: false },
  initial: 'idle',
  states: ({ ctx }) => {
    const controls = () => [
      on(SetContract, {
        target: 'idle',
        assign: (e) => {
          ctx.missing = e.missing
        },
      }),
      on(Run, { target: 'brokenSource', guard: () => ctx.missing === true }),
      on(Run, { target: 'source', guard: () => ctx.missing === false }),
    ]
    const running = (target: Stage) => ({
      ignore: [Run, SetContract],
      after: [{ ms: 2400, target }],
    })
    return {
      idle: { on: controls() },
      source: running('ir'),
      ir: running('validated'),
      validated: running('compiled'),
      compiled: running('done'),
      brokenSource: running('brokenIr'),
      brokenIr: running('blocked'),
      blocked: { on: controls() },
      done: { on: controls() },
    }
  },
})
export const contracts = Object.fromEntries([
  ...(['idle', 'blocked', 'done'] as const).flatMap((state) => [
    [
      `${state}Valid`,
      contract(m, {
        given: { state },
        when: [{ send: Run, payload: {} }, { elapse: 2500 }],
        expect: { state: 'ir' },
      }),
    ],
    [
      `${state}Invalid`,
      contract(m, {
        given: { state, context: { missing: true, scope: 'public', freshness: 'static', binding: false } },
        when: [{ send: Run, payload: {} }, { elapse: 2500 }],
        expect: { state: 'brokenIr' },
      }),
    ],
  ]),
  [
    'holdEachStage',
    contract(m, {
      given: { state: 'idle' },
      when: [{ send: Run, payload: {} }, { elapse: 2300 }],
      expect: { state: 'source' },
    }),
  ],
  [
    'repairAndRun',
    contract(m, {
      given: {
        state: 'blocked',
        context: { missing: true, scope: 'public', freshness: 'static', binding: false },
      },
      when: [
        { send: SetContract, payload: { missing: false } },
        { send: Run, payload: {} },
        { elapse: 9600 },
      ],
      expect: { state: 'done', changes: { missing: false } },
    }),
  ],
])
