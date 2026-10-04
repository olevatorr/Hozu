import { feature, project, route, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { createDataRuntime, resolvers } from '@hozu/data'
import {
  appOptionsOf,
  createHandler,
  matcher,
  pageEntries,
  renderToString,
  robotsTxt,
  sitemapXml,
} from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { validate } from '@hozu/validator'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import createResolversApp from '../../../examples/blog/app.ts'
import blog from '../../../examples/blog/hozu.config.ts'

const createResolvers = () => appOptionsOf(createResolversApp)!.resolvers

const build = buildProject(blog, { sources: false })
const data = () => createDataRuntime({ build, resolvers: createResolvers() })

describe('route params and head metadata', () => {
  it('matches parameterized routes and validates params', () => {
    const match = matcher(build)
    expect(match('/')).toEqual({ route: 'home', params: null })
    expect(match('/posts/hello%20hozu')).toEqual({ route: 'post', params: { slug: 'hello hozu' } })
    expect(match('/posts/')).toBeNull()
    expect(match('/posts/a/b')).toBeNull()
  })

  it('derives title, description, canonical, Open Graph and JSON-LD from the head query', async () => {
    const { html, status, path } = await renderToString({
      build,
      data: data(),
      route: 'post',
      params: { slug: 'hello-hozu' },
    })
    expect([status, path]).toEqual([200, '/posts/hello-hozu'])
    for (const tag of [
      '<html lang="en">',
      '<title>Hello, Hozu</title>',
      '<meta name="description" content="Why an AI-first framework makes invalid programs hard to write.">',
      '<link rel="canonical" href="https://blog.hozu.dev/posts/hello-hozu">',
      '<meta property="og:type" content="article">',
      '<meta property="og:url" content="https://blog.hozu.dev/posts/hello-hozu">',
      '<meta property="article:published_time" content="2026-09-01">',
      '<meta property="og:image:width" content="1200">',
      '<meta property="og:image:height" content="630">',
      '<meta property="og:image:alt" content="Hello, Hozu">',
      '<meta name="twitter:card" content="summary_large_image">',
    ])
      expect(html).toContain(tag)
    const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/.exec(html)![1]!)
    expect(ld).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: 'Hello, Hozu',
      image:
        'https://blog.hozu.dev/_hozu/og.png?title=Hello%2C+Hozu&subtitle=Why+an+AI-first+framework+makes+invalid+programs+hard+to+write.',
      description: 'Why an AI-first framework makes invalid programs hard to write.',
      url: 'https://blog.hozu.dev/posts/hello-hozu',
      datePublished: '2026-09-01',
    })
  })

  it('a declared head-query error becomes a noindex 404', async () => {
    const { html, status } = await renderToString({
      build,
      data: data(),
      route: 'post',
      params: { slug: 'nope' },
    })
    expect(status).toBe(404)
    expect(html).toContain('<meta name="robots" content="noindex">')
    expect(html).not.toContain('rel="canonical"')
    expect(html).toContain('Post not found')
  })

  it('expands entries into the sitemap and writes robots.txt', async () => {
    const entries = await pageEntries(build, data())
    expect(entries.map((e) => e.path)).toEqual([
      '/',
      '/zh-TW',
      '/offline',
      '/zh-TW/offline',
      '/posts/hello-hozu',
      '/posts/islands-explained',
      '/zh-TW/posts/hello-hozu',
      '/zh-TW/posts/islands-explained',
    ])
    expect(sitemapXml(build, entries)).toContain(
      '<url><loc>https://blog.hozu.dev/zh-TW/posts/islands-explained</loc><lastmod>2026-09-15</lastmod>' +
        '<xhtml:link rel="alternate" hreflang="en" href="https://blog.hozu.dev/posts/islands-explained"/>' +
        '<xhtml:link rel="alternate" hreflang="zh-TW" href="https://blog.hozu.dev/zh-TW/posts/islands-explained"/>' +
        '<xhtml:link rel="alternate" hreflang="x-default" href="https://blog.hozu.dev/posts/islands-explained"/></url>',
    )
    expect(sitemapXml(build, entries)).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"')
    expect(robotsTxt(build)).toBe(
      'User-agent: *\nAllow: /\nDisallow: /offline\nDisallow: /zh-TW/offline\nSitemap: https://blog.hozu.dev/sitemap.xml\n',
    )
  })
})

describe('share cards from the image file (ADR 0057 A2)', () => {
  const card = async (file: string) => {
    const home = route({ path: '/', params: null, search: null })
    const View = ui.view({ render: () => ui.p({}, ['hi']) })
    const app = project({
      schema: zodAdapter,
      site: { url: 'https://example.org', name: 'Example', lang: 'en' },
      routes: { home },
      pages: [
        ui.page(home, {
          views: [View],
          head: { render: () => ({ title: 'Home', image: ui.asset(new URL(file, import.meta.url)) }) },
        }),
      ],
      features: [feature({ id: 'f', intent: { summary: 'share card' }, declarations: [{ View }] })],
    })
    const b = buildProject(app, { sources: false })
    const { html } = await renderToString({
      build: b,
      data: createDataRuntime({ build: b, resolvers: resolvers(app, () => []) }),
      route: 'home',
    })
    return (html.match(/<meta (?:property="og:image:[a-z]+"|name="twitter:card")[^>]*>/g) ?? []).join('')
  }

  it('a large image gets its size and the large card; a small one the small card', async () => {
    expect(await card('../../../site/assets/og-home.png')).toBe(
      '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Home"><meta name="twitter:card" content="summary_large_image">',
    )
    expect(await card('../../../site/assets/icon-256.png')).toBe(
      '<meta property="og:image:width" content="256"><meta property="og:image:height" content="256"><meta property="og:image:alt" content="Home"><meta name="twitter:card" content="summary">',
    )
  })
})

describe('site.url from the environment (ADR 0057 A2)', () => {
  const make = (declared: boolean) => {
    const home = route({ path: '/', params: null, search: null })
    const View = ui.view({ render: () => ui.p({}, ['hi']) })
    return project({
      schema: zodAdapter,
      site: { url: { env: 'SITE_URL' }, name: 'Example', lang: 'en' },
      ...(declared ? { env: { public: z.object({ SITE_URL: z.string().url() }) } } : {}),
      routes: { home },
      pages: [ui.page(home, { views: [View], head: { render: () => ({ title: 'Home' }) } })],
      features: [feature({ id: 'f', intent: { summary: 'site url' }, declarations: [{ View }] })],
    })
  }

  it('an undeclared variable is HZ085', () => {
    const b = buildProject(make(false), { sources: false })
    expect(validate(b.ir).map((d) => [d.code, d.message])).toContainEqual([
      'HZ085',
      'site.url reads SITE_URL, which is not declared in env.public or env.server',
    ])
    expect(validate(buildProject(make(true), { sources: false }).ir).map((d) => d.code)).not.toContain(
      'HZ085',
    )
  })

  it('the handler refuses to start without an origin, and canonical URLs use the one set', async () => {
    const app = make(true)
    const b = buildProject(app, { sources: false })
    const handler = (env: Record<string, string>) =>
      createHandler({ build: b, resolvers: resolvers(app, () => []), env })
    expect(() => handler({})).toThrow('Invalid public environment: SITE_URL')
    expect(() => handler({ SITE_URL: 'https://staging.example.org/blog' })).toThrow(
      'must be set to an origin',
    )
    const html = await (
      await handler({ SITE_URL: 'https://staging.example.org/' }).fetch(new Request('http://x/'))
    ).text()
    expect(html).toContain('<link rel="canonical" href="https://staging.example.org/">')
  })
})
