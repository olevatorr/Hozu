import { buildProject } from '@hozu/core/ir'
import { createDataRuntime, type DataRuntime, type RequestData } from '@hozu/data'
import type { PagePayload } from '@hozu/runtime-client'
import { appOptionsOf, renderPage, renderToString } from '@hozu/runtime-server'
import { describe, expect, it } from 'vitest'
import createResolversApp from '../../../examples/cart/app.ts'
import project from '../../../examples/cart/hozu.config.ts'

const createResolvers = () => appOptionsOf(createResolversApp)!.resolvers

const build = buildProject(project, { sources: false })
const session = { userId: 'ada' }
const payloadOf = (html: string) =>
  JSON.parse(
    /<script type="application\/json" id="hozu-payload">(.*?)<\/script>/.exec(html)![1]!,
  ) as PagePayload
const expand = (p: PagePayload) =>
  p.islands.flatMap(([n, lead, ...tails]) =>
    tails.map((tail) => ({ node: p.ids[n]!, scope: [...Array(lead).fill(null), ...tail] })),
  )

describe('server rendering', () => {
  it('preloads no script on a page without islands', async () => {
    const data = createDataRuntime({ build, resolvers: createResolvers() })
    const { html, plan } = await renderToString({ build, data, route: 'orderPlaced', session })
    expect(plan.islands).toEqual([])
    expect(html).not.toContain('modulepreload')
    expect(html).not.toContain('/_hozu/client.js')
  })

  it('renders islands, reactive regions and a payload with only what islands need', async () => {
    const data = createDataRuntime({ build, resolvers: createResolvers() })
    const { html, tags, plan } = await renderToString({ build, data, route: 'home', session })
    expect(html).toContain('<section class="grid gap-4"><h2>Products</h2>')
    expect(html).toContain('<h2>Cart</h2><!--i--><!--[--><div><ul class="divide-y"><!--[-->')
    expect(html).toContain('<li>Mug<!--i--><!--[--><button type="button">Add</button><!--]--></li>')
    expect(html).not.toContain('data-t=')
    expect([...tags].sort()).toEqual(['cart.cartTag', 'catalog.catalogTag'])
    const payload = payloadOf(html)
    const item = 'cart.CartPanel/3/ready/0/item/1'
    expect(plan.islands).toEqual([
      'cart.CartPanel/1',
      'cart.CartPanel/2',
      item,
      'cart.CartPanel/4',
      'cart.CartPanel/5',
      'cart.CartPanel/6',
      'cart.CartPanel/7',
    ])
    expect(expand(payload).map((i) => i.node)).toEqual([
      'cart.CartPanel/1',
      'cart.CartPanel/2',
      item,
      item,
      'cart.CartPanel/4',
      'cart.CartPanel/5',
      'cart.CartPanel/6',
      'cart.CartPanel/7',
    ])
    expect(payload.ids.filter((id) => id === item)).toHaveLength(1)
    expect(expand(payload)[3]!.scope[1]).toEqual({ sku: 'tee' })
    expect(payload.islands.filter(([n]) => payload.ids[n] === item)).toHaveLength(1)
    expect(payload.data.map(([k]) => k)).toEqual(['cart.getCart{}'])
    expect(Object.keys(payload.features)).toEqual(['cart'])
    expect(payload.fns).toBe('/_hozu/fns.js')
    const head = html.slice(0, html.indexOf('</head>'))
    expect(head).toContain('<link rel="modulepreload" href="/_hozu/client.js">')
    expect(head).toContain('<link rel="modulepreload" href="/_hozu/fns.js">')
    expect(html.endsWith('<script type="module" src="/_hozu/client.js"></script></body></html>')).toBe(true)
  })

  it('machine-less pages contain no script at all', async () => {
    const data = createDataRuntime({ build, resolvers: createResolvers() })
    const { html } = await renderToString({ build, data, route: 'orderPlaced' })
    expect(html).not.toMatch(/<script(?! type="(application\/ld\+json|speculationrules)")/)
    expect(html).toContain(
      '<script type="speculationrules">{"prerender":[{"where":{"and":[{"href_matches":"/*"}',
    )
    expect(html).not.toContain('<!--i-->')
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
      scope: (who, options) => {
        const request = real.scope(who, options)
        const run: RequestData['run'] = (ref, input, files) =>
          ref === 'cart.getCart'
            ? gate.then(() => request.run(ref, input, files))
            : request.run(ref, input, files)
        return new Proxy(request, { get: (t, k) => (k === 'run' ? run : Reflect.get(t, k)) })
      },
    }
    const chunks = (await renderPage({ build, data, route: 'home', session })).chunks[Symbol.asyncIterator]()
    let before = ''
    for (;;) {
      const next = await Promise.race([
        chunks.next(),
        new Promise<null>((r) => setTimeout(() => r(null), 20)),
      ])
      if (!next || next.done) break
      before += next.value
    }
    expect(before).toContain('T-shirt')
    expect(before).not.toContain('cart.CartPanel/1/ready')
    release()
    let rest = ''
    for (let n = await chunks.next(); !n.done; n = await chunks.next()) rest += n.value
    expect(rest).toContain('cart.CartPanel/1/ready')
  })

  it('renders views without boundary comments and sends no soft navigation table (ADR 0043 I)', async () => {
    const data = createDataRuntime({ build, resolvers: createResolvers() })
    const home = (await renderToString({ build, data, route: 'home', session })).html
    expect(home).toContain('<body><section')
    expect(home).not.toContain('<!--v:')
    expect(payloadOf(home)).not.toHaveProperty('soft')
  })
})

describe('client components that only appear after client-side state changes', () => {
  it('are listed in the payload with the island that can render them', async () => {
    const stations = buildProject((await import('../../../examples/stations/hozu.config.ts')).default, {
      sources: false,
    })
    const { default: stationResolversApp } = await import('../../../examples/stations/app.ts')
    const stationResolvers = () => appOptionsOf(stationResolversApp)!.resolvers
    const { html } = await renderToString({
      build: stations,
      data: createDataRuntime({ build: stations, resolvers: stationResolvers() }),
      route: 'home',
      search: { q: '', district: '' },
      assets: {
        client: '/c.js',
        fns: null,
        styles: null,
        preload: [],
        components: Object.fromEntries(
          ['StationMap', 'DistrictChart', 'Counter', 'FadeIn', 'Globe'].map((c) => [
            `stations.${c}`,
            `/c/${c}.js`,
          ]),
        ),
      },
    })
    expect(html.slice(0, html.indexOf('id="hozu-payload"'))).not.toContain('Station details')
    expect(Object.keys(payloadOf(html).components).sort()).toEqual([
      'stations.Counter',
      'stations.DistrictChart',
      'stations.FadeIn',
      'stations.Globe',
      'stations.StationMap',
    ])
  })
})
