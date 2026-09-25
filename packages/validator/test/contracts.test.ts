import type { DiagnosticCode, ProjectIR } from '@tenon/core/ir'
import { compileMachine } from '@tenon/machine'
import { type Lockfile, runContract, verify } from '@tenon/validator'
import { describe, expect, it } from 'vitest'
import { cartBuild, cartIR } from './support/cart.ts'

const run = (ir: ProjectIR, lock: Lockfile | null = null) => {
  const { sources, bindings } = cartBuild()
  return verify(ir, { sources, bindings, lock })
}

const cart = (ir: ProjectIR) => ir.features.cart!

interface Case {
  name: string
  code: DiagnosticCode
  pointer: string
  mutate: (ir: ProjectIR) => void
}

const catalog: Case[] = [
  {
    name: 'machine changed, contract now fails',
    code: 'TN015',
    pointer: '/features/cart/contracts/rejectsOutOfStock/expect/state',
    mutate: (ir) => {
      cart(ir).machine!.states.adding!.invoke!.failed.OutOfStock![0]!.target = 'idle'
    },
  },
  {
    name: 'contract answers an effect that is not pending',
    code: 'TN015',
    pointer: '/features/cart/contracts/addsItem/when/1',
    mutate: (ir) => {
      const step = cart(ir).contracts.addsItem!.when[1] as { done: string }
      step.done = 'cart.removeItem'
    },
  },
  {
    name: 'contract expects the wrong context',
    code: 'TN015',
    pointer: '/features/cart/contracts/dismissesError/expect/context',
    mutate: (ir) => {
      cart(ir).contracts.dismissesError!.expect.context = {
        pending: { sku: '', qty: 1 },
        error: 'still here',
        orderId: null,
      }
    },
  },
  {
    name: 'new transition without a contract',
    code: 'TN016',
    pointer: '/features/cart/machine/states/idle/on/cart.Dismiss/0',
    mutate: (ir) => {
      cart(ir).machine!.states.idle!.on['cart.Dismiss'] = [
        { guard: null, target: 'idle', assign: [], navigate: null },
      ]
    },
  },
  {
    name: 'contract payload does not match the event schema',
    code: 'TN017',
    pointer: '/features/cart/contracts/addsItem/when/0/payload',
    mutate: (ir) => {
      ;(cart(ir).contracts.addsItem!.when[0] as { payload: unknown }).payload = { sku: 'mug' }
    },
  },
  {
    name: 'contract error data does not match the error schema',
    code: 'TN017',
    pointer: '/features/cart/contracts/paymentDeclined/when/0/data',
    mutate: (ir) => {
      ;(cart(ir).contracts.paymentDeclined!.when[0] as { data: unknown }).data = { code: 51 }
    },
  },
]

describe('Phase 1 behavior catalog', () => {
  it('the cart passes every contract with full coverage', () => {
    const { diagnostics, lock } = run(cartIR())
    expect(diagnostics).toEqual([])
    const entries = Object.values(lock!.features.cart!)
    expect(entries).toHaveLength(15)
    expect(entries.every((e) => Object.keys(e.contracts).length > 0)).toBe(true)
  })

  it.each(catalog)('$code — $name', ({ code, pointer, mutate }) => {
    const ir = cartIR()
    mutate(ir)
    const found = run(ir).diagnostics.filter((d) => d.code === code)
    expect(found.map((d) => d.location.pointer)).toContain(pointer)
    const d = found.find((x) => x.location.pointer === pointer)!
    expect(d.location.source?.file).toMatch(/examples\/cart\/.+\.ts$/)
    expect(d.fix?.summary).toBeTruthy()
    expect(d.fix?.patch).toBeNull()
  })

  it('TN016 suggests a contract skeleton', () => {
    const ir = cartIR()
    cart(ir).machine!.states.idle!.on['cart.Dismiss'] = [
      { guard: null, target: 'idle', assign: [], navigate: null },
    ]
    const d = run(ir).diagnostics.find((x) => x.code === 'TN016')!
    expect(d.fix?.snippet).toContain("given: { state: 'idle'")
    expect(d.fix?.snippet).toContain('{ send: Dismiss, payload: /* … */ }')
  })

  it('TN018 — behavior changed while every contract still passes', () => {
    const baseline = run(cartIR()).lock!
    const ir = cartIR()
    cart(ir).machine!.states.error!.on['cart.Dismiss']![0]!.navigate = 'home'
    const { diagnostics } = run(ir, baseline)
    expect(diagnostics.map((d) => d.code)).toEqual(['TN018'])
    expect(diagnostics[0]!.location.pointer).toBe('/features/cart/machine/states/error/on/cart.Dismiss/0')
    expect(diagnostics[0]!.cause).toContain('dismissesError')
  })

  it('TN018 is satisfied once a covering contract changes', () => {
    const baseline = run(cartIR()).lock!
    const ir = cartIR()
    cart(ir).machine!.states.error!.on['cart.Dismiss']![0]!.navigate = 'home'
    cart(ir).contracts.dismissesError!.expect.effects = null
    expect(run(ir, baseline).diagnostics).toEqual([])
  })

  it('contracts do not run on a statically invalid feature', () => {
    const ir = cartIR()
    cart(ir).machine!.initial = 'idel'
    expect(run(ir).diagnostics.map((d) => d.code)).toEqual(['TN007'])
  })
})

describe('contract runner', () => {
  const { ir, bindings } = cartBuild()
  const machine = compileMachine(ir.features.cart!, bindings.fns)
  const error = { pending: { sku: '', qty: 1 }, error: 'x', orderId: null }
  const elapse = (ms: number, state: string) =>
    runContract(
      machine,
      {
        given: { state: 'error', context: error },
        when: [{ elapse: ms }],
        expect: { state, context: null, effects: null },
      },
      bindings.checks,
    )

  it('fires timers only once their delay has elapsed', () => {
    expect(elapse(4999, 'error')).toEqual({ taken: [], failure: null })
    expect(elapse(5000, 'idle')).toEqual({ taken: ['error/after/0'], failure: null })
  })

  it('splits elapse across steps', () => {
    const r = runContract(
      machine,
      {
        given: { state: 'error', context: error },
        when: [{ elapse: 3000 }, { elapse: 2000 }],
        expect: { state: 'idle', context: null, effects: null },
      },
      bindings.checks,
    )
    expect(r.failure).toBeNull()
  })
})
