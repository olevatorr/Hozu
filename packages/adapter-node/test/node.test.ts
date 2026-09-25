import { afterEach, describe, expect, it } from 'vitest'
import { start } from './support.ts'

let close: (() => Promise<void>) | null = null
afterEach(async () => {
  await close?.()
  close = null
})

describe('node adapter', () => {
  it('ISR: miss, hit, stale-while-regenerating, and tag revalidation', async () => {
    let time = 0
    const app = start({ now: () => time })
    close = app.close
    const cache = async () => (await app.call('GET', '/order/placed')).headers['x-tenon-cache']
    expect(await cache()).toBe('miss')
    expect(await cache()).toBe('hit')
    time += 60_000
    expect(await cache()).toBe('stale')
    await new Promise((r) => setTimeout(r, 10))
    expect(await cache()).toBe('hit')
    expect(app.server.revalidate(['catalog.catalogTag'])).toBe(1)
    expect(await cache()).toBe('miss')
  })

  it('streams per-request pages and keeps users apart', async () => {
    const app = start()
    close = app.close
    await app.call(
      'POST',
      '/_tenon/effect',
      { effect: 'cart.addItem', input: { sku: 'mug', qty: 1 }, keys: [] },
      'ada',
    )
    const ada = await app.call('GET', '/', undefined, 'ada')
    const bob = await app.call('GET', '/', undefined, 'bob')
    expect(ada.headers['x-tenon-cache']).toBe('bypass')
    expect(ada.headers['transfer-encoding']).toBe('chunked')
    expect(ada.body).toContain('Total: $12')
    expect(bob.body).toContain('Total: $0')
  })

  it('effects return the result plus server-pushed data for invalidated payload keys', async () => {
    const app = start()
    close = app.close
    const res = await app.call('POST', '/_tenon/effect', {
      effect: 'cart.addItem',
      input: { sku: 'mug', qty: 2 },
      keys: ['cart.getCart{}'],
    })
    const body = JSON.parse(res.body)
    expect(body.result).toMatchObject({ ok: true })
    expect(body.refreshed).toEqual([
      ['cart.getCart{}', { ok: true, value: { items: [{ sku: 'mug', name: 'Mug', price: 12, qty: 2 }] } }],
    ])
    const failed = JSON.parse(
      (
        await app.call('POST', '/_tenon/effect', {
          effect: 'cart.addItem',
          input: { sku: 'tee', qty: 1 },
          keys: ['cart.getCart{}'],
        })
      ).body,
    )
    expect(failed).toEqual({
      result: { ok: false, error: 'OutOfStock', data: { sku: 'tee', available: 0 } },
      refreshed: [],
    })
  })

  it('serves the client bundle, the fns module and 404s', async () => {
    const app = start()
    close = app.close
    expect((await app.call('GET', '/_tenon/client.js')).headers['content-type']).toBe('text/javascript')
    expect((await app.call('GET', '/_tenon/fns.js')).body).toContain('"cart.cartTotal": (items) =>')
    expect((await app.call('GET', '/nope')).status).toBe(404)
  })
})

describe('crawler endpoints', () => {
  it('answers HEAD without a body, rejects other methods, and serves robots/sitemap', async () => {
    const app = start()
    close = app.close
    const head = await app.call('HEAD', '/order/placed')
    expect([head.status, head.body, head.headers['content-type']]).toEqual([
      200,
      '',
      'text/html; charset=utf-8',
    ])
    expect((await app.call('PUT', '/')).status).toBe(405)
    expect((await app.call('GET', '/robots.txt')).body).toBe(
      'User-agent: *\nAllow: /\nDisallow: /order/placed\nSitemap: https://cart.tenon.dev/sitemap.xml\n',
    )
    expect((await app.call('GET', '/sitemap.xml')).body).toContain(
      '<url><loc>https://cart.tenon.dev/</loc></url></urlset>',
    )
  })
})
