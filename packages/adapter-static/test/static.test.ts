import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { exportStatic } from '@hozu/adapter-static'
import { buildProject } from '@hozu/core/ir'
import { describe, expect, it } from 'vitest'
import project from '../../../examples/cart/hozu.config.ts'
import { createResolvers } from '../../../examples/cart/server.ts'

describe('static export', () => {
  it('writes cacheable pages and reports the rest', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'hozu-static-'))
    const result = await exportStatic({
      build: buildProject(project, { sources: false }),
      resolvers: createResolvers(),
      outDir,
    })
    expect(result.written).toEqual([
      join(outDir, 'order/placed/index.html'),
      join(outDir, 'robots.txt'),
      join(outDir, 'sitemap.xml'),
    ])
    expect(result.skipped).toEqual([
      { route: 'home', reason: 'per-request regions: cart.getCart' },
      { route: 'product', reason: 'per-request regions: cart.getCart' },
    ])
    const html = await readFile(join(outDir, 'order/placed/index.html'), 'utf8')
    expect(html).toContain('T-shirt')
    expect(html).not.toMatch(/<script(?! type="(application\/ld\+json|speculationrules)")/)
  })
})

describe('static export with params', () => {
  it('expands entries into one file per post', async () => {
    const { createResolvers: blogResolvers } = await import('../../../examples/blog/server.ts')
    const blog = (await import('../../../examples/blog/hozu.config.ts')).default
    const outDir = await mkdtemp(join(tmpdir(), 'hozu-blog-'))
    const result = await exportStatic({
      build: buildProject(blog, { sources: false }),
      resolvers: blogResolvers(),
      outDir,
    })
    expect(result.written.map((f) => f.slice(outDir.length))).toEqual([
      '/en/offline/index.html',
      '/zh-TW/offline/index.html',
      '/en/posts/hello-hozu/index.html',
      '/en/posts/islands-explained/index.html',
      '/zh-TW/posts/hello-hozu/index.html',
      '/zh-TW/posts/islands-explained/index.html',
      '/robots.txt',
      '/sitemap.xml',
      '/_hozu/a/2ea52ea9eec9e42a.jpg',
    ])
    expect(result.skipped).toEqual([
      { route: 'home', reason: 'per-request regions: saved.savedPosts, posts.listPosts' },
    ])
  })
})
