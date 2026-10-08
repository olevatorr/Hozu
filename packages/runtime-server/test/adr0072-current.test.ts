import { feature, project, route, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { resolvers } from '@hozu/data'
import { createHandler } from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { expect, it } from 'vitest'
import { z } from 'zod'

const shop = route({
  path: '/shop/:category?',
  params: z.object({ category: z.string().nullable() }),
  search: z.object({ sort: z.enum(['featured', 'new']).default('featured') }),
})
const product = route({ path: '/products/:slug', params: z.object({ slug: z.string() }), search: null })
const Header = ui.view({
  render: ({ current }) =>
    ui.nav({}, [
      ...['apparel', 'kitchen'].map((c) =>
        ui.a(
          {
            href: ui.link(shop, { category: c }),
            'aria-current': current(shop, { category: c }),
            class: 'p-1',
          },
          [c],
        ),
      ),
      ui.a({ href: ui.link(shop, { category: null }), 'aria-current': current(shop) || current(product) }, [
        'Shop',
      ]),
    ]),
})
const Body = ui.view({ route: product, render: ({ params }) => ui.p({}, [params.slug]) })
const app = project({
  schema: zodAdapter,
  site: { url: 'https://shop.example', name: 'Shop', lang: 'en' },
  routes: { shop, product },
  pages: [
    ui.page(shop, { views: [Header], head: { render: () => ({ title: 'Shop' }) } }),
    ui.page(product, { views: [Header, Body], head: { render: () => ({ title: 'Product' }) } }),
  ],
  features: [feature({ id: 's', intent: { summary: 'shop' }, declarations: [{ Header, Body }] })],
})
const build = buildProject(app, { sources: false })
const handler = createHandler({ build, resolvers: resolvers(app, () => []) })
const marks = async (path: string) => {
  const html = await (await handler.fetch(new Request(`https://shop.example${path}`))).text()
  return [...html.matchAll(/<a\b([^>]*)>/g)].map(
    (m) => `${/href="([^"]+)"/.exec(m[1]!)?.[1]}=${/aria-current="(\w+)"/.exec(m[1]!)?.[1] ?? '-'}`,
  )
}

it('current(route, params) compares the given params with the page and ignores search (ADR 0072 E2)', async () => {
  expect(build.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
  expect(await marks('/shop/apparel?sort=new')).toEqual([
    '/shop/apparel=true',
    '/shop/kitchen=-',
    '/shop=true',
  ])
  expect(await marks('/shop/apparel')).toEqual(['/shop/apparel=page', '/shop/kitchen=-', '/shop=true'])
  expect(await marks('/products/mug')).toEqual(['/shop/apparel=-', '/shop/kitchen=-', '/shop=true'])
})

it('a param the route does not have is HZ007', () => {
  const Bad = ui.view({
    render: ({ current }) =>
      ui.a(
        { href: ui.link(product, { slug: 'x' }), 'aria-current': current(product, { id: 'x' } as never) },
        ['x'],
      ),
  })
  const b = buildProject(
    project({
      schema: zodAdapter,
      routes: { product },
      pages: [ui.page(product, { views: [Bad], head: { render: () => ({ title: 'x' }) } })],
      features: [feature({ id: 'b', intent: { summary: 'bad' }, declarations: [{ Bad }] })],
    }),
    { sources: false },
  )
  expect(b.diagnostics.find((d) => d.code === 'HZ007')?.message).toBe(
    'current(route, params) names "id", which the route has no param for',
  )
})
