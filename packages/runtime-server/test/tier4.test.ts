import { buildProject } from '@tenon/core/ir'
import { testApp } from '@tenon/testing'
import { describe, expect, it } from 'vitest'
import { createResolvers } from '../../../examples/blog/server.ts'
import project from '../../../examples/blog/tenon.config.ts'

const build = buildProject(project, { sources: false })
const secret = 's'.repeat(32)
const app = () =>
  testApp({ build, resolvers: createResolvers(), session: () => ({ userId: 'a' }), preview: { secret } })

describe('preview mode (ADR 0021)', () => {
  it('needs the secret and an internal path', async () => {
    const a = app()
    expect((await a.get(`/_tenon/preview?secret=wrong&path=/en`)).status).toBe(401)
    expect((await a.get(`/_tenon/preview?secret=${secret}&path=//evil.example`)).status).toBe(401)
    const ok = await a.get(`/_tenon/preview?secret=${secret}&path=/en`)
    expect([ok.status, ok.headers.get('location')]).toEqual([307, '/en'])
    expect(ok.headers.get('set-cookie')).toMatch(
      /^tenon_preview=.+; Path=\/; HttpOnly; SameSite=Lax; Secure; Max-Age=3600$/,
    )
  })

  it('shows drafts only in preview, uncached and noindex, and never leaks them to public pages', async () => {
    const a = app()
    expect((await a.get('/en')).text).not.toContain('What comes next')
    expect((await a.get('/en/posts/tenon-roadmap')).status).toBe(404)
    const cookie = (await a.get(`/_tenon/preview?secret=${secret}&path=/en`)).headers
      .get('set-cookie')!
      .split(';')[0]!
    const home = await a.get('/en', { headers: { cookie } })
    expect(home.text).toContain('What comes next')
    expect([home.headers.get('cache-control'), home.headers.get('x-robots-tag')]).toEqual([
      'private, no-store',
      'noindex',
    ])
    expect((await a.get('/en/posts/tenon-roadmap', { headers: { cookie } })).status).toBe(200)
    expect((await a.get('/en')).text).not.toContain('What comes next')
    expect((await a.get('/en/posts/tenon-roadmap')).status).toBe(404)
    const exit = await a.get('/_tenon/preview/exit?path=/en', { headers: { cookie } })
    expect(exit.headers.get('set-cookie')).toContain('Max-Age=0')
  })
})

describe('PWA and offline (ADR 0021)', () => {
  it('derives the manifest and serves the offline worker', async () => {
    const a = app()
    const manifest = JSON.parse((await a.get('/manifest.webmanifest')).html)
    expect(manifest).toMatchObject({
      name: 'Tenon Blog',
      start_url: '/en',
      scope: '/',
      display: 'standalone',
    })
    const page = await a.get('/en')
    expect(page.html).toContain('<link rel="manifest" href="/manifest.webmanifest">')
    expect(page.html).toContain('<script type="module" src="/_tenon/sw-register.js"></script>')
    const sw = await a.get('/sw.js')
    expect(sw.html).toContain('const OFFLINE = "/en/offline"')
    expect((await a.get('/_tenon/sw-register.js')).html).toContain('register("/sw.js"')
    const offline = await a.get('/zh-TW/offline')
    expect(offline.text).toContain('目前離線')
  })

  it('serves no worker without an offline page', async () => {
    const cart = (await import('../../../examples/cart/tenon.config.ts')).default
    const { createResolvers: cartResolvers } = await import('../../../examples/cart/server.ts')
    const a = testApp({ build: buildProject(cart, { sources: false }), resolvers: cartResolvers() })
    expect((await a.get('/sw.js')).status).toBe(404)
    expect((await a.get('/')).html).not.toContain('sw-register')
  })
})

describe('@tenon/testing (ADR 0021)', () => {
  it('returns visible text, the payload and native form posts', async () => {
    const page = await app().get('/zh-TW')
    expect(page.text).toContain('Tenon 部落格')
    expect(page.text).not.toContain('tenon-payload')
    expect(page.payload).toMatchObject({ islands: expect.any(Array) })
  })

  it('posts a native form', async () => {
    const bookmarks = (await import('../../../examples/bookmarks/tenon.config.ts')).default
    const { createResolvers: bookmarkResolvers } = await import('../../../examples/bookmarks/server.ts')
    const b = testApp({ build: buildProject(bookmarks, { sources: false }), resolvers: bookmarkResolvers() })
    const action = /<form[^>]* action="([^"]+)"/.exec((await b.get('/')).html)![1]!.replace(/&amp;/g, '&')
    const page = await b.post(action, { title: 'x', kind: 'article' })
    expect([page.status, page.text]).toEqual([200, expect.stringContaining('Use at least 2 characters')])
  })
})
