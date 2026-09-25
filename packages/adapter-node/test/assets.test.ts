import { mkdtempSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createServer } from '@tenon/adapter-node'
import { feature, project, route, ui } from '@tenon/core'
import { buildProject } from '@tenon/core/ir'
import { compileStyles } from '@tenon/css'
import { resolvers } from '@tenon/data'
import { zodAdapter } from '@tenon/schema-zod'
import { validate } from '@tenon/validator'
import { describe, expect, it } from 'vitest'

const png = (w: number, h: number) => {
  const b = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0)
  b.writeUInt32BE(13, 8)
  b.write('IHDR', 12, 'ascii')
  b.writeUInt32BE(w, 16)
  b.writeUInt32BE(h, 20)
  return b
}

const dir = mkdtempSync(join(tmpdir(), 'tenon-assets-'))
writeFileSync(join(dir, 'hero.png'), png(1200, 630))
writeFileSync(join(dir, 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20"></svg>')
writeFileSync(join(dir, 'inter.woff2'), 'wOF2fake')
writeFileSync(
  join(dir, 'app.css'),
  '@import "tailwindcss";\n@font-face { font-family: Inter; src: url("./inter.woff2") format("woff2"); }\n',
)
const url = (f: string) => pathToFileURL(join(dir, f))

const home = route({ path: '/', params: null })
const Page = ui.view({
  machine: null,
  route: null,
  render: () =>
    ui.main({}, [
      ui.img({ src: ui.asset(url('hero.png')), alt: 'Hero' }),
      ui.img({ src: ui.asset(url('logo.svg')), alt: 'Logo', width: 40, height: 20 }),
    ]),
})
const site = project({
  schema: zodAdapter,
  styles: url('app.css'),
  session: null,
  site: null,
  routes: { home },
  pages: [
    ui.page(home, {
      views: [Page],
      assert: null,
      head: {
        query: null,
        input: null,
        render: () => ({
          title: 'Assets',
          description: 'Asset fixture',
          type: 'website',
          image: null,
          published: null,
          noindex: false,
        }),
      },
      entries: null,
    }),
  ],
  features: [
    feature({
      id: 'site',
      styles: [],
      widgets: {},
      intent: { summary: 'Asset fixture', invariants: [] },
      imports: [],
      tags: {},
      events: {},
      queries: {},
      mutations: {},
      fns: {},
      machine: null,
      views: { Page },
      contracts: {},
      exports: { events: [], queries: [], mutations: [], tags: [], fns: [], views: [] },
    }),
  ],
})

describe('assets', () => {
  const build = buildProject(site)

  it('hashes files, reads image dimensions, and TN028 patches missing width/height from the file', () => {
    const assets = Object.values(build.bindings.assets)
    expect(assets.map((a) => [a.width, a.height])).toEqual([
      [1200, 630],
      [40, 20],
    ])
    const found = validate(build.ir, { bindings: build.bindings }).filter((d) => d.code === 'TN028')
    expect(found.map((d) => d.location.pointer)).toEqual(['/features/site/views/Page/root/children/0/attrs'])
    expect(found[0]!.fix?.patch).toEqual([
      { op: 'add', path: '/features/site/views/Page/root/children/0/attrs/width', value: { literal: 1200 } },
      { op: 'add', path: '/features/site/views/Page/root/children/0/attrs/height', value: { literal: 630 } },
    ])
  })

  it('serves hashed images and CSS fonts with immutable caching and preloads woff2', async () => {
    const styles = await compileStyles(build, { base: dir })
    const font = styles.preload[0]!
    expect(font).toMatch(/^\/_tenon\/a\/[0-9a-f]{16}\.woff2$/)
    expect(styles.css).toContain(`url(${font})`)
    const server = createServer({ build, styles, resolvers: resolvers(site, () => []) })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    try {
      const html = await (await fetch(`${base}/`)).text()
      expect(html).toContain(`<link rel="preload" href="${font}" as="font" type="font/woff2" crossorigin>`)
      const src = /<img src="([^"]+\.png)"/.exec(html)![1]!
      const image = await fetch(`${base}${src}`)
      expect(image.headers.get('content-type')).toBe('image/png')
      expect(image.headers.get('cache-control')).toContain('immutable')
      expect((await image.arrayBuffer()).byteLength).toBe(33)
      expect((await fetch(`${base}${font}`)).headers.get('content-type')).toBe('font/woff2')
    } finally {
      server.close()
    }
  })
})
