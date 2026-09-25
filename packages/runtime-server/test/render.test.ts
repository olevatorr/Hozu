import { buildProject } from '@tenon/core/ir'
import { createDataRuntime, type DataRuntime } from '@tenon/data'
import type { PagePayload } from '@tenon/runtime-client'
import { renderPage, renderToString } from '@tenon/runtime-server'
import { describe, expect, it } from 'vitest'
import { createResolvers } from '../../../examples/cart/server.ts'
import project from '../../../examples/cart/tenon.config.ts'

const build = buildProject(project, { sources: false })
const session = { userId: 'ada' }
const payloadOf = (html: string) =>
  JSON.parse(
    /<script type="application\/json" id="tenon-payload">(.*?)<\/script>/.exec(html)![1]!,
  ) as PagePayload

describe('server rendering', () => {
  it('renders islands, reactive regions and a payload with only what islands need', async () => {
    const data = createDataRuntime({ build, resolvers: createResolvers() })
    const { html, tags, plan } = await renderToString({ build, data, route: 'home', session })
    expect(html).toContain('<h2 data-t="catalog.ProductGrid/0">Products</h2>')
    expect(html).toContain('<t-i data-i="0" style="display:contents"><!--cart.CartPanel/1-->')
    expect([...tags].sort()).toEqual(['cart.cartTag', 'catalog.catalogTag'])
    const payload = payloadOf(html)
    const item = 'cart.CartPanel/2/ready/0/item/1'
    expect(plan.islands).toEqual([
      'cart.CartPanel/1',
      item,
      'cart.CartPanel/3',
      'cart.CartPanel/4',
      'cart.CartPanel/5',
      'cart.CartPanel/6',
    ])
    expect(payload.islands.map((i) => i.node)).toEqual([
      'cart.CartPanel/1',
      item,
      item,
      'cart.CartPanel/3',
      'cart.CartPanel/4',
      'cart.CartPanel/5',
      'cart.CartPanel/6',
    ])
    expect(payload.islands[2]!.scope[1]).toEqual({ sku: 'tee', name: 'T-shirt', price: 25 })
    expect(payload.data.map(([k]) => k)).toEqual(['cart.getCart{}'])
    expect(Object.keys(payload.features)).toEqual(['cart'])
    expect(payload.fns).toBe('/_tenon/fns.js')
    expect(html.endsWith('<script type="module" src="/_tenon/client.js"></script></body></html>')).toBe(true)
  })

  it('machine-less pages contain no script at all', async () => {
    const data = createDataRuntime({ build, resolvers: createResolvers() })
    const { html } = await renderToString({ build, data, route: 'orderPlaced' })
    expect(html).not.toMatch(/<script(?! type="application\/ld\+json")/)
    expect(html).not.toContain('<t-i')
    expect(html).toContain('<meta name="robots" content="noindex">')
  })

  it('streams in order: the shell is flushed before per-request data resolves', async () => {
    const real = createDataRuntime({ build, resolvers: createResolvers() })
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => {
      release = r
    })
    const data: DataRuntime = {
      ...real,
      run: async (ref, input, s) =>
        ref === 'cart.getCart' ? gate.then(() => real.run(ref, input, s)) : real.run(ref, input, s),
    }
    const chunks = (await renderPage({ build, data, route: 'home', session })).chunks[Symbol.asyncIterator]()
    let before = ''
    for (;;) {
      const next = await Promise.race([
        chunks.next(),
        new Promise<null>((r) => setTimeout(() => r(null), 20)),
      ])
      if (!next) break
      before += (next as IteratorResult<string>).value
    }
    expect(before).toContain('T-shirt')
    expect(before).not.toContain('cart.CartPanel/1/ready')
    release()
    let rest = ''
    for (let n = await chunks.next(); !n.done; n = await chunks.next()) rest += n.value
    expect(rest).toContain('cart.CartPanel/1/ready')
  })
})
