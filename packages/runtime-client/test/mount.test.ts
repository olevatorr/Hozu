// @vitest-environment happy-dom
import { buildProject } from '@tenon/core/ir'
import { compileMachine } from '@tenon/machine'
import { motion, mount, type Payload, payloadKey, type Result } from '@tenon/runtime-client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import cartProject from '../../../examples/cart/tenon.config.ts'

const { ir, bindings } = buildProject(cartProject)
const cart = ir.features.cart!
const machine = compileMachine(cart, bindings.fns)
const products = [
  { sku: 'mug', name: 'Mug', price: 12 },
  { sku: 'tee', name: 'T-shirt', price: 25 },
]
const payload: Payload = new Map<string, Result>([
  [
    payloadKey('cart.getCart', {}),
    { ok: true, value: { items: [{ sku: 'mug', name: 'Mug', price: 12, qty: 2 }] } },
  ],
  [payloadKey('catalog.listProducts', {}), { ok: true, value: products }],
])

const texts = (root: Element, selector: string) =>
  [...root.querySelectorAll(selector)].map((e) => e.textContent)
const button = (root: Element, label: string) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent === label)

afterEach(() => vi.useRealTimers())

describe('client runtime', () => {
  it('renders payload data, fn results and state-dependent regions without fetching', () => {
    const root = document.createElement('div')
    mount(root, { view: cart.views.CartPanel!, machine, payload, fns: bindings.fns })
    expect(texts(root, 'li').map((t) => t?.replace(/\s+/g, ' '))).toEqual([
      'Mug × 2Remove',
      'MugAdd',
      'T-shirtAdd',
    ])
    expect(root.querySelector('p.font-bold')?.textContent).toBe('Total: $24')
    expect(button(root, 'Checkout')).toBeDefined()
    expect(root.querySelector('h2')?.textContent).toBe('Cart')
  })

  it('dispatches events, runs invokes through the host, and updates only affected regions', async () => {
    const root = document.createElement('div')
    let resolve: (r: Result) => void = () => {}
    const onInvoke = vi.fn(() => new Promise<Result>((r) => (resolve = r)))
    const app = mount(root, { view: cart.views.CartPanel!, machine, payload, fns: bindings.fns, onInvoke })
    const heading = root.querySelector('h2')
    button(root, 'Add')!.click()
    expect(onInvoke).toHaveBeenCalledWith('cart.addItem', { sku: 'mug', qty: 1 })
    expect(app.snapshot()?.state).toBe('adding')
    expect(texts(root, 'p[aria-live]')).toEqual(['Saving…'])
    expect(button(root, 'Checkout')).toBeUndefined()
    resolve({ ok: false, error: 'OutOfStock', data: { sku: 'mug', available: 0 } })
    await Promise.resolve()
    await Promise.resolve()
    expect(app.snapshot()?.state).toBe('error')
    expect(texts(root, 'p[role="alert"]')).toEqual(['Out of stock'])
    expect(root.querySelector('h2')).toBe(heading)
  })

  it('owns after() timers', () => {
    vi.useFakeTimers()
    const root = document.createElement('div')
    const app = mount(root, {
      view: cart.views.CartPanel!,
      machine,
      payload,
      fns: bindings.fns,
      motion,
      snapshot: {
        state: 'idle',
        context: { pending: { sku: '', qty: 1 }, error: null, orderId: null },
        entry: 1,
      },
    })
    app.dispatch({ type: 'event', event: 'cart.AddItem', payload: { sku: 'mug', qty: 11 } })
    expect(app.snapshot()?.state).toBe('error')
    vi.advanceTimersByTime(5000)
    expect(app.snapshot()?.state).toBe('idle')
    expect(root.querySelector('p[role="alert"]')?.className).toBe('fade-leave-from fade-leave-active')
    vi.advanceTimersByTime(100)
    expect(texts(root, 'p[role="alert"]')).toEqual([])
    app.destroy()
    expect(root.childNodes).toHaveLength(0)
  })

  it('toggles class groups and binds CSS variables from context', () => {
    const root = document.createElement('div')
    const app = mount(root, { view: cart.views.CartPanel!, machine, payload, fns: bindings.fns })
    const label = root.querySelector('label')!
    const bar = root.querySelector('span > span') as HTMLElement
    expect(label.className).toBe('flex items-center gap-2')
    expect(bar.style.getPropertyValue('--qty')).toBe('1')
    app.dispatch({ type: 'event', event: 'cart.SetQuantity', payload: { qty: 10 } })
    expect(label.className).toBe('flex items-center gap-2 font-semibold text-red-600')
    expect(bar.style.getPropertyValue('--qty')).toBe('10')
    app.dispatch({ type: 'event', event: 'cart.SetQuantity', payload: { qty: 4 } })
    expect(label.className).toBe('flex items-center gap-2')
  })

  it('renders machine-less views statically and shows pending for missing payload', () => {
    const root = document.createElement('div')
    mount(root, { view: ir.features.catalog!.views.ProductGrid!, machine: null, payload: new Map() })
    expect(root.textContent).toContain('Loading products…')
  })
})
