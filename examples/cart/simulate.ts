import { buildProject } from '@hozu/core/ir'
import { compileMachine, type Effect, type Input, init, transition } from '@hozu/machine'
import project from './hozu.config.ts'

const { ir, bindings } = buildProject(project, { sources: false })
const machine = compileMachine(ir.features.cart!, bindings.fns)

const show = (effects: Effect[]) => (effects.length ? effects.map((e) => JSON.stringify(e)).join(' ') : '—')

let step = init(machine)
console.log(`start      ${step.snapshot.state.padEnd(12)} effects: ${show(step.effects)}`)

const script: ((entry: number) => Input)[] = [
  () => ({ type: 'event', event: 'cart.AddItem', payload: { sku: 'mug', qty: 2 } }),
  (entry) => ({ type: 'failed', entry, error: 'OutOfStock', data: { sku: 'mug', available: 0 } }),
  (entry) => ({ type: 'timer', entry, ms: 5000 }),
  () => ({ type: 'event', event: 'cart.Checkout', payload: {} }),
  (entry) => ({ type: 'done', entry, result: { orderId: 'o-42' } }),
]

for (const next of script) {
  const input = next(step.snapshot.entry)
  step = transition(machine, step.snapshot, input)
  const label = input.type === 'event' ? input.event.split('.')[1]! : input.type
  console.log(
    `${label.padEnd(10)} ${step.snapshot.state.padEnd(12)} effects: ${show(step.effects)}  (${step.taken ?? 'ignored'})`,
  )
}
console.log('context', JSON.stringify(step.snapshot.context))
