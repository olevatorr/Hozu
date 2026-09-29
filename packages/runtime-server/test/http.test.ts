import { feature, project, route, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { resolvers } from '@hozu/data'
import { createHandler } from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { validate } from '@hozu/validator'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const home = route({ path: '/', params: null, search: null })
const post = route({ path: '/posts/:slug', params: z.object({ slug: z.string().min(2) }), search: null })

const Home = ui.view({ render: () => ui.a({ href: ui.link(post, { slug: 'hello' }) }, ['Hello']) })
const Post = ui.view({ route: post, render: ({ params }) => ui.h1({}, [params.slug]) })

const head = (title: string) => ({
  render: () => ({
    title,
    description: title,
  }),
})

const site = project({
  schema: zodAdapter,
  site: { url: 'https://blog.example', name: 'Blog', lang: 'en' },
  routes: { home, post },
  pages: [
    ui.page(home, { views: [Home], head: head('Home') }),
    ui.page(post, { views: [Post], head: head('Post') }),
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
  features: [feature({ id: 'blog', intent: { summary: 'Posts' }, declarations: [{ Home, Post }] })],
})

const build = buildProject(site, { sources: false })
const handler = createHandler({ build, resolvers: resolvers(site, () => []) })
const get = (path: string) => handler.fetch(new Request(`https://blog.example${path}`))

describe('HTTP rules as data (ADR 0016)', () => {
  it('validates clean', () => {
    expect(build.diagnostics).toEqual([])
    expect(validate(build.ir, { bindings: build.bindings }).map((d) => d.code)).toEqual(['HZ025'])
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
    expect((await get('/shop/_hozu/fns.js')).status).toBe(200)
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
