import { buildProject } from '@tenon/core/ir'
import { createDataRuntime } from '@tenon/data'
import { matcher, pageEntries, renderToString, robotsTxt, sitemapXml } from '@tenon/runtime-server'
import { describe, expect, it } from 'vitest'
import { createResolvers } from '../../../examples/blog/server.ts'
import project from '../../../examples/blog/tenon.config.ts'

const build = buildProject(project, { sources: false })
const data = () => createDataRuntime({ build, resolvers: createResolvers() })

describe('route params and head metadata', () => {
  it('matches parameterized routes and validates params', () => {
    const match = matcher(build)
    expect(match('/')).toEqual({ route: 'home', params: null })
    expect(match('/posts/hello%20tenon')).toEqual({ route: 'post', params: { slug: 'hello tenon' } })
    expect(match('/posts/')).toBeNull()
    expect(match('/posts/a/b')).toBeNull()
  })

  it('derives title, description, canonical, Open Graph and JSON-LD from the head query', async () => {
    const { html, status, path } = await renderToString({
      build,
      data: data(),
      route: 'post',
      params: { slug: 'hello-tenon' },
    })
    expect([status, path]).toEqual([200, '/en/posts/hello-tenon'])
    for (const tag of [
      '<html lang="en">',
      '<title>Hello, Tenon</title>',
      '<meta name="description" content="Why an AI-first framework makes invalid programs hard to write.">',
      '<link rel="canonical" href="https://blog.tenon.dev/en/posts/hello-tenon">',
      '<meta property="og:type" content="article">',
      '<meta property="og:url" content="https://blog.tenon.dev/en/posts/hello-tenon">',
      '<meta property="article:published_time" content="2026-09-01">',
    ])
      expect(html).toContain(tag)
    const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/.exec(html)![1]!)
    expect(ld).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: 'Hello, Tenon',
      image:
        'https://blog.tenon.dev/_tenon/og.png?title=Hello%2C+Tenon&subtitle=Why+an+AI-first+framework+makes+invalid+programs+hard+to+write.',
      description: 'Why an AI-first framework makes invalid programs hard to write.',
      url: 'https://blog.tenon.dev/en/posts/hello-tenon',
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
      '/en',
      '/zh-TW',
      '/en/offline',
      '/zh-TW/offline',
      '/en/posts/hello-tenon',
      '/en/posts/islands-explained',
      '/zh-TW/posts/hello-tenon',
      '/zh-TW/posts/islands-explained',
    ])
    expect(sitemapXml(build, entries)).toContain(
      '<loc>https://blog.tenon.dev/zh-TW/posts/islands-explained</loc>',
    )
    expect(robotsTxt(build)).toBe(
      'User-agent: *\nAllow: /\nDisallow: /en/offline\nDisallow: /zh-TW/offline\nSitemap: https://blog.tenon.dev/sitemap.xml\n',
    )
  })
})
