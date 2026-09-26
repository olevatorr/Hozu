import { feature, project, route, ui } from '@tenon/core'
import { buildProject } from '@tenon/core/ir'
import { resolvers } from '@tenon/data'
import { createHandler } from '@tenon/runtime-server'
import { zodAdapter } from '@tenon/schema-zod'
import { validate } from '@tenon/validator'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const home = route({ path: '/', params: null, search: null })
const post = route({ path: '/posts/:slug', params: z.object({ slug: z.string().min(2) }), search: null })

const Home = ui.view({
  machine: null,
  route: null,
  render: () => ui.a({ href: ui.link(post, { slug: 'hello' }) }, ['Hello']),
})
const Post = ui.view({ machine: null, route: post, render: ({ params }) => ui.h1({}, [params.slug]) })

const head = (title: string) => ({
  redirects: null,
  query: null,
  input: null,
  render: () => ({
    title,
    description: title,
    type: 'website' as const,
    image: null,
    published: null,
    noindex: false,
  }),
})

const site = project({
  schema: zodAdapter,
  styles: null,
  notFound: null,
  error: null,
  session: null,
  site: {
    url: 'https://blog.example',
    name: 'Blog',
    locales: null,
    lang: 'en',
    icon: null,
    themeColor: null,
  },
  routes: { home, post },
  pages: [
    ui.page(home, { views: [Home], assert: null, head: head('Home'), entries: null }),
    ui.page(post, { views: [Post], assert: null, head: head('Post'), entries: null }),
  ],
  http: {
    basePath: '/shop',
    trailingSlash: 'always',
    redirects: {
      '/blog/:slug': { to: (p) => ui.link(post, { slug: p.slug }), permanent: true },
      '/docs': { to: 'https://docs.example.com', permanent: false },
    },
    headers: [
      { routes: 'all', set: { 'permissions-policy': 'camera=()' } },
      { routes: [post], set: { 'x-robots-tag': 'noarchive' } },
    ],
  },
  features: [
    feature({
      id: 'blog',
      styles: [],
      messages: null,
      widgets: {},
      intent: { summary: 'Posts', invariants: [] },
      imports: [],
      tags: {},
      events: {},
      queries: {},
      mutations: {},
      fns: {},
      machine: null,
      views: { Home, Post },
      contracts: {},
      exports: { events: [], queries: [], mutations: [], tags: [], fns: [], views: [] },
    }),
  ],
})

const build = buildProject(site, { sources: false })
const handler = createHandler({ build, resolvers: resolvers(site, () => []) })
const get = (path: string) => handler.fetch(new Request(`https://blog.example${path}`))

describe('HTTP rules as data (ADR 0016)', () => {
  it('validates clean', () => {
    expect(build.diagnostics).toEqual([])
    expect(validate(build.ir, { bindings: build.bindings }).map((d) => d.code)).toEqual(['TN025'])
  })

  it('serves pages under the base path in their one canonical form', async () => {
    const page = await get('/shop/')
    expect(page.status).toBe(200)
    const html = await page.text()
    expect(html).toContain('<a href="/shop/posts/hello/">Hello</a>')
    expect((await get('/shop/posts/hello/')).status).toBe(200)
    for (const [from, to] of [
      ['/shop', '/shop/'],
      ['/shop/posts/hello', '/shop/posts/hello/'],
      ['/shop/posts/hello?x=1', '/shop/posts/hello/?x=1'],
    ])
      expect([(await get(from!)).status, (await get(from!)).headers.get('location')]).toEqual([308, to])
    expect((await get('/posts/hello/')).status).toBe(404)
    expect((await get('/shopping')).status).toBe(404)
    expect((await get('/shop/_tenon/fns.js')).status).toBe(200)
  })

  it('redirects typed internal targets and external URLs, carrying the query string', async () => {
    const moved = await get('/shop/blog/hello?ref=feed')
    expect([moved.status, moved.headers.get('location')]).toEqual([308, '/shop/posts/hello/?ref=feed'])
    const docs = await get('/shop/docs')
    expect([docs.status, docs.headers.get('location')]).toEqual([307, 'https://docs.example.com'])
    expect((await get('/shop/blog/x')).status).toBe(404)
  })

  it('adds declared headers to the pages they name, after the framework-owned ones', async () => {
    const home = await get('/shop/')
    expect(home.headers.get('permissions-policy')).toBe('camera=()')
    expect(home.headers.get('x-robots-tag')).toBeNull()
    const one = await get('/shop/posts/hello/')
    expect(one.headers.get('x-robots-tag')).toBe('noarchive')
    expect(one.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(await one.text()).toContain('<link rel="canonical" href="https://blog.example/shop/posts/hello/">')
  })
})
