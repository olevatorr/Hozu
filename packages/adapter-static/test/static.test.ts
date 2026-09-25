import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { exportStatic } from '@tenon/adapter-static'
import { buildProject } from '@tenon/core/ir'
import { describe, expect, it } from 'vitest'
import { createResolvers } from '../../../examples/cart/server.ts'
import project from '../../../examples/cart/tenon.config.ts'

describe('static export', () => {
  it('writes cacheable pages and reports the rest', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'tenon-static-'))
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
    expect(result.skipped).toEqual([{ route: 'home', reason: 'per-request regions: cart.getCart' }])
    const html = await readFile(join(outDir, 'order/placed/index.html'), 'utf8')
    expect(html).toContain('T-shirt')
    expect(html).not.toMatch(/<script(?! type="application\/ld\+json")/)
  })
})

describe('static export with params', () => {
  it('expands entries into one file per post', async () => {
    const { createResolvers: blogResolvers } = await import('../../../examples/blog/server.ts')
    const blog = (await import('../../../examples/blog/tenon.config.ts')).default
    const outDir = await mkdtemp(join(tmpdir(), 'tenon-blog-'))
    const result = await exportStatic({
      build: buildProject(blog, { sources: false }),
      resolvers: blogResolvers(),
      outDir,
    })
    expect(result.written.map((f) => f.slice(outDir.length))).toEqual([
      '/posts/hello-tenon/index.html',
      '/posts/islands-explained/index.html',
      '/robots.txt',
      '/sitemap.xml',
    ])
    expect(result.skipped).toEqual([
      { route: 'home', reason: 'per-request regions: saved.savedPosts, posts.listPosts' },
    ])
  })
})
