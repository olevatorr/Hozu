import type { Check, ContractIR, EffectCallIR, Json } from '@tenon/core/ir'
import { type CompiledMachine, enter, equal, type Snapshot, type Step, transition } from '@tenon/machine'

export interface Failure {
  code: 'TN015' | 'TN017'
  tokens: (string | number)[]
  message: string
  cause: string
}

export interface ContractRun {
  taken: string[]
  failure: Failure | null
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
  machine: CompiledMachine,
  contract: ContractIR,
  checks: Record<string, Check>,
): ContractRun {
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
    if (issues) stop('TN017', tokens, `${what} does not match its schema`, issues.join('; '))
  }
  const stateOf = (s: Snapshot) => machine.states[machine.index.get(s.state)!]!
  try {
    const feature = machine.feature
    if (!machine.index.has(contract.given.state))
      stop(
        'TN015',
        ['given', 'state'],
        `Unknown state "${contract.given.state}"`,
        `States: ${[...machine.index.keys()].join(', ')}.`,
      )
    validate(`${feature}#context`, contract.given.context, ['given', 'context'], 'given.context')
    let snapshot = enter(machine, contract.given.state, contract.given.context).snapshot
    let elapsed = 0
    let fired = new Set<number>()
    const apply = (step: Step) => {
      if (!step.taken) return
      taken.push(step.taken)
      snapshot = step.snapshot
      elapsed = 0
      fired = new Set()
      for (const e of step.effects)
        if (e.type === 'invoke') invokes.push({ effect: e.effect, input: e.input })
        else if (e.type === 'navigate') invokes.push({ navigate: e.url })
    }
    const pending = (effect: string, i: number) => {
      const invoke = stateOf(snapshot).invoke
      if (invoke?.effect !== effect)
        stop(
          'TN015',
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
        'TN015',
        ['expect', 'state'],
        `Expected state "${expect.state}", machine is in "${snapshot.state}"`,
        path,
      )
    if (expect.context !== null && !equal(expect.context, snapshot.context))
      stop(
        'TN015',
        ['expect', 'context'],
        'Context differs from the expectation',
        `${firstDifference(expect.context, snapshot.context)}. ${path}`,
      )
    if (expect.effects !== null && !equal(expect.effects as unknown as Json, invokes as unknown as Json))
      stop(
        'TN015',
        ['expect', 'effects'],
        'Effects (invokes and navigation) differ from the expectation',
        `Expected ${show(expect.effects)}, got ${show(invokes)}. ${path}`,
      )
    return { taken, failure: null }
  } catch (error) {
    if (error instanceof Stop) return { taken, failure: error.failure }
    return {
      taken,
      failure: {
        code: 'TN015',
        tokens: [],
        message: `Contract threw: ${error instanceof Error ? error.message : String(error)}`,
        cause: 'An fn() implementation or the machine raised an exception while running this contract.',
      },
    }
  }
}
