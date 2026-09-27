import { access, mkdtemp, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { exportStatic } from '@hozu/adapter-static'
import { buildProject } from '@hozu/core/ir'
import { describe, expect, it } from 'vitest'
import project from '../../../examples/cart/hozu.config.ts'
import { createResolvers } from '../../../examples/cart/server.ts'

async function missingFiles(outDir: string) {
  const missing: string[] = []
  for (const file of await readdir(outDir, { recursive: true })) {
    if (!file.endsWith('.html')) continue
    const html = await readFile(join(outDir, file), 'utf8')
    for (const [, url] of html.matchAll(/(?:href|src)="(\/[^"#?]*\.[a-z0-9]+)["#?]/gi))
      await access(join(outDir, url!)).catch(() => missing.push(`${file} → ${url}`))
  }
  return missing
}

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
      join(outDir, 'manifest.webmanifest'),
    ])
    expect(result.skipped).toEqual([
      { route: 'home', reason: 'per-request regions: cart.getCart' },
      { route: 'product', reason: 'per-request regions: cart.getCart' },
    ])
    const html = await readFile(join(outDir, 'order/placed/index.html'), 'utf8')
    expect(html).toContain('T-shirt')
    expect(html).not.toMatch(/<script(?! type="(application\/ld\+json|speculationrules)")/)
    expect(await missingFiles(outDir)).toEqual([])
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
      '/manifest.webmanifest',
      '/sw.js',
      '/_hozu/sw-register.js',
    ])
    expect(result.skipped).toEqual([
      { route: 'home', reason: 'per-request regions: saved.savedPosts, posts.listPosts' },
    ])
    expect(await missingFiles(outDir)).toEqual([])
  })
})

describe('static export of the official site', () => {
  it('links only files it wrote, and its share image is an asset', async () => {
    const site = (await import('../../../site/hozu.config.ts')).default
    const { createResolvers: siteResolvers } = await import('../../../site/server.ts')
    const outDir = await mkdtemp(join(tmpdir(), 'hozu-site-'))
    const result = await exportStatic({
      build: buildProject(site, { sources: false }),
      resolvers: siteResolvers(),
      outDir,
    })
    expect(result.skipped).toEqual([])
    expect(await missingFiles(outDir)).toEqual([])
    const html = await readFile(join(outDir, 'index.html'), 'utf8')
    const image =
      /<meta property="og:image" content="https:\/\/hozu\.org(\/_hozu\/a\/[0-9a-f]{16}\.png)">/.exec(html)
    expect(image).not.toBeNull()
    await access(join(outDir, image![1]!))
  })
})

describe('static export of conditional islands (ADR 0036)', () => {
  it('writes the client runtime only when an exported page runs it', async () => {
    const { conditional, conditionalResolvers } = await import(
      '../../runtime-server/test/support/conditional.ts'
    )
    const build = buildProject(conditional, { sources: false })
    const files = async (withCode: boolean) => {
      const outDir = await mkdtemp(join(tmpdir(), 'hozu-conditional-'))
      const result = await exportStatic({ build, resolvers: conditionalResolvers(withCode), outDir })
      expect(await missingFiles(outDir)).toEqual([])
      return result.written.map((f) => f.slice(outDir.length))
    }
    expect(await files(true)).toContain('/_hozu/client.js')
    const plain = await files(false)
    expect(plain).toContain('/docs/code/index.html')
    expect(plain.filter((f) => f.startsWith('/_hozu/'))).toEqual([])
  })
})
