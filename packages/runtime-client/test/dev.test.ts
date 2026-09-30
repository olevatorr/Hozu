import { buildProject } from '@hozu/core/ir'
import { createDataRuntime } from '@hozu/data'
import { hydrate } from '@hozu/runtime-client'
import { appOptionsOf, renderToString } from '@hozu/runtime-server'
import { Window } from 'happy-dom'
import { afterEach, describe, expect, it } from 'vitest'
import createResolversApp from '../../../examples/cart/app.ts'
import project from '../../../examples/cart/hozu.config.ts'

const createResolvers = () => appOptionsOf(createResolversApp)!.resolvers

const build = buildProject(project, { sources: false })
const html = (
  await renderToString({
    build,
    data: createDataRuntime({ build, resolvers: createResolvers() }),
    route: 'home',
    session: { userId: 'ada' },
  })
).html.replace(/<script type="module"[^>]*><\/script>/, '')
const machine = JSON.stringify(
  /id="hozu-payload">(.*?)<\/script>/.exec(html) &&
    JSON.parse(/id="hozu-payload">(.*?)<\/script>/.exec(html)![1]!).features.cart,
)
const context = { pending: { sku: '', qty: 7 }, error: null, orderId: null }

const page = async (saved: unknown) => {
  const window = new Window({ url: 'https://cart.example/' })
  if (saved) window.sessionStorage.setItem('hozu:snapshots', JSON.stringify(saved))
  const document = window.document as unknown as Document
  document.write(html)
  const apps = await hydrate(document, { loadFns: async () => build.bindings.fns as never })
  return { window, apps }
}

afterEach(() => {
  globalThis.__HOZU_DEV__ = undefined
})

describe('state-preserving reload (ADR 0020)', () => {
  it('restores a snapshot when the machine is unchanged, then forgets it', async () => {
    globalThis.__HOZU_DEV__ = true
    const { window, apps } = await page({ cart: { machine, snapshot: { state: 'idle', context, entry: 1 } } })
    expect(apps.get('cart')!.snapshot()?.context).toEqual(context)
    expect(window.sessionStorage.getItem('hozu:snapshots')).toBeNull()
  })

  it('starts fresh when the machine changed or the state was waiting on an effect', async () => {
    globalThis.__HOZU_DEV__ = true
    const changed = await page({ cart: { machine: '{}', snapshot: { state: 'idle', context, entry: 1 } } })
    expect(changed.apps.get('cart')!.snapshot()?.context).toMatchObject({ pending: { qty: 1 } })
    const busy = await page({ cart: { machine, snapshot: { state: 'adding', context, entry: 1 } } })
    expect(busy.apps.get('cart')!.snapshot()?.state).toBe('idle')
  })

  it('saves every snapshot for the next reload', async () => {
    globalThis.__HOZU_DEV__ = true
    const { window, apps } = await page(null)
    apps.get('cart')!.dispatch({ type: 'event', event: 'cart.SetQuantity', payload: { qty: 4 } })
    ;(window as unknown as { __hozu: { save(): void } }).__hozu.save()
    const saved = JSON.parse(window.sessionStorage.getItem('hozu:snapshots')!)
    expect(saved.cart.machine).toBe(machine)
    expect(saved.cart.snapshot.context.pending.qty).toBe(4)
  })

  it('does nothing outside development', async () => {
    const { window, apps } = await page({ cart: { machine, snapshot: { state: 'idle', context, entry: 1 } } })
    expect(apps.get('cart')!.snapshot()?.context).toMatchObject({ pending: { qty: 1 } })
    expect((window as unknown as { __hozu?: unknown }).__hozu).toBeUndefined()
  })
})
