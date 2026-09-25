import type { DiagnosticCode, ElementNode, ProjectIR, QueryNode, TextNode, WhenNode } from '@tenon/core/ir'
import { validate } from '@tenon/validator'
import { describe, expect, it } from 'vitest'
import { cartBuild, cartIR, findNode, nodeAt } from './support/cart.ts'
import { applyPatch } from './support/patch.ts'

interface Mutation {
  name: string
  code: DiagnosticCode
  mutate: (ir: ProjectIR) => void
}

const cart = (ir: ProjectIR) => ir.features.cart!
const states = (ir: ProjectIR) => cart(ir).machine!.states
const isButton = (label: string) => (n: { kind: string }) =>
  n.kind === 'el' &&
  (n as ElementNode).tag === 'button' &&
  JSON.stringify((n as ElementNode).children).includes(label)

const catalog: Mutation[] = [
  {
    name: 'typo in a transition target',
    code: 'TN007',
    mutate: (ir) => {
      states(ir).idle!.on['cart.RemoveItem']![0]!.target = 'removin'
    },
  },
  {
    name: 'typo in the initial state',
    code: 'TN007',
    mutate: (ir) => {
      cart(ir).machine!.initial = 'idel'
    },
  },
  {
    name: 'declared error left unhandled',
    code: 'TN004',
    mutate: (ir) => {
      delete states(ir).adding!.invoke!.failed.OutOfStock
    },
  },
  {
    name: 'Unexpected error left unhandled',
    code: 'TN004',
    mutate: (ir) => {
      delete states(ir).removing!.invoke!.failed.Unexpected
    },
  },
  {
    name: 'view query without a failure branch',
    code: 'TN004',
    mutate: (ir) => {
      const { node } = findNode(
        cart(ir),
        'CartPanel',
        (n) => n.kind === 'query' && n.query === 'cart.getCart',
      )
      delete (node as QueryNode).failed.Unexpected
    },
  },
  {
    name: 'orphan state',
    code: 'TN001',
    mutate: (ir) => {
      states(ir).limbo = {
        final: false,
        on: {},
        invoke: null,
        after: [{ ms: 10, transition: { guard: null, target: 'idle', assign: [], navigate: null } }],
      }
    },
  },
  {
    name: 'only path to a state removed',
    code: 'TN001',
    mutate: (ir) => {
      states(ir).checkingOut!.invoke!.done[0]!.target = 'idle'
    },
  },
  {
    name: 'event declared but never handled',
    code: 'TN002',
    mutate: (ir) => {
      cart(ir).events.Refresh = { payload: cart(ir).events.Dismiss!.payload }
    },
  },
  {
    name: 'button visible in a state that ignores its event',
    code: 'TN005',
    mutate: (ir) => {
      const { pointer } = findNode(
        cart(ir),
        'CartPanel',
        (n) => n.kind === 'when' && isButton('Checkout')(n.children[0] ?? { kind: '' }),
      )
      ;(nodeAt(ir, pointer) as WhenNode).states = ['error', 'idle']
    },
  },
  {
    name: 'button moved outside its when()',
    code: 'TN005',
    mutate: (ir) => {
      const { pointer } = findNode(
        cart(ir),
        'CartPanel',
        (n) => n.kind === 'when' && isButton('Remove')(n.children[0] ?? { kind: '' }),
      )
      const li = nodeAt(ir, pointer.slice(0, pointer.lastIndexOf('/children/'))) as ElementNode
      li.children = li.children.map((c) => (c.kind === 'when' ? c.children[0]! : c))
    },
  },
  {
    name: 'foreign view sends an event it cannot observe',
    code: 'TN005',
    mutate: (ir) => {
      const { node } = findNode(ir.features.catalog!, 'ProductGrid', (n) => n.kind === 'el' && n.tag === 'li')
      ;(node as ElementNode).on.click = { event: 'cart.AddItem', payload: { literal: { sku: 'x', qty: 1 } } }
    },
  },
  {
    name: 'typo in an invoked effect',
    code: 'TN003',
    mutate: (ir) => {
      states(ir).adding!.invoke!.effect = 'cart.addItm'
    },
  },
  {
    name: 'invoke of an effect that does not exist',
    code: 'TN003',
    mutate: (ir) => {
      states(ir).removing!.invoke!.effect = 'cart.saveEverything'
    },
  },
  {
    name: 'view reads a private query of another feature',
    code: 'TN006',
    mutate: (ir) => {
      const { node } = findNode(
        cart(ir),
        'CartPanel',
        (n) => n.kind === 'query' && n.query === 'catalog.listProducts',
      )
      ;(node as QueryNode).query = 'catalog.getProduct'
      ;(node as QueryNode).failed.NotFound = (node as QueryNode).failed.Unexpected!
    },
  },
  {
    name: 'feature used without importing it',
    code: 'TN006',
    mutate: (ir) => {
      cart(ir).imports = []
    },
  },
  {
    name: 'mutation invalidates a private tag of another feature',
    code: 'TN006',
    mutate: (ir) => {
      cart(ir).mutations.addItem!.invalidates.push({ tag: 'catalog.productTag', param: { literal: 'mug' } })
    },
  },
  {
    name: 'handler for a misspelled event',
    code: 'TN007',
    mutate: (ir) => {
      const on = states(ir).error!.on
      on['cart.Dismis'] = on['cart.Dismiss']!
      delete on['cart.Dismiss']
    },
  },
  {
    name: 'when() with an unknown state',
    code: 'TN007',
    mutate: (ir) => {
      const { node } = findNode(
        cart(ir),
        'CartPanel',
        (n) => n.kind === 'when' && n.states.includes('placed'),
      )
      ;(node as WhenNode).states = ['placd']
    },
  },
  {
    name: 'navigation to an unknown route',
    code: 'TN007',
    mutate: (ir) => {
      states(ir).checkingOut!.invoke!.done[0]!.navigate = 'orderPlace'
    },
  },
  {
    name: 'failure branch for an undeclared error',
    code: 'TN007',
    mutate: (ir) => {
      const failed = states(ir).adding!.invoke!.failed
      failed.Timeout = failed.Unexpected!
    },
  },
  {
    name: 'export of a symbol that does not exist',
    code: 'TN007',
    mutate: (ir) => {
      cart(ir).exports.events.push('Ghost')
    },
  },
  {
    name: 'assign to a misspelled context path',
    code: 'TN008',
    mutate: (ir) => {
      states(ir).idle!.on['cart.AddItem']![0]!.assign[0]!.path = ['pendin']
    },
  },
  {
    name: 'guard reads a misspelled payload field',
    code: 'TN008',
    mutate: (ir) => {
      const guard = states(ir).idle!.on['cart.AddItem']![0]!.guard as { left: { path: string[] } }
      guard.left.path = ['qtty']
    },
  },
  {
    name: 'done reads a misspelled result field',
    code: 'TN008',
    mutate: (ir) => {
      const value = states(ir).checkingOut!.invoke!.done[0]!.assign[0]!.value as { path: string[] }
      value.path = ['orderID']
    },
  },
  {
    name: 'invoke input reads the event',
    code: 'TN008',
    mutate: (ir) => {
      states(ir).adding!.invoke!.input = { ref: 'event', path: ['pending'] }
    },
  },
  {
    name: 'each keyed by a missing property',
    code: 'TN008',
    mutate: (ir) => {
      const { node } = findNode(cart(ir), 'CartPanel', (n) => n.kind === 'each')
      ;(node as { key: string }).key = 'skuu'
    },
  },
  {
    name: 'text reads a misspelled item field',
    code: 'TN008',
    mutate: (ir) => {
      const { node } = findNode(
        cart(ir),
        'CartPanel',
        (n) => n.kind === 'text' && 'ref' in n.value && n.value.path[0] === 'name',
      )
      ;((node as TextNode).value as { path: string[] }).path = ['nam']
    },
  },
  {
    name: 'guardless transition listed first',
    code: 'TN009',
    mutate: (ir) => {
      states(ir).idle!.on['cart.AddItem']!.reverse()
    },
  },
  {
    name: 'mutation invalidates a tag no query carries',
    code: 'TN019',
    mutate: (ir) => {
      ir.features.catalog!.queries.listProducts!.tags = []
      ir.features.cart!.mutations.checkout!.invalidates.push({ tag: 'catalog.catalogTag', param: null })
    },
  },
  {
    name: 'page renders a view that does not exist',
    code: 'TN007',
    mutate: (ir) => {
      ir.pages.home!.views.push('cart.Ghost')
    },
  },
  {
    name: 'state with no way out',
    code: 'TN010',
    mutate: (ir) => {
      states(ir).error!.on = {}
      states(ir).error!.after = []
    },
  },
]

describe('A2 judgement codes', () => {
  it('TN020 — user-scoped query without a project session has a location but no patch', () => {
    const ir = cartIR()
    ir.session = null
    const found = validate(ir, { sources: cartBuild().sources }).filter((d) => d.code === 'TN020')
    expect(found.map((d) => d.location.pointer)).toEqual(['/features/cart/queries/getCart/scope'])
    expect(found[0]!.location.source?.file).toMatch(/examples\/cart\/.+\.ts$/)
    expect(found[0]!.fix?.patch).toBeNull()
  })
})

describe('A2 rendering judgement codes', () => {
  it('TN022 — a public cached query keyed by user data', () => {
    const ir = cartIR()
    const { node } = findNode(cart(ir), 'CartPanel', (n) => n.kind === 'query' && n.query === 'cart.getCart')
    const ready = (node as QueryNode).ready as ElementNode
    ready.children.push({
      id: 'cart.CartPanel/1/ready/2',
      kind: 'query',
      query: 'catalog.listProducts',
      input: { object: { sku: { ref: 'binding', depth: 0, path: ['items', '0', 'sku'] } } },
      ready: { id: 'cart.CartPanel/1/ready/2/ready', kind: 'text', value: { literal: '' } },
      pending: null,
      failed: {
        Unexpected: {
          id: 'cart.CartPanel/1/ready/2/failed/Unexpected',
          kind: 'text',
          value: { literal: '' },
        },
      },
    })
    const found = validate(ir, { sources: cartBuild().sources }).filter((d) => d.code === 'TN022')
    expect(found.map((d) => d.location.pointer)).toEqual([
      '/features/cart/views/CartPanel/root/children/1/ready/children/2/input',
    ])
    expect(found[0]!.location.source?.file).toMatch(/examples\/cart\/.+\.ts$/)
    expect(found[0]!.fix?.patch).toBeNull()
  })

  it('TN023 — a page asserts cacheable but renders per-request data', () => {
    const ir = cartIR()
    ir.pages.home!.assert = 'cacheable'
    const found = validate(ir, { sources: cartBuild().sources }).filter((d) => d.code === 'TN023')
    expect(found.map((d) => [d.location.pointer, d.message])).toEqual([
      ['/pages/home/assert', 'Page "home" asserts cacheable but derives cart.getCart → request'],
    ])
    expect(found[0]!.location.source?.file).toMatch(/examples\/cart\/routes\.ts$/)
    expect(found[0]!.fix?.patch).toBeNull()
  })
})

describe('A2 mistake catalog', () => {
  it('has at least 20 IR-level mistakes and the fixture is clean', () => {
    expect(catalog.length).toBeGreaterThanOrEqual(20)
    const { ir, sources, diagnostics } = cartBuild()
    expect(diagnostics).toEqual([])
    expect(validate(ir, { sources })).toEqual([])
  })

  it.each(catalog)('$code — $name', ({ code, mutate }) => {
    const ir = cartIR()
    mutate(ir)
    const { sources } = cartBuild()
    const found = validate(ir, { sources }).filter((d) => d.code === code)
    expect(found.length, `expected ${code}`).toBeGreaterThan(0)
    for (const d of found) {
      expect(d.location.pointer).toMatch(/^\/(features|pages)\//)
      expect(d.location.source?.file).toMatch(/examples\/cart\/.+\.ts$/)
      expect(d.location.source?.line).toBeGreaterThan(0)
      expect(d.fix?.patch?.length, `${code} at ${d.location.pointer} needs a patch`).toBeGreaterThan(0)
      const fixed = applyPatch(ir, d.fix!.patch!)
      const remaining = validate(fixed).filter(
        (r) => r.code === code && r.location.pointer === d.location.pointer,
      )
      expect(remaining, `patch for ${code} at ${d.location.pointer}`).toEqual([])
    }
  })
})
