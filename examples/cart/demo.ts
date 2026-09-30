import { buildProject } from '@hozu/core/ir'
import { createDataRuntime } from '@hozu/data'
import { compileMachine, type Effect, init, type Step, transition } from '@hozu/machine'
import { appOptionsOf } from '@hozu/runtime-server'
import app from './app.ts'
import { getCart } from './features/cart/effects.ts'
import project from './hozu.config.ts'

const build = buildProject(project, { sources: false })
const data = createDataRuntime({ build, resolvers: appOptionsOf(app)!.resolvers })
const machine = compileMachine(build.ir.features.cart!, build.bindings.fns)
const session = { userId: 'ada' }

async function settle(step: Step): Promise<Step> {
  const invoke = step.effects.find((e): e is Extract<Effect, { type: 'invoke' }> => e.type === 'invoke')
  if (!invoke) return step
  const result = await data.run(invoke.effect, invoke.input, session)
  const invalidated = 'invalidated' in result ? ` invalidated ${JSON.stringify(result.invalidated)}` : ''
  console.log(
    `  ${invoke.effect}(${JSON.stringify(invoke.input)}) → ${result.ok ? 'ok' : result.error}${invalidated}`,
  )
  const next = result.ok
    ? transition(machine, step.snapshot, { type: 'done', entry: invoke.entry, result: result.value })
    : transition(machine, step.snapshot, {
        type: 'failed',
        entry: invoke.entry,
        error: result.error,
        data: result.data,
      })
  return settle(next)
}

const send = async (step: Step, event: string, payload: object) => {
  console.log(`${event}(${JSON.stringify(payload)})`)
  const next = await settle(
    transition(machine, step.snapshot, { type: 'event', event: `cart.${event}`, payload: payload as never }),
  )
  console.log(
    `  → ${next.snapshot.state}${next.effects.some((e) => e.type === 'navigate') ? ' (navigate)' : ''}`,
  )
  return next
}

const reads = await Promise.all([1, 2, 3].map(() => data.query(getCart, {}, session)))
console.log(
  `3 concurrent getCart reads → ${data.stats().fetches} fetch, ${data.stats().deduped} deduped`,
  reads[0],
)

let step = init(machine)
step = await send(step, 'AddItem', { sku: 'mug', qty: 2 })
console.log('  getCart', JSON.stringify(await data.query(getCart, {}, session)), data.stats())
step = await send(step, 'Dismiss', {})
step = await send(step, 'AddItem', { sku: 'tee', qty: 1 })
step = await send(step, 'Dismiss', {})
step = await send(step, 'Checkout', {})
console.log('  getCart', JSON.stringify(await data.query(getCart, {}, session)))
