import { contract, event, machine, on } from '@hozu/core'
import { z } from 'zod'

export const Run = event({ payload: z.object({}) })
export const SetContract = event({ payload: z.object({ missing: z.boolean() }) })
export const SetScope = event({ payload: z.object({ value: z.enum(['public', 'user']) }) })
export const SetFreshness = event({
  payload: z.object({ value: z.enum(['static', 'revalidate', 'swr', 'live']) }),
})
export const SetBinding = event({ payload: z.object({ value: z.boolean() }) })
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
    const settings = (target: Stage) => [
      on(SetScope, {
        target,
        assign: (e) => {
          ctx.scope = e.value
        },
      }),
      on(SetFreshness, {
        target,
        assign: (e) => {
          ctx.freshness = e.value
        },
      }),
      on(SetBinding, {
        target,
        assign: (e) => {
          ctx.binding = e.value
        },
      }),
    ]
    const controls = (target: Stage) => [
      ...settings(target),
      on(SetContract, {
        target: 'idle',
        assign: (e) => {
          ctx.missing = e.missing
        },
      }),
      on(Run, { target: 'brokenSource', guard: () => ctx.missing === true }),
      on(Run, { target: 'source', guard: () => ctx.missing === false }),
    ]
    const running = (state: Stage, target: Stage) => ({
      on: settings(state),
      ignore: [Run, SetContract],
      after: [{ ms: 700, target }],
    })
    return {
      idle: { on: controls('idle') },
      source: running('source', 'ir'),
      ir: running('ir', 'validated'),
      validated: running('validated', 'compiled'),
      compiled: running('compiled', 'done'),
      brokenSource: running('brokenSource', 'brokenIr'),
      brokenIr: running('brokenIr', 'blocked'),
      blocked: { on: controls('blocked') },
      done: { on: controls('done') },
    }
  },
})
export const contracts = Object.fromEntries([
  ...(['idle', 'blocked', 'done'] as const).flatMap((state) => [
    [
      `${state}Valid`,
      contract(m, {
        given: { state },
        when: [{ send: Run, payload: {} }],
        expect: { state: 'source' },
      }),
    ],
    [
      `${state}Invalid`,
      contract(m, {
        given: { state, context: { missing: true, scope: 'public', freshness: 'static', binding: false } },
        when: [{ send: Run, payload: {} }],
        expect: { state: 'brokenSource' },
      }),
    ],
  ]),
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
        { elapse: 2800 },
      ],
      expect: { state: 'done', changes: { missing: false } },
    }),
  ],
])
