import type { Json } from '@hozu/core/ir'
import type { CompiledMachine, CompiledTransition, Effect, Env, Input, Snapshot, Step } from './types.ts'

function enterEffects(
  machine: CompiledMachine,
  state: number,
  context: Json,
  entry: number,
  effects: Effect[],
) {
  const s = machine.states[state]!
  if (s.invoke)
    effects.push({ type: 'invoke', entry, effect: s.invoke.effect, input: s.invoke.input({ context }) })
  for (const ms of s.timers) effects.push({ type: 'timer', entry, ms })
}

export function enter(machine: CompiledMachine, state: string, context: Json, entry = 1): Step {
  const index = machine.index.get(state)
  if (index === undefined) throw new Error(`Unknown state "${state}" in ${machine.feature}`)
  const effects: Effect[] = []
  enterEffects(machine, index, context, entry, effects)
  return { snapshot: { state, context, entry }, effects, taken: null }
}

export const init = (machine: CompiledMachine): Step =>
  enter(machine, machine.states[machine.initial]!.name, machine.initialContext)

const ignored = (snapshot: Snapshot): Step => ({ snapshot, effects: [], taken: null })

function fire(
  machine: CompiledMachine,
  snapshot: Snapshot,
  candidates: CompiledTransition[] | undefined,
  env: Env,
): Step {
  if (!candidates) return ignored(snapshot)
  for (const t of candidates) {
    if (t.guard && !t.guard(env)) continue
    let context = snapshot.context
    for (const update of t.assign) context = update(context, env)
    const entry = snapshot.entry + 1
    const effects: Effect[] = t.navigate === null ? [] : [{ type: 'navigate', url: String(t.navigate(env)) }]
    enterEffects(machine, t.target, context, entry, effects)
    return { snapshot: { state: machine.states[t.target]!.name, context, entry }, effects, taken: t.id }
  }
  return ignored(snapshot)
}

export function transition(machine: CompiledMachine, snapshot: Snapshot, input: Input): Step {
  const state = machine.states[machine.index.get(snapshot.state) ?? -1]
  if (!state || state.final) return ignored(snapshot)
  const context = snapshot.context
  switch (input.type) {
    case 'event':
      return fire(machine, snapshot, state.on.get(input.event), { context, event: input.payload })
    case 'done':
      if (input.entry !== snapshot.entry || !state.invoke) return ignored(snapshot)
      return fire(machine, snapshot, state.invoke.done, { context, result: input.result })
    case 'failed': {
      if (input.entry !== snapshot.entry || !state.invoke) return ignored(snapshot)
      const failed = state.invoke.failed
      const declared = failed.has(input.error)
      const error = declared ? input.data : { message: messageOf(input.data, input.error) }
      return fire(machine, snapshot, failed.get(declared ? input.error : 'Unexpected'), { context, error })
    }
    case 'timer':
      if (input.entry !== snapshot.entry) return ignored(snapshot)
      return fire(machine, snapshot, state.after.get(input.ms), { context })
  }
}

function messageOf(data: Json, error: string): string {
  if (data !== null && typeof data === 'object' && !Array.isArray(data) && typeof data.message === 'string')
    return data.message
  return error
}
