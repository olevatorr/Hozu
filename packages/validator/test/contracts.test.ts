import type { Diagnostic, DiagnosticCode, ProjectIR, ValueExpr } from '@hozu/core/ir'
import { compileMachine } from '@hozu/machine'
import { type BehaviorRecord, behaviorOf, recordOf, runContract, summaryOf, verify } from '@hozu/validator'
import { describe, expect, it } from 'vitest'
import { cartBuild, cartIR } from './support/cart.ts'

const run = (ir: ProjectIR, lock?: unknown) => {
  const { sources, bindings } = cartBuild()
  return verify(ir, { sources, bindings, lock })
}

const decisive = (ds: Diagnostic[]) => ds.filter((d) => d.code !== 'HZ058')

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
    code: 'HZ015',
    pointer: '/features/cart/contracts/rejectsOutOfStock/expect/state',
    mutate: (ir) => {
      cart(ir).machine!.states.adding!.invoke!.failed.OutOfStock![0]!.target = 'idle'
    },
  },
  {
    name: 'contract answers an effect that is not pending',
    code: 'HZ015',
    pointer: '/features/cart/contracts/addsItem/when/1',
    mutate: (ir) => {
      const step = cart(ir).contracts.addsItem!.when[1] as { done: string }
      step.done = 'cart.removeItem'
    },
  },
  {
    name: 'contract expects the wrong context',
    code: 'HZ015',
    pointer: '/features/cart/contracts/rejectsTooMany/expect/context',
    mutate: (ir) => {
      cart(ir).contracts.rejectsTooMany!.expect.context = {
        pending: { sku: '', qty: 1 },
        error: 'still here',
        orderId: null,
      }
    },
  },
  {
    name: 'new transition without a contract',
    code: 'HZ016',
    pointer: '/features/cart/machine/states/idle/on/cart.Dismiss/0',
    mutate: (ir) => {
      cart(ir).machine!.states.idle!.on['cart.Dismiss'] = [
        {
          guard: { op: 'eq', left: { ref: 'context', path: ['error'] }, right: { literal: null } },
          target: 'idle',
          assign: [],
          navigate: null,
        },
      ]
    },
  },
  {
    name: 'contract payload does not match the event schema',
    code: 'HZ017',
    pointer: '/features/cart/contracts/addsItem/when/0/payload',
    mutate: (ir) => {
      ;(cart(ir).contracts.addsItem!.when[0] as { payload: unknown }).payload = { sku: 'mug' }
    },
  },
  {
    name: 'contract error data does not match the error schema',
    code: 'HZ017',
    pointer: '/features/cart/contracts/rejectsOutOfStock/when/1/data',
    mutate: (ir) => {
      ;(cart(ir).contracts.rejectsOutOfStock!.when[1] as { data: unknown }).data = { code: 51 }
    },
  },
]

describe('Phase 1 behavior catalog', () => {
  it('the cart passes every contract with full coverage', () => {
    const { diagnostics, lock } = run(cartIR())
    expect(diagnostics).toEqual([])
    const entries = Object.values(lock!.features.cart!)
    expect(entries).toHaveLength(15)
    expect(entries.filter((e) => e.decides).every((e) => Object.keys(e.contracts).length > 0)).toBe(true)
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

  it('HZ016 suggests a contract filled from the declarations', () => {
    const ir = cartIR()
    cart(ir).machine!.states.idle!.on['cart.Dismiss'] = [
      {
        guard: { op: 'eq', left: { ref: 'context', path: ['error'] }, right: { literal: null } },
        target: 'idle',
        assign: [],
        navigate: null,
      },
    ]
    const d = run(ir).diagnostics.find((x) => x.code === 'HZ016')!
    expect(d.fix?.snippet).toContain("given: { state: 'idle'")
    expect(d.fix?.snippet).toContain('{ send: Dismiss, payload: {} }')
    expect(d.fix?.snippet).toContain("expect: { state: 'idle' }")
    expect(d.fix?.snippet).toContain('placeholders')
  })

  it('HZ016 offers a plain copy when only ?? or ?: decides (ADR 0082 A8)', async () => {
    const { onlyOperators } = await import('../src/contracts/mechanical.ts')
    const ir = cartIR()
    const coalesce: ValueExpr = {
      fn: '%coalesce',
      arg: { object: { a: { ref: 'context', path: ['error'] }, b: { literal: null } } },
    }
    const on = (assign: { op: 'set'; path: string[]; value: ValueExpr }[], guard: unknown = null) => {
      cart(ir).machine!.states.idle!.on['cart.Dismiss'] = [
        { guard, target: 'idle', assign, navigate: null } as never,
      ]
      return onlyOperators(cart(ir), 'idle/on/cart.Dismiss/0')
    }
    expect(on([{ op: 'set', path: ['error'], value: coalesce }])).toEqual(['(ctx.error ?? null)'])
    expect(
      on([{ op: 'set', path: ['error'], value: coalesce }], {
        op: 'eq',
        left: { literal: 1 },
        right: { literal: 1 },
      }),
    ).toEqual([])
    expect(
      on([
        {
          op: 'set',
          path: ['error'],
          value: { fn: '%plus', arg: { object: { a: { literal: 1 }, b: { literal: 2 } } } },
        },
      ]),
    ).toEqual([])
  })

  it('HZ016 lists only the assigned fields as changes', () => {
    const ir = cartIR()
    cart(ir).machine!.states.idle!.on['cart.Dismiss'] = [
      {
        guard: { op: 'eq', left: { ref: 'context', path: ['error'] }, right: { literal: null } },
        target: 'idle',
        assign: [{ op: 'set', path: ['pending', 'qty'], value: { literal: 2 } }],
        navigate: null,
      },
    ]
    const d = run(ir).diagnostics.find((x) => x.code === 'HZ016')!
    expect(d.fix?.snippet).toContain("expect: { state: 'idle', changes: { pending: { qty: 1 } } }")
    expect(d.fix?.snippet).toContain('decide the expected pending.qty')
  })

  const raiseLimit = (ir: ProjectIR) => {
    const guard = cart(ir).machine!.states.idle!.on['cart.SetQuantity']![0]!.guard as {
      args: { right: ValueExpr }[]
    }
    guard.args[1]!.right = { literal: 50 }
  }

  it('HZ018 — behavior changed while every contract still passes', () => {
    const baseline = run(cartIR()).lock!
    const ir = cartIR()
    raiseLimit(ir)
    const diagnostics = decisive(run(ir, baseline).diagnostics)
    expect(diagnostics.map((d) => d.code)).toEqual(['HZ018'])
    expect(diagnostics[0]!.location.pointer).toBe('/features/cart/machine/states/idle/on/cart.SetQuantity/0')
    expect(diagnostics[0]!.message).toBe(
      'Behavior of idle/on/cart.SetQuantity/0 changed (guard) and no covering contract specifies it',
    )
    expect(diagnostics[0]!.cause.split('\n')[0]).toBe(
      'guard: was (event.qty gte 1 and event.qty lte 10); now (event.qty gte 1 and event.qty lte 50)',
    )
    expect(diagnostics[0]!.cause).toContain('setsQuantity')
  })

  it('HZ018 stays when a covering contract changes but passes against the previous behaviour too', () => {
    const baseline = run(cartIR()).lock!
    const ir = cartIR()
    raiseLimit(ir)
    cart(ir).contracts.setsQuantity!.expect.effects = null
    expect(decisive(run(ir, baseline).diagnostics).map((d) => d.code)).toEqual(['HZ018'])
    const renamed = cartIR()
    raiseLimit(renamed)
    const { setsQuantity, ...rest } = cart(renamed).contracts
    cart(renamed).contracts = { ...rest, setsQuantityRenamed: setsQuantity! }
    expect(decisive(run(renamed, baseline).diagnostics).map((d) => d.code)).toEqual(['HZ018'])
  })

  it('a deciding change is accepted once a covering contract fails against the previous behaviour', () => {
    const baseline = run(cartIR()).lock!
    const ir = cartIR()
    raiseLimit(ir)
    const c = cart(ir).contracts.setsQuantity!
    c.when.push({ send: 'cart.SetQuantity', payload: { qty: 30 } })
    ;(c.expect.context as { pending: { qty: number } }).pending.qty = 30
    expect(decisive(run(ir, baseline).diagnostics).map((d) => d.code)).toEqual(['HZ057'])
    const { sources, bindings } = cartBuild()
    expect(decisive(verify(ir, { sources, bindings, lock: baseline, accept: true }).diagnostics)).toEqual([])
  })

  it('ADR 0063 D2: a transition that stops deciding is reviewed by the lock alone', () => {
    const baseline = run(cartIR()).lock!
    const ir = cartIR()
    cart(ir).machine!.states.idle!.on['cart.SetQuantity']![0]!.guard = null
    const diagnostics = run(ir, baseline).diagnostics
    expect(diagnostics.map((d) => d.code)).not.toContain('HZ018')
    const stale = diagnostics.find((d) => d.code === 'HZ057')!
    expect(stale.cause).toContain('changed idle/on/cart.SetQuantity/0: guard was ')
    expect(stale.cause).toContain(', now none · stops deciding:')
  })

  it('a transition that only copies values needs no contract; the lock summarises it (ADR 0037)', () => {
    const ir = cartIR()
    cart(ir).machine!.states.idle!.on['cart.Dismiss'] = [
      {
        guard: null,
        target: 'idle',
        assign: [{ op: 'set', path: ['error'], value: { literal: null } }],
        navigate: null,
      },
    ]
    const { diagnostics, lock } = run(ir)
    expect(decisive(diagnostics)).toEqual([])
    expect(lock!.features.cart!['idle/on/cart.Dismiss/0']).toMatchObject({
      summary: 'idle --Dismiss--> idle · error := null',
      contracts: {},
    })
  })

  it('HZ057 shows a changed copy-only transition, and accepting it is the review', () => {
    const mechanical = (value: ValueExpr) => (ir: ProjectIR) => {
      cart(ir).machine!.states.idle!.on['cart.Dismiss'] = [
        { guard: null, target: 'idle', assign: [{ op: 'set', path: ['error'], value }], navigate: null },
      ]
    }
    const before = cartIR()
    mechanical({ literal: null })(before)
    const baseline = run(before).lock!
    const after = cartIR()
    mechanical({ literal: 'dismissed' })(after)
    const diagnostics = decisive(run(after, baseline).diagnostics)
    expect(diagnostics.map((d) => d.code)).toEqual(['HZ057'])
    expect(diagnostics[0]!.message).toBe('hozu.lock.json is out of date for cart: 1 changed')
    expect(diagnostics[0]!.location.pointer).toBe('/features/cart/machine/states/idle')
    expect(diagnostics[0]!.cause.split('\n')[1]).toBe(
      'changed idle/on/cart.Dismiss/0: assign - error := null, + error := "dismissed" · now: idle --Dismiss--> idle · error := "dismissed"',
    )
    expect(diagnostics[0]!.fix?.summary).toContain('--update-lock')
    const { sources, bindings } = cartBuild()
    expect(decisive(verify(after, { sources, bindings, lock: baseline, accept: true }).diagnostics)).toEqual(
      [],
    )
  })

  it('HZ015 on effects gives the list to paste, in authoring form (ADR 0038 R2)', () => {
    const ir = cartIR()
    cart(ir).contracts.addsItem!.expect.effects = []
    const d = run(ir).diagnostics.find((x) => x.code === 'HZ015')!
    expect(d.fix?.snippet).toMatch(/^effects: \[\{ effect: addItem, input: \{.*\} \}\],$/)
  })

  it('contracts do not run on a statically invalid feature', () => {
    const ir = cartIR()
    cart(ir).machine!.initial = 'idel'
    expect(run(ir).diagnostics.map((d) => d.code)).toEqual(['HZ007'])
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
    expect(elapse(4999, 'error')).toEqual({ taken: [], guards: [], failure: null })
    expect(elapse(5000, 'idle')).toEqual({ taken: ['error/after/0'], guards: [], failure: null })
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

describe('lock v2 summary (ADR 0043 G)', () => {
  const ir = cartIR()
  const id = 'checkingOut/invoke/done/0'
  const record = recordOf(ir, cart(ir), id)
  const variants: [string, (r: BehaviorRecord) => void][] = [
    [
      'guard',
      (r) => (r.guard = { op: 'eq', left: { ref: 'context', path: ['error'] }, right: { literal: null } }),
    ],
    ['assign', (r) => (r.assign = [])],
    ['navigate search', (r) => ((r.navigate as { search: ValueExpr }).search = { literal: { page: 2 } })],
    ['navigate', (r) => (r.navigate = null)],
    ['enters.state', (r) => (r.enters.state = 'idle')],
    ['enters.effect', (r) => (r.enters.effect = 'cart.addItem')],
    [
      'enters.input',
      (r) => {
        r.enters.effect = 'cart.addItem'
        r.enters.input = { ref: 'context', path: ['pending'] }
      },
    ],
    ['enters.timers', (r) => (r.enters.timers = [5000])],
    ['enters.final', (r) => (r.enters.final = !r.enters.final)],
    ['fns', (r) => (r.fns = { 'cart.total': 'abcdef0123456789' })],
    ['fn sourceHash', (r) => (r.fns = { 'cart.total': 'fedcba9876543210' })],
  ]

  it('prints every hashed field, so a changed hash never shows identical was/now', () => {
    const seen = new Map([[summaryOf(cart(ir), id, record), 'original']])
    const hashes = new Set([behaviorOf(id, record)])
    for (const [name, change] of variants) {
      const r = structuredClone(record)
      change(r)
      const summary = summaryOf(cart(ir), id, r)
      expect(seen.get(summary), `${name} renders like ${seen.get(summary)}`).toBeUndefined()
      seen.set(summary, name)
      hashes.add(behaviorOf(id, r))
    }
    expect(hashes.size).toBe(variants.length + 1)
  })

  it('stores contracts as normalised bodies: context growth and renames keep the hash', () => {
    const before = run(cartIR()).lock!.features.cart!
    const grown = cartIR()
    const f = cart(grown)
    ;(f.machine!.initialContext as Record<string, unknown>).extra = 0
    for (const c of Object.values(f.contracts)) {
      ;(c.given.context as Record<string, unknown>).extra = 0
      if (c.expect.context) (c.expect.context as Record<string, unknown>).extra = 0
    }
    const after = run(grown).lock!.features.cart!
    for (const [id, entry] of Object.entries(before))
      expect(after[id]!.contracts, id).toEqual(entry.contracts)
    const hashOf = (lock: typeof before) => lock['idle/on/cart.SetQuantity/0']!.contracts.setsQuantity
    const renamed = cartIR()
    const { setsQuantity, ...rest } = cart(renamed).contracts
    cart(renamed).contracts = { ...rest, setsQuantityRenamed: setsQuantity! }
    const moved = run(renamed).lock!.features.cart!['idle/on/cart.SetQuantity/0']!.contracts
    expect(moved.setsQuantityRenamed).toBe(hashOf(before))
  })

  it('the pages section reviews who gets a 403 (ADR 0043 D)', () => {
    const baseline = run(cartIR()).lock!
    expect(baseline.pages.head).toEqual({ product: { NotFound: { status: 404 } } })
    const after = cartIR()
    after.pages.product!.head.failed = { NotFound: { status: 403 } }
    const stale = decisive(run(after, baseline).diagnostics)
    expect(stale.map((d) => [d.code, d.location.pointer])).toEqual([['HZ057', '/pages']])
    expect(stale[0]!.cause).toContain('was {"NotFound":{"status":404}}; now {"NotFound":{"status":403}}')
    const { sources, bindings } = cartBuild()
    expect(decisive(verify(after, { sources, bindings, lock: baseline, accept: true }).diagnostics)).toEqual(
      [],
    )
  })
})
