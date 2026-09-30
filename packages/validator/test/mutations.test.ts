import type { DiagnosticCode, ElementNode, ProjectIR, QueryNode, TextNode, WhenNode } from '@hozu/core/ir'
import { validate } from '@hozu/validator'
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
    code: 'HZ007',
    mutate: (ir) => {
      states(ir).idle!.on['cart.RemoveItem']![0]!.target = 'removin'
    },
  },
  {
    name: 'typo in the initial state',
    code: 'HZ007',
    mutate: (ir) => {
      cart(ir).machine!.initial = 'idel'
    },
  },
  {
    name: 'declared error left unhandled',
    code: 'HZ004',
    mutate: (ir) => {
      delete states(ir).adding!.invoke!.failed.OutOfStock
    },
  },
  {
    name: 'Unexpected error left unhandled',
    code: 'HZ004',
    mutate: (ir) => {
      delete states(ir).removing!.invoke!.failed.Unexpected
    },
  },
  {
    name: 'view query without a failure branch',
    code: 'HZ004',
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
    code: 'HZ001',
    mutate: (ir) => {
      states(ir).limbo = {
        final: false,
        on: {},
        ignore: [],
        invoke: null,
        after: [{ ms: 10, transition: { guard: null, target: 'idle', assign: [], navigate: null } }],
      }
    },
  },
  {
    name: 'only path to a state removed',
    code: 'HZ001',
    mutate: (ir) => {
      states(ir).checkingOut!.invoke!.done[0]!.target = 'idle'
    },
  },
  {
    name: 'event declared but never handled',
    code: 'HZ002',
    mutate: (ir) => {
      cart(ir).events.Refresh = { payload: cart(ir).events.Dismiss!.payload }
    },
  },
  {
    name: 'button visible in a state that ignores its event',
    code: 'HZ005',
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
    code: 'HZ005',
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
    name: 'DOM field that the event does not carry',
    code: 'HZ027',
    mutate: (ir) => {
      const { node } = findNode(cart(ir), 'CartPanel', (n) => n.kind === 'el' && n.tag === 'input')
      ;(node as ElementNode).on.input = {
        event: 'cart.SetQuantity',
        payload: { object: { qty: { ref: 'dom', path: ['valueAsNumbr'] } } },
      }
    },
  },
  {
    name: 'foreign view sends an event it cannot observe',
    code: 'HZ005',
    mutate: (ir) => {
      const { node } = findNode(ir.features.catalog!, 'ProductGrid', (n) => n.kind === 'el' && n.tag === 'li')
      ;(node as ElementNode).on.click = { event: 'cart.AddItem', payload: { literal: { sku: 'x', qty: 1 } } }
    },
  },
  {
    name: 'typo in an invoked effect',
    code: 'HZ003',
    mutate: (ir) => {
      states(ir).adding!.invoke!.effect = 'cart.addItm'
    },
  },
  {
    name: 'invoke of an effect that does not exist',
    code: 'HZ003',
    mutate: (ir) => {
      states(ir).removing!.invoke!.effect = 'cart.saveEverything'
    },
  },
  {
    name: 'view reads a private query of another feature',
    code: 'HZ006',
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
    code: 'HZ006',
    mutate: (ir) => {
      cart(ir).imports = []
    },
  },
  {
    name: 'mutation invalidates a private tag of another feature',
    code: 'HZ006',
    mutate: (ir) => {
      cart(ir).mutations.addItem!.invalidates.push({ tag: 'catalog.productTag', param: { literal: 'mug' } })
    },
  },
  {
    name: 'handler for a misspelled event',
    code: 'HZ007',
    mutate: (ir) => {
      const on = states(ir).error!.on
      on['cart.Dismis'] = on['cart.Dismiss']!
      delete on['cart.Dismiss']
    },
  },
  {
    name: 'when() with an unknown state',
    code: 'HZ007',
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
    code: 'HZ007',
    mutate: (ir) => {
      states(ir).checkingOut!.invoke!.done[0]!.navigate = {
        link: 'orderPlace',
        params: { literal: null },
        search: { literal: null },
      }
    },
  },
  {
    name: 'failure branch for an undeclared error',
    code: 'HZ007',
    mutate: (ir) => {
      const failed = states(ir).adding!.invoke!.failed
      failed.Timeout = failed.Unexpected!
    },
  },
  {
    name: 'export of a symbol that does not exist',
    code: 'HZ007',
    mutate: (ir) => {
      cart(ir).exports.events.push('Ghost')
    },
  },
  {
    name: 'assign to a misspelled context path',
    code: 'HZ008',
    mutate: (ir) => {
      states(ir).idle!.on['cart.AddItem']![0]!.assign[0]!.path = ['pendin']
    },
  },
  {
    name: 'guard reads a misspelled payload field',
    code: 'HZ008',
    mutate: (ir) => {
      const guard = states(ir).idle!.on['cart.AddItem']![0]!.guard as { left: { path: string[] } }
      guard.left.path = ['qtty']
    },
  },
  {
    name: 'done reads a misspelled result field',
    code: 'HZ008',
    mutate: (ir) => {
      const value = states(ir).checkingOut!.invoke!.done[0]!.assign[0]!.value as { path: string[] }
      value.path = ['orderID']
    },
  },
  {
    name: 'invoke input reads the event',
    code: 'HZ008',
    mutate: (ir) => {
      states(ir).adding!.invoke!.input = { ref: 'event', path: ['pending'] }
    },
  },
  {
    name: 'each keyed by a missing property',
    code: 'HZ008',
    mutate: (ir) => {
      const { node } = findNode(cart(ir), 'CartPanel', (n) => n.kind === 'each')
      ;(node as { key: string }).key = 'skuu'
    },
  },
  {
    name: 'text reads a misspelled item field',
    code: 'HZ008',
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
    code: 'HZ009',
    mutate: (ir) => {
      states(ir).idle!.on['cart.AddItem']!.reverse()
    },
  },
  {
    name: 'mutation invalidates a tag no query carries',
    code: 'HZ019',
    mutate: (ir) => {
      ir.features.catalog!.queries.listProducts!.tags = []
      ir.features.cart!.mutations.checkout!.invalidates.push({ tag: 'catalog.catalogTag', param: null })
    },
  },
  {
    name: 'user-scoped query cached across requests',
    code: 'HZ049',
    mutate: (ir) => {
      cart(ir).queries.getCart!.freshness = { kind: 'swr', seconds: 30 }
    },
  },
  {
    name: 'live query without tags',
    code: 'HZ050',
    mutate: (ir) => {
      const q = cart(ir).queries.getCart!
      q.freshness = { kind: 'live' }
      q.tags = []
    },
  },
  {
    name: 'page renders a view that does not exist',
    code: 'HZ007',
    mutate: (ir) => {
      ir.pages.home!.views.push('cart.Ghost')
    },
  },
  {
    name: 'misspelled enumerated attribute value',
    code: 'HZ031',
    mutate: (ir) => {
      const { node } = findNode(cart(ir), 'CartPanel', isButton('Checkout'))
      ;(node as ElementNode).attrs.type = { literal: 'buton' }
    },
  },
  {
    name: 'internal link written as a string',
    code: 'HZ032',
    mutate: (ir) => {
      const { node } = findNode(cart(ir), 'CartPanel', isButton('Checkout'))
      const button = node as ElementNode
      button.children.push({
        id: `${button.id}/9`,
        kind: 'el',
        tag: 'a',
        class: null,
        toggle: {},
        vars: {},
        attrs: { href: { literal: '/order/placed' } },
        on: {},
        children: [],
      })
    },
  },
  {
    name: 'state both handles and ignores an event',
    code: 'HZ034',
    mutate: (ir) => {
      states(ir).idle!.ignore.push('cart.AddItem')
    },
  },
  {
    name: 'search param without a default',
    code: 'HZ035',
    mutate: (ir) => {
      ir.routes.home!.search = { type: 'object', properties: { page: { type: 'integer' } } }
    },
  },
  {
    name: 'redirect that hides a page',
    code: 'HZ037',
    mutate: (ir) => {
      ir.http.redirects.push({
        from: '/products/:id',
        to: { literal: 'https://shop.example' },
        permanent: true,
      })
    },
  },
  {
    name: 'redirect that hides the German version of a page',
    code: 'HZ037',
    mutate: (ir) => {
      ir.site!.locales = ['en', 'de']
      ir.http.redirects.push({
        from: '/de/order/placed',
        to: { literal: 'https://shop.example' },
        permanent: true,
      })
    },
  },
  {
    name: 'page route that starts with a locale segment',
    code: 'HZ060',
    mutate: (ir) => {
      ir.site!.locales = ['en', 'de']
      ir.routes.orderPlaced!.path = '/de/order/placed'
    },
  },
  {
    name: 'header the framework derives',
    code: 'HZ038',
    mutate: (ir) => {
      ir.http.headers.push({ routes: 'all', set: { 'cache-control': 'no-store' } })
    },
  },
  {
    name: 'base path with a trailing slash',
    code: 'HZ039',
    mutate: (ir) => {
      ir.http.basePath = '/shop/'
    },
  },
  {
    name: 'a locale without its messages',
    code: 'HZ040',
    mutate: (ir) => {
      cart(ir).messages = { base: 'en', text: { en: { total: 'Total: {sum}' } } }
      ir.site!.locales = ['en', 'de']
    },
  },
  {
    name: 'a machine that stores a translated message',
    code: 'HZ041',
    mutate: (ir) => {
      cart(ir).messages = { base: 'en', text: { en: { oops: 'Oops' } } }
      states(ir).idle!.on['cart.RemoveItem']![0]!.assign.push({
        op: 'set',
        path: ['error'],
        value: { fn: '#msg:cart.oops', arg: { literal: null } },
      })
    },
  },
  {
    name: 'a locale tag that is not canonical',
    code: 'HZ042',
    mutate: (ir) => {
      ir.site!.locales = ['en', 'en_us']
    },
  },
  {
    name: 'a multi-segment route param typed as one string',
    code: 'HZ024',
    mutate: (ir) => {
      ir.routes.orderPlaced!.path = '/order/:rest+'
      ir.routes.orderPlaced!.params = {
        type: 'object',
        properties: { rest: { type: 'string' } },
        required: ['rest'],
      }
    },
  },
  {
    name: 'an offline page that renders per-request data',
    code: 'HZ043',
    mutate: (ir) => {
      ir.site!.offline = 'home'
    },
  },
  {
    name: 'state with no way out',
    code: 'HZ010',
    mutate: (ir) => {
      states(ir).error!.on = {}
      states(ir).error!.after = []
    },
  },
]

describe('A2 judgement codes', () => {
  it('HZ020 — user-scoped query without a project session has a location but no patch', () => {
    const ir = cartIR()
    ir.session = null
    const found = validate(ir, { sources: cartBuild().sources }).filter((d) => d.code === 'HZ020')
    expect(found.map((d) => d.location.pointer)).toEqual(['/features/cart/queries/getCart/scope'])
    expect(found[0]!.location.source?.file).toMatch(/examples\/cart\/.+\.ts$/)
    expect(found[0]!.fix?.patch).toBeNull()
  })
})

describe('ADR 0043 A endpoint codes', () => {
  it('HZ062 — a GET endpoint that invalidates is a warning with a patch to POST', async () => {
    const { buildProject } = await import('@hozu/core/ir')
    const notes = buildProject((await import('../../../examples/notes/hozu.config.ts')).default)
    const ir = structuredClone(notes.ir)
    ir.features.notes!.endpoints.notesApi!.invalidates = [{ tag: 'notes.notesTag', param: null }]
    const found = validate(ir, { sources: notes.sources }).filter((d) => d.code === 'HZ062')
    expect(found.map((d) => [d.location.pointer, d.severity])).toEqual([
      ['/features/notes/endpoints/notesApi/method', 'warning'],
    ])
    expect(found[0]!.location.source?.file).toMatch(/examples\/notes\/.+\.ts$/)
    const fixed = applyPatch(ir, found[0]!.fix!.patch!)
    expect(validate(fixed).filter((d) => d.code === 'HZ062')).toEqual([])
  })
})

describe('A2 rendering judgement codes', () => {
  it('HZ027 — DOM fields read outside an event handler', () => {
    const ir = cartIR()
    const { node } = findNode(cart(ir), 'CartPanel', (n) => n.kind === 'el' && n.tag === 'input')
    ;(node as ElementNode).attrs.value = { ref: 'dom', path: ['value'] }
    const found = validate(ir, { sources: cartBuild().sources }).filter((d) => d.code === 'HZ027')
    expect(found.map((d) => d.message)).toEqual(['ui.dom.value is read outside an event handler'])
    expect(found[0]!.fix?.patch).toBeNull()
  })

  it('HZ022 — a public cached query keyed by user data', () => {
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
    const found = validate(ir, { sources: cartBuild().sources }).filter((d) => d.code === 'HZ022')
    expect(found.map((d) => d.location.pointer)).toEqual([
      '/features/cart/views/CartPanel/root/children/1/ready/children/2/input',
    ])
    expect(found[0]!.location.source?.file).toMatch(/examples\/cart\/.+\.ts$/)
    expect(found[0]!.fix?.patch).toBeNull()
  })

  it('HZ023 — a page asserts cacheable but renders per-request data', () => {
    const ir = cartIR()
    ir.pages.home!.assert = 'cacheable'
    const found = validate(ir, { sources: cartBuild().sources }).filter((d) => d.code === 'HZ023')
    expect(found.map((d) => [d.location.pointer, d.message])).toEqual([
      ['/pages/home/assert', 'Page "home" asserts cacheable but derives cart.getCart → request'],
    ])
    expect(found[0]!.location.source?.file).toMatch(/examples\/cart\/hozu\.config\.ts$/)
    expect(found[0]!.fix?.patch).toBeNull()
  })
})

describe('A2 literal judgement codes', () => {
  it('HZ031 — a guard compares a number with a string; HZ032 — a link to no route', () => {
    const ir = cartIR()
    const guard = states(ir).idle!.on['cart.SetQuantity']![0]!.guard as {
      args: { right: { literal: unknown } }[]
    }
    guard.args[0]!.right = { literal: '1' }
    const { node } = findNode(cart(ir), 'CartPanel', isButton('Checkout'))
    ;(node as ElementNode).children.push({
      id: 'x',
      kind: 'el',
      tag: 'a',
      class: null,
      toggle: {},
      vars: {},
      attrs: { href: { literal: '/order/plcaed' } },
      on: {},
      children: [],
    })
    const found = validate(ir, { sources: cartBuild().sources }).filter(
      (d) => d.code === 'HZ031' || d.code === 'HZ032',
    )
    expect(found.map((d) => [d.code, d.message, d.cause])).toEqual([
      ['HZ031', '"1" is not a valid value for the compared value.', 'Expected number | null.'],
      [
        'HZ032',
        'No route matches the internal link "/order/plcaed". Did you mean "/order/placed"?',
        'Internal paths are typed references to a route, so a renamed or missing route is caught. Files use ui.asset.',
      ],
    ])
  })
})

describe('A2 route judgement codes', () => {
  it('HZ024 — path placeholders differ from the params schema', async () => {
    const { buildProject } = await import('@hozu/core/ir')
    const blog = buildProject((await import('../../../examples/blog/hozu.config.ts')).default)
    const ir = structuredClone(blog.ir)
    ir.routes.post!.path = '/posts/:id'
    const found = validate(ir, { sources: blog.sources }).filter((d) => d.code === 'HZ024')
    expect(found.map((d) => d.location.pointer)).toEqual(['/routes/post/params'])
    expect(found[0]!.location.source?.file).toMatch(/examples\/blog\/routes\.ts$/)
  })

  it('HZ024 — a view bound to another route; HZ025 — a parameterized page without entries', async () => {
    const { buildProject } = await import('@hozu/core/ir')
    const blog = buildProject((await import('../../../examples/blog/hozu.config.ts')).default)
    const ir = structuredClone(blog.ir)
    ir.pages.home!.views.push('posts.Article')
    ir.pages.post!.entries = null
    const found = validate(ir, { sources: blog.sources }).filter(
      (d) => d.code === 'HZ024' || d.code === 'HZ025',
    )
    expect(found.map((d) => [d.code, d.location.pointer, d.severity])).toEqual([
      ['HZ024', '/pages/home/views/2', 'error'],
      ['HZ025', '/pages/post/entries', 'warning'],
    ])
    expect(found[1]!.fix?.snippet).toContain('entries:')
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
      expect(d.location.pointer).toMatch(/^\/(features|pages|routes|http|site)\//)
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
