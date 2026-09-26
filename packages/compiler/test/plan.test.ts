import { planRoute, softTargets } from '@hozu/compiler'
import { buildProject, type QueryNode } from '@hozu/core/ir'
import { describe, expect, it } from 'vitest'
import cartProject from '../../../examples/cart/hozu.config.ts'

const ir = () => structuredClone(buildProject(cartProject).ir)

describe('render plans', () => {
  it('home: static shell, isr catalog, per-request cart, machine-bound islands only', () => {
    const { plan, issues } = planRoute(ir(), 'home')
    expect(issues).toEqual([])
    expect(plan.regions.map((r) => [r.id, r.mode, r.seconds])).toEqual([
      ['shell', 'static', null],
      ['catalog.ProductGrid/1', 'isr', 60],
      ['cart.CartPanel/1', 'request', null],
      ['cart.CartPanel/3', 'isr', 60],
    ])
    expect(plan.js).toBe(true)
    expect(plan.cacheable).toBe(false)
    expect(plan.islands).toContain('cart.CartPanel/5')
    expect(plan.nodes.find((n) => n.id === 'cart.CartPanel/0')).toEqual({
      id: 'cart.CartPanel/0',
      region: 'shell',
      mode: 'static',
      hydrate: false,
    })
  })

  it('machine-less pages ship 0 bytes of JS', () => {
    const { plan } = planRoute(ir(), 'orderPlaced')
    expect(plan).toMatchObject({ js: false, islands: [], cacheable: true })
    expect(plan.nodes.every((n) => !n.hydrate)).toBe(true)
  })

  it('a machine-less view of a feature with a machine stays static unless a bound view shares the page', () => {
    const doc = ir()
    doc.features.cart!.views.Summary = {
      machine: null,
      route: null,
      root: {
        id: 'cart.Summary/0',
        kind: 'query',
        query: 'cart.getCart',
        input: { literal: {} },
        ready: { id: 'cart.Summary/0/ready', kind: 'text', value: { literal: 'ok' } },
        pending: null,
        failed: {},
      },
    }
    doc.pages.orderPlaced!.views = ['cart.Summary']
    expect(planRoute(doc, 'orderPlaced').plan).toMatchObject({ js: false, islands: [] })
    doc.pages.orderPlaced!.views = ['cart.Summary', 'cart.CartPanel']
    expect(planRoute(doc, 'orderPlaced').plan.islands).toContain('cart.Summary/0')
  })

  it('nested regions take the more dynamic mode and the shorter interval', () => {
    const doc = ir()
    doc.features.catalog!.queries.getProduct!.freshness = { kind: 'swr', seconds: 10 }
    const grid = doc.features.catalog!.views.ProductGrid!.root
    const outer = (grid as { children: QueryNode[] }).children[1]!
    ;(outer.ready as { children: unknown[] }).children.push({
      id: 'inner',
      kind: 'query',
      query: 'catalog.getProduct',
      input: { literal: { sku: 'mug' } },
      ready: { id: 'inner/ready', kind: 'text', value: { literal: '' } },
      pending: null,
      failed: {},
    })
    const inner = planRoute(doc, 'orderPlaced').plan.regions.find((r) => r.id === 'inner')!
    expect([inner.mode, inner.seconds, inner.parent]).toEqual(['swr', 10, 'catalog.ProductGrid/1'])
  })

  it('derives persistent views and soft navigation targets from the pages (ADR 0015)', () => {
    const doc = ir()
    expect(planRoute(doc, 'home').plan.persistent).toEqual(['cart.CartPanel'])
    expect(planRoute(doc, 'product').plan.persistent).toEqual(['cart.CartPanel'])
    expect(softTargets(doc, 'home')).toEqual({ home: ['cart.CartPanel'], product: ['cart.CartPanel'] })
    expect(softTargets(doc, 'orderPlaced')).toEqual({})
  })

  it('a view that reads params, search or a route-reading machine is never kept', () => {
    const doc = ir()
    const cartQuery = (doc.features.cart!.views.CartPanel!.root as { children: QueryNode[] }).children[1]!
    cartQuery.input = { object: { sku: { ref: 'params', path: ['sku'] } } }
    expect(planRoute(doc, 'home').plan.persistent).toEqual([])
    expect(softTargets(doc, 'home')).toEqual({})
    const viaMachine = ir()
    const idle = viaMachine.features.cart!.machine!.states.idle!
    Object.values(idle.on)[0]![0]!.assign.push({
      op: 'set',
      path: ['error'],
      value: { ref: 'search', path: ['q'] },
    })
    expect(planRoute(viaMachine, 'home').plan.persistent).toEqual([])
  })
})
