import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createServer } from '@tenonkit/adapter-node'
import { feature, project, route, ui } from '@tenonkit/core'
import { buildProject, type Manifest } from '@tenonkit/core/ir'
import { resolvers } from '@tenonkit/data'
import { optimizeImages } from '@tenonkit/image'
import { createHandler } from '@tenonkit/runtime-server'
import { zodAdapter } from '@tenonkit/schema-zod'
import { chromium } from 'playwright-core'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'tenon-image-'))
writeFileSync(
  join(dir, 'hero.png'),
  await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#2255aa' } })
    .png()
    .toBuffer(),
)
writeFileSync(join(dir, 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"></svg>')

const home = route({ path: '/', params: null, search: null })
const Home = ui.view({
  render: () =>
    ui.main({}, [
      ui.img({ src: ui.asset(pathToFileURL(join(dir, 'hero.png'))), alt: 'Hero', width: 1000, height: 500 }),
      ui.img({ src: ui.asset(pathToFileURL(join(dir, 'logo.svg'))), alt: 'Logo', width: 40, height: 40 }),
    ]),
})
const site = project({
  schema: zodAdapter,
  routes: { home },
  pages: [
    ui.page(home, { views: [Home], head: { render: () => ({ title: 'Images', description: 'Images' }) } }),
  ],
  features: [feature({ id: 'site', intent: { summary: 'Images' }, declarations: { Home } })],
})
const build = buildProject(site, { sources: false })
const chrome = process.env.CHROMIUM_PATH ?? chromium.executablePath()

describe('@tenonkit/image (ADR 0017)', () => {
  it('generates WebP widths up to the intrinsic width for raster <img> assets only', async () => {
    const images = await optimizeImages(build)
    const [hero] = Object.keys(images.variants)
    expect(Object.keys(images.variants)).toHaveLength(1)
    expect(images.variants[hero!]!.map((v) => v.width)).toEqual([640, 960, 1280, 1920, 2000])
    for (const v of images.variants[hero!]!) {
      const meta = await sharp(images.files[v.href]!).metadata()
      expect([meta.format, meta.width]).toEqual(['webp', v.width])
    }
  })

  it('adds srcset and sizes to the page and serves the variants; without images nothing changes', async () => {
    const images = await optimizeImages(build)
    const with_ = createHandler({ build, resolvers: resolvers(site, () => []), images })
    const html = await (await with_.fetch(new Request('https://x.example/'))).text()
    const img = /<img[^>]*alt="Hero"[^>]*>/.exec(html)![0]
    expect(img).toMatch(/srcset="\/_tenon\/a\/[0-9a-f]{16}-640\.webp 640w, .*-2000\.webp 2000w"/)
    expect(img).toContain('sizes="(max-width: 1000px) 100vw, 1000px"')
    expect(/<img[^>]*alt="Logo"[^>]*>/.exec(html)![0]).not.toContain('srcset')
    const href = /(\/_tenon\/a\/[0-9a-f]{16}-640\.webp)/.exec(img)![1]!
    const file = await with_.fetch(new Request(`https://x.example${href}`))
    expect([file.status, file.headers.get('content-type')]).toEqual([200, 'image/webp'])

    const without = createHandler({ build, resolvers: resolvers(site, () => []) })
    expect(await (await without.fetch(new Request('https://x.example/'))).text()).not.toContain('srcset')
  })

  it.skipIf(!existsSync(chrome))(
    'the browser picks a WebP variant',
    async () => {
      const images = await optimizeImages(build)
      const server = createServer({ build, resolvers: resolvers(site, () => []), images })
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
      const browser = await chromium.launch({ executablePath: chrome })
      try {
        const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
        await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`)
        await page.waitForFunction(
          () => (document.querySelector('img[alt="Hero"]') as HTMLImageElement).complete,
        )
        const src = await page.evaluate(
          () => (document.querySelector('img[alt="Hero"]') as HTMLImageElement).currentSrc,
        )
        expect(src).toMatch(/-(960|1280)\.webp$/)
      } finally {
        await browser.close()
        server.close()
      }
    },
    30_000,
  )

  it('tenon build picks @tenonkit/image up from the project and the manifest carries the variants', async () => {
    const blog = fileURLToPath(new URL('../../../examples/blog/', import.meta.url))
    const cli = fileURLToPath(new URL('../../cli/bin/tenon.js', import.meta.url))
    const out = mkdtempSync(join(tmpdir(), 'tenon-blog-dist-'))
    const built = spawnSync(process.execPath, [cli, 'build', '--out', out], { cwd: blog, encoding: 'utf8' })
    expect(built.status, built.stderr).toBe(0)
    const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8')) as Manifest
    const [hero] = Object.values(manifest.images ?? {})
    expect(hero?.map((v) => v.width)).toEqual([640, 960, 1280, 1600])
    for (const v of hero!) expect(existsSync(join(out, 'public', v.href))).toBe(true)
    const project = (await import('../../../examples/blog/tenon.config.ts')).default
    const { createResolvers } = await import('../../../examples/blog/server.ts')
    const handler = createHandler({
      build: buildProject(project, { sources: false, manifest }),
      manifest,
      resolvers: createResolvers(),
      session: () => ({ userId: 'a' }),
    })
    const html = await (await handler.fetch(new Request('https://blog.tenon.dev/en'))).text()
    expect(html).toContain(`srcset="${hero!.map((v) => `${v.href} ${v.width}w`).join(', ')}"`)
  }, 30_000)
})
