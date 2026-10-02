import { existsSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { locateNode } from '@hozu/core/ir'
import { describe, expect, it } from 'vitest'
import { appHandlerOptions, appOptionsOf, createHandler, generateRender } from '../src/index.ts'

const examples = ['blog', 'bookmarks', 'cart', 'feed', 'notes', 'showcase', 'stations']
const env = { SESSION_SECRET: 'devtools-test-secret-0123456789abcdef', PUBLIC_SITE_NAME: 'Test' }
const markers = (html: string) => [...html.matchAll(/data-hz="([^"]+)"/g)].map((m) => m[1]!)

describe('dev markers (ADR 0047 G1, G4)', () => {
  for (const name of examples)
    it(`${name}: every rendered element under hozu dev resolves to a source line`, async () => {
      const root = fileURLToPath(new URL(`../../../examples/${name}/`, import.meta.url))
      const app = (await import(join(root, 'app.ts'))).default
      const dev = { root }
      const build = appHandlerOptions(app, { dev }).build
      const bundle = appOptionsOf(app)?.components
      const components = bundle ? await bundle(build) : null
      const handler = createHandler(app, { dev, env, readFile, ...(components ? { components } : {}) })
      const paths = Object.entries(build.ir.routes)
        .filter(([name, r]) => !r.path.includes(':') && build.ir.pages[name] !== undefined)
        .map(([, r]) => r.path)
      const pages = paths.length ? paths : ['/']
      let total = 0
      for (const path of pages) {
        let response = await handler.fetch(new Request(`http://local${path}`))
        const moved = response.headers.get('location')
        if (response.status >= 300 && response.status < 400 && moved)
          response = await handler.fetch(new Request(new URL(moved, 'http://local')))
        const html = await response.text()
        for (const id of markers(html)) {
          const node = locateNode(build, id, dev)
          expect(node?.location, `${name} ${path} ${id}`).toBeTruthy()
          expect(
            existsSync(join(root, node!.location!.file)),
            `${name} ${id} → ${node!.location!.file}`,
          ).toBe(true)
          total++
        }
      }
      expect(total).toBeGreaterThan(0)
    })

  it('production renders carry no marker and no dev endpoint', async () => {
    const root = fileURLToPath(new URL('../../../examples/notes/', import.meta.url))
    const app = (await import(join(root, 'app.ts'))).default
    const handler = createHandler(app, { env })
    const html = await (await handler.fetch(new Request('http://local/login'))).text()
    expect(markers(html)).toEqual([])
    expect((await handler.fetch(new Request('http://local/_hozu/dev/node?id=account.Login'))).status).toBe(
      404,
    )
    const build = appHandlerOptions(app, {}).build
    expect(generateRender(build)).not.toContain('data-hz')
  })

  it('the dev endpoint answers with the node, its component and an excerpt', async () => {
    const root = fileURLToPath(new URL('../../../examples/notes/', import.meta.url))
    const app = (await import(join(root, 'app.ts'))).default
    const handler = createHandler(app, { dev: { root }, env, readFile })
    const html = await (await handler.fetch(new Request('http://local/login'))).text()
    const button = markers(html).find(
      (id) => html.includes(`data-hz="${id}" type="submit"`) || id.endsWith('/2/1'),
    )!
    const node = await (
      await handler.fetch(new Request(`http://127.0.0.1/_hozu/dev/node?id=${button}`))
    ).json()
    expect(node.component.ref).toBe('ui.Button')
    expect(node.component.declaration.file).toBe('ui/button.ts')
    expect(node.location.file).toBe('features/account/views.ts')
    const line = readFileSync(join(root, node.location.file), 'utf8').split('\n')[node.location.line - 1]
    expect(node.excerpt.lines).toContain(line)
  })
})

describe('dev endpoint security (ADR 0047)', () => {
  it('answers only requests addressed to this machine', async () => {
    const root = fileURLToPath(new URL('../../../examples/notes/', import.meta.url))
    const app = (await import(join(root, 'app.ts'))).default
    const handler = createHandler(app, { dev: { root }, env, readFile })
    const ask = (base: string) => handler.fetch(new Request(`${base}/_hozu/dev/node?id=account.Login`))
    expect((await ask('http://127.0.0.1:3000')).status).toBe(200)
    expect((await ask('http://localhost:3000')).status).toBe(200)
    expect((await ask('http://evil.example')).status).toBe(403)
  })

  it('names the page a path renders, also under a locale prefix', async () => {
    const root = fileURLToPath(new URL('../../../examples/notes/', import.meta.url))
    const app = (await import(join(root, 'app.ts'))).default
    const handler = createHandler(app, { dev: { root }, env, readFile })
    const page = async (path: string) =>
      (
        await handler.fetch(new Request(`http://127.0.0.1/_hozu/dev/page?path=${encodeURIComponent(path)}`))
      ).json()
    expect(await page('/login')).toMatchObject({
      id: 'page:login',
      page: { route: 'login', head: { title: 'Sign in' } },
    })
    expect(await page('/de/login')).toMatchObject({ id: 'page:login' })
    expect((await handler.fetch(new Request('http://127.0.0.1/_hozu/dev/page?path=/nope'))).status).toBe(404)
  })
})

describe('layers and states (ADR 0047 P3, P5)', () => {
  const notes = fileURLToPath(new URL('../../../examples/notes/', import.meta.url))
  const handlerFor = async (dev: boolean) => {
    const app = (await import(join(notes, 'app.ts'))).default
    return createHandler(app, { ...(dev ? { dev: { root: notes } } : {}), env, readFile })
  }

  it('lists the page structure and every state that is not on screen', async () => {
    const handler = await handlerFor(true)
    const tree = await (await handler.fetch(new Request('http://127.0.0.1/_hozu/dev/tree?path=/'))).json()
    expect(tree.route).toBe('home')
    expect(tree.views.map((v: { id: string }) => v.id)).toEqual(['account.AccountBar', 'notes.NotesBoard'])
    const labels = (n: { label: string; children: unknown[] }): string[] => [
      n.label,
      ...(n.children as never[]).flatMap(labels),
    ]
    expect(tree.views.flatMap(labels)).toContain('Button')
    expect(tree.scenarios.map((s: { label: string }) => s.label)).toEqual(
      expect.arrayContaining([
        'Adding',
        'Loading list notes',
        'List notes failed: Unauthorized',
        'Me failed: Unauthorized',
      ]),
    )
    expect(tree.scenarios.find((s: { label: string }) => s.label === 'Adding').preview).toEqual({
      feature: 'notes',
      state: 'adding',
    })
  })

  it('renders a previewed query branch and machine state without running anything else', async () => {
    const handler = await handlerFor(true)
    const signIn = await handler.fetch(
      new Request('http://127.0.0.1/login?__hozu=account.Login%2F2', {
        method: 'POST',
        body: new URLSearchParams({ name: 'otis' }),
      }),
    )
    const cookie = (signIn.headers.get('set-cookie') ?? '').split(';')[0]!
    const page = async (preview: unknown) =>
      (
        await handler.fetch(
          new Request('http://127.0.0.1/', {
            headers: { cookie: `${cookie}; hozu-dev-state=${encodeURIComponent(JSON.stringify(preview))}` },
          }),
        )
      ).text()
    expect(await page({ query: 'notes.listNotes', branch: 'failed.Unexpected' })).toContain(
      'Notes are unavailable',
    )
    expect(await page({ query: 'notes.listNotes', branch: 'pending' })).toContain('Loading…')
    const adding = await page({ feature: 'notes', state: 'adding' })
    expect(adding).toContain('aria-busy="true"')
    expect(adding).toContain('"state":"adding"')
    const plain = await (
      await handler.fetch(new Request('http://127.0.0.1/', { headers: { cookie } }))
    ).text()
    expect(plain).not.toContain('aria-busy="true"')
    expect(plain).not.toContain('>Notes are unavailable</p>')
    expect(plain).not.toContain('>Loading…</p>')
    expect(plain).toContain('data-hz="notes.NotesBoard/7/ready"')
  })

  it('ignores the preview cookie and the tree outside dev', async () => {
    const handler = await handlerFor(false)
    const r = await handler.fetch(
      new Request('http://127.0.0.1/login', {
        headers: {
          cookie: `hozu-dev-state=${encodeURIComponent('{"feature":"account","state":"signingIn"}')}`,
        },
      }),
    )
    expect(await r.text()).not.toContain('"state":"signingIn"')
    expect((await handler.fetch(new Request('http://127.0.0.1/_hozu/dev/tree?path=/'))).status).toBe(404)
  })
})

describe('dev styles (ADR 0047 P4)', () => {
  it('answers the Tailwind entry so DevTools can read the project theme', async () => {
    const root = fileURLToPath(new URL('../../../examples/showcase/', import.meta.url))
    const app = (await import(join(root, 'app.ts'))).default
    const build = appHandlerOptions(app, { dev: { root } }).build
    const bundle = appOptionsOf(app)?.components
    const components = bundle ? await bundle(build) : null
    const handler = createHandler(app, {
      dev: { root },
      env,
      readFile,
      ...(components ? { components } : {}),
    })
    const response = await handler.fetch(new Request('http://127.0.0.1/_hozu/dev/styles'))
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('@theme')
    expect((await handler.fetch(new Request('http://evil.example/_hozu/dev/styles'))).status).toBe(403)
    const prod = createHandler(app, { env, ...(components ? { components } : {}) })
    expect((await prod.fetch(new Request('http://127.0.0.1/_hozu/dev/styles'))).status).toBe(404)
  })
})

describe('client bundle (ADR 0047 G4)', () => {
  it('the production client has no marker code; the dev client stamps data-hz', () => {
    const dist = fileURLToPath(new URL('../../runtime-client/dist/', import.meta.url))
    expect(readFileSync(join(dist, 'browser/client.js'), 'utf8')).not.toContain('data-hz')
    expect(readFileSync(join(dist, 'browser-dev/client.js'), 'utf8')).toContain('data-hz')
  })
})
