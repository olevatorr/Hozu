import { contract, event, machine, on, op } from '@hozu/core'
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
      on(SetScope, { target, assign: (e) => [op.set(ctx.scope, e.value)] }),
      on(SetFreshness, { target, assign: (e) => [op.set(ctx.freshness, e.value)] }),
      on(SetBinding, { target, assign: (e) => [op.set(ctx.binding, e.value)] }),
    ]
    const controls = (target: Stage) => [
      ...settings(target),
      on(SetContract, { target: 'idle', assign: (e) => [op.set(ctx.missing, e.missing)] }),
      on(Run, { target: 'brokenSource', guard: () => op.eq(ctx.missing, true) }),
      on(Run, { target: 'source', guard: () => op.eq(ctx.missing, false) }),
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
const states = [
  'idle',
  'source',
  'ir',
  'validated',
  'compiled',
  'brokenSource',
  'brokenIr',
  'blocked',
  'done',
] as const
export const contracts = Object.fromEntries([
  ...states.flatMap((state) => [
    [
      `${state}Scope`,
      contract(m, {
        given: { state },
        when: [{ send: SetScope, payload: { value: 'user' } }],
        expect: { state, changes: { scope: 'user' } },
      }),
    ],
    [
      `${state}Freshness`,
      contract(m, {
        given: { state },
        when: [{ send: SetFreshness, payload: { value: 'swr' } }],
        expect: { state, changes: { freshness: 'swr' } },
      }),
    ],
    [
      `${state}Binding`,
      contract(m, {
        given: { state },
        when: [{ send: SetBinding, payload: { value: true } }],
        expect: { state, changes: { binding: true } },
      }),
    ],
  ]),
  ...(['idle', 'blocked', 'done'] as const).flatMap((state) => [
    [
      `${state}Contract`,
      contract(m, {
        given: { state },
        when: [{ send: SetContract, payload: { missing: true } }],
        expect: { state: 'idle', changes: { missing: true } },
      }),
    ],
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
  ...[
    ['source', 'ir'],
    ['ir', 'validated'],
    ['validated', 'compiled'],
    ['compiled', 'done'],
    ['brokenSource', 'brokenIr'],
    ['brokenIr', 'blocked'],
  ].map(([state, target]) => [
    `${state}Timer`,
    contract(m, {
      given: { state: state as Stage },
      when: [{ elapse: 700 }],
      expect: { state: target as Stage },
    }),
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
