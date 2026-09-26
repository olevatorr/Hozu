import { buildProject } from '@tenonkit/core/ir'
import { createDataRuntime } from '@tenonkit/data'
import { compileMachine } from '@tenonkit/machine'
import { mount, type Payload, payloadKey, type Result } from '@tenonkit/runtime-client'
import { Window } from 'happy-dom'
import { createResolvers } from './server.ts'
import project from './tenon.config.ts'

const build = buildProject(project, { sources: false })
const data = createDataRuntime({ build, resolvers: createResolvers() })
const session = { userId: 'ada' }
const payload: Payload = new Map()
for (const query of ['cart.getCart', 'catalog.listProducts'])
  payload.set(payloadKey(query, {}), (await data.run(query, {}, session)) as Result)

const window = new Window()
const root = window.document.createElement('main')
const cart = build.ir.features.cart!
const app = mount(root as unknown as Element, {
  view: cart.views.CartPanel!,
  machine: compileMachine(cart, build.bindings.fns),
  payload,
  fns: build.bindings.fns,
  onInvoke: (effect, input) => data.run(effect, input, session) as Promise<Result>,
  onNavigate: (route) => console.log(`navigate → ${route}`),
})

const visible = () =>
  [...root.querySelectorAll('li, p, button')]
    .map((e) => `${e.tagName.toLowerCase()}: ${e.textContent}`)
    .join(' | ')
const click = async (label: string) => {
  ;[...root.querySelectorAll('button')].find((b) => b.textContent === label)!.click()
  console.log(`click ${label.padEnd(8)} → ${app.snapshot()?.state}`)
  await new Promise((r) => setTimeout(r, 0))
  console.log(`         settled → ${app.snapshot()?.state}  ${visible()}`)
}

console.log(`mounted            ${app.snapshot()?.state}  ${visible()}`)
const [addMug] = [...root.querySelectorAll('button')].filter((b) => b.textContent === 'Add')
addMug!.click()
console.log(`click Add (mug)    → ${app.snapshot()?.state}`)
await new Promise((r) => setTimeout(r, 0))
console.log(`         settled → ${app.snapshot()?.state}`)
await click('Checkout')
app.destroy()
await window.happyDOM.close()
