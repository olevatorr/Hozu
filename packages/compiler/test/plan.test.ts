import { planRoute } from '@tenon/compiler'
import { buildProject, type QueryNode } from '@tenon/core/ir'
import { describe, expect, it } from 'vitest'
import cartProject from '../../../examples/cart/tenon.config.ts'

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
})
