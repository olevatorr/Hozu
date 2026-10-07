import type { Check, ContractIR, EffectCallIR, Json } from '@hozu/core/ir'
import {
  type CompiledMachine,
  type CompiledTransition,
  enter,
  equal,
  type Snapshot,
  type Step,
  transition,
} from '@hozu/machine'

export interface Failure {
  code: 'HZ015' | 'HZ017'
  tokens: (string | number)[]
  message: string
  cause: string
  snippet?: string
}

export interface ContractRun {
  taken: string[]
  guards: string[]
  failure: Failure | null
}

function tracing(machine: CompiledMachine, evaluated: Set<string>): CompiledMachine {
  const wrap = (ts: CompiledTransition[]) =>
    ts.map((t) => {
      const guard = t.guard
      if (!guard) return t
      return {
        ...t,
        guard: (env: Parameters<typeof guard>[0]) => {
          evaluated.add(t.id)
          return guard(env)
        },
      }
    })
  const each = <K>(m: Map<K, CompiledTransition[]>) => new Map([...m].map(([k, ts]) => [k, wrap(ts)]))
  return {
    ...machine,
    states: machine.states.map((s) => ({
      ...s,
      on: each(s.on),
      after: each(s.after),
      invoke: s.invoke && { ...s.invoke, done: wrap(s.invoke.done), failed: each(s.invoke.failed) },
    })),
  }
}

class Stop extends Error {
  readonly failure: Failure
  constructor(failure: Failure) {
    super(failure.message)
    this.failure = failure
  }
}

const stop = (code: Failure['code'], tokens: Failure['tokens'], message: string, cause: string): never => {
  throw new Stop({ code, tokens, message, cause })
}

const show = (value: unknown) => JSON.stringify(value)

const tagCall = (key: string) => {
  const name = key.slice(key.indexOf('.') + 1)
  const open = name.indexOf('(')
  return open < 0 ? `${name}()` : name
}

function firstDifference(expected: Json, actual: Json, path: string[] = []): string {
  if (
    expected !== null &&
    actual !== null &&
    typeof expected === 'object' &&
    typeof actual === 'object' &&
    Array.isArray(expected) === Array.isArray(actual)
  ) {
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual)])
    for (const key of [...keys].sort()) {
      const e = (expected as Record<string, Json>)[key] ?? null
      const a = (actual as Record<string, Json>)[key] ?? null
      if (!equal(e, a)) return firstDifference(e, a, [...path, key])
    }
  }
  return `context${path.length ? `.${path.join('.')}` : ''}: expected ${show(expected)}, got ${show(actual)}`
}

const unexpectedCheck: Check = (value) =>
  value !== null && typeof value === 'object' && typeof (value as { message?: unknown }).message === 'string'
    ? null
    : ['(root): Unexpected errors carry { message: string }']

export function runContract(
  compiled: CompiledMachine,
  contract: ContractIR,
  checks: Record<string, Check>,
): ContractRun {
  const evaluated = new Set<string>()
  const machine = tracing(compiled, evaluated)
  const guards = () => [...evaluated].sort()
  const taken: string[] = []
  const invokes: EffectCallIR[] = []
  const validate = (
    key: string,
    value: Json,
    tokens: Failure['tokens'],
    what: string,
    check = checks[key],
  ) => {
    const issues = check?.(value)
    if (issues) stop('HZ017', tokens, `${what} does not match its schema`, issues.join('; '))
  }
  const stateOf = (s: Snapshot) => machine.states[machine.index.get(s.state)!]!
  try {
    const feature = machine.feature
    if (!machine.index.has(contract.given.state))
      stop(
        'HZ015',
        ['given', 'state'],
        `Unknown state "${contract.given.state}"`,
        `States: ${[...machine.index.keys()].join(', ')}.`,
      )
    validate(`${feature}#context`, contract.given.context, ['given', 'context'], 'given.context')
    const previous = contract.given.previous
    if (previous !== undefined && !machine.index.has(previous))
      stop(
        'HZ015',
        ['given', 'previous'],
        `Unknown state "${previous}"`,
        `States: ${[...machine.index.keys()].join(', ')}.`,
      )
    let snapshot = enter(machine, contract.given.state, contract.given.context, 1, previous).snapshot
    let elapsed = 0
    let fired = new Set<number>()
    const apply = (step: Step) => {
      if (!step.taken) return
      taken.push(step.taken)
      if (step.snapshot.entry !== snapshot.entry) {
        elapsed = 0
        fired = new Set()
      }
      snapshot = step.snapshot
      for (const e of step.effects)
        if (e.type === 'invoke') invokes.push({ effect: e.effect, input: e.input })
        else if (e.type === 'navigate') invokes.push({ navigate: e.url })
        else if (e.type === 'refresh') invokes.push({ refresh: e.tags })
        else if (e.type === 'copy') invokes.push({ copy: e.text })
        else if (e.type === 'replace') invokes.push({ replace: e.url })
    }
    const pending = (effect: string, i: number) => {
      const invoke = stateOf(snapshot).invoke
      if (invoke?.effect !== effect)
        stop(
          'HZ015',
          ['when', i],
          `No pending ${effect} in state "${snapshot.state}"`,
          invoke ? `"${snapshot.state}" invokes ${invoke.effect}.` : `"${snapshot.state}" invokes nothing.`,
        )
    }
    contract.when.forEach((step, i) => {
      if ('send' in step) {
        validate(`${step.send}#payload`, step.payload, ['when', i, 'payload'], `Payload of ${step.send}`)
        apply(transition(machine, snapshot, { type: 'event', event: step.send, payload: step.payload }))
      } else if ('done' in step) {
        pending(step.done, i)
        validate(`${step.done}#output`, step.result, ['when', i, 'result'], `Result of ${step.done}`)
        apply(transition(machine, snapshot, { type: 'done', entry: snapshot.entry, result: step.result }))
      } else if ('failed' in step) {
        pending(step.failed, i)
        const check =
          step.error === 'Unexpected' ? unexpectedCheck : checks[`${step.failed}#error:${step.error}`]
        validate('', step.data, ['when', i, 'data'], `${step.failed} error ${step.error}`, check)
        apply(
          transition(machine, snapshot, {
            type: 'failed',
            entry: snapshot.entry,
            error: step.error,
            data: step.data,
          }),
        )
      } else {
        let remaining = step.elapse
        for (;;) {
          const state = stateOf(snapshot)
          const next = state.final
            ? undefined
            : state.timers.find((ms) => !fired.has(ms) && ms >= elapsed && ms - elapsed <= remaining)
          if (next === undefined) {
            elapsed += remaining
            break
          }
          remaining -= next - elapsed
          elapsed = next
          fired.add(next)
          apply(transition(machine, snapshot, { type: 'timer', entry: snapshot.entry, ms: next }))
        }
      }
    })
    const path = taken.length ? `Transitions taken: ${taken.join(' → ')}.` : 'No transition fired.'
    const { expect } = contract
    if (snapshot.state !== expect.state)
      stop(
        'HZ015',
        ['expect', 'state'],
        `Expected state "${expect.state}", machine is in "${snapshot.state}"`,
        path,
      )
    if (expect.context !== null && !equal(expect.context, snapshot.context))
      stop(
        'HZ015',
        ['expect', 'context'],
        'Context differs from the expectation',
        `${firstDifference(expect.context, snapshot.context)}. ${path}`,
      )
    if (expect.effects !== null && !equal(expect.effects as unknown as Json, invokes as unknown as Json))
      throw new Stop({
        code: 'HZ015',
        tokens: ['expect', 'effects'],
        message: 'Effects (invokes and navigation) differ from the expectation',
        cause: `Expected ${show(expect.effects)}, got ${show(invokes)}. ${path}`,
        snippet: `effects: [${invokes
          .map((e) =>
            'navigate' in e
              ? `{ navigate: ${JSON.stringify(e.navigate)} }`
              : 'copy' in e
                ? `{ copy: ${JSON.stringify(e.copy)} }`
                : 'replace' in e
                  ? `{ replace: ${JSON.stringify(e.replace)} }`
                  : 'refresh' in e
                    ? `{ refresh: [${e.refresh.map(tagCall).join(', ')}] }`
                    : `{ effect: ${e.effect.slice(e.effect.indexOf('.') + 1)}, input: ${JSON.stringify(e.input)} }`,
          )
          .join(', ')}],`,
      })
    return { taken, guards: guards(), failure: null }
  } catch (error) {
    if (error instanceof Stop) return { taken, guards: guards(), failure: error.failure }
    return {
      taken,
      guards: guards(),
      failure: {
        code: 'HZ015',
        tokens: [],
        message: `Contract threw: ${error instanceof Error ? error.message : String(error)}`,
        cause: 'An fn() implementation or the machine raised an exception while running this contract.',
      },
    }
  }
}
