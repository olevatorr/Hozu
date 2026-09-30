import { appHandlerOptions, createHandler } from '@hozu/runtime-server'
import { testApp, visibleText } from '@hozu/testing'
import { describe, expect, it } from 'vitest'
import blog from '../../../examples/blog/app.ts'

const secret = 's'.repeat(32)
const app = () => {
  const handler = createHandler({
    ...appHandlerOptions(blog),
    session: () => ({ userId: 'a' }),
    preview: { secret },
  })
  return {
    get: async (path: string, init?: RequestInit) => {
      const response = await handler.fetch(new Request(`http://localhost${path}`, init))
      const html = await response.text()
      return { status: response.status, headers: response.headers, html, text: visibleText(html) }
    },
  }
}

describe('preview mode (ADR 0021)', () => {
  it('needs the secret and an internal path', async () => {
    const a = app()
    expect((await a.get(`/_hozu/preview?secret=wrong&path=/`)).status).toBe(401)
    expect((await a.get(`/_hozu/preview?secret=${secret}&path=//evil.example`)).status).toBe(401)
    const ok = await a.get(`/_hozu/preview?secret=${secret}&path=/`)
    expect([ok.status, ok.headers.get('location')]).toEqual([307, '/'])
    expect(ok.headers.get('set-cookie')).toMatch(
      /^hozu_preview=.+; Path=\/; HttpOnly; SameSite=Lax; Secure; Max-Age=3600$/,
    )
  })

  it('shows drafts only in preview, uncached and noindex, and never leaks them to public pages', async () => {
    const a = app()
    expect((await a.get('/')).text).not.toContain('What comes next')
    expect((await a.get('/posts/hozu-roadmap')).status).toBe(404)
    const cookie = (await a.get(`/_hozu/preview?secret=${secret}&path=/`)).headers
      .get('set-cookie')!
      .split(';')[0]!
    const home = await a.get('/', { headers: { cookie } })
    expect(home.text).toContain('What comes next')
    expect([home.headers.get('cache-control'), home.headers.get('x-robots-tag')]).toEqual([
      'private, no-store',
      'noindex',
    ])
    expect((await a.get('/posts/hozu-roadmap', { headers: { cookie } })).status).toBe(200)
    expect((await a.get('/')).text).not.toContain('What comes next')
    expect((await a.get('/posts/hozu-roadmap')).status).toBe(404)
    const exit = await a.get('/_hozu/preview/exit?path=/', { headers: { cookie } })
    expect(exit.headers.get('set-cookie')).toContain('Max-Age=0')
  })
})

describe('PWA and offline (ADR 0021)', () => {
  it('derives the manifest and serves the offline worker', async () => {
    const a = app()
    const manifest = JSON.parse((await a.get('/manifest.webmanifest')).html)
    expect(manifest).toMatchObject({
      name: 'Hozu Blog',
      start_url: '/',
      scope: '/',
      display: 'standalone',
    })
    const page = await a.get('/')
    expect(page.html).toContain('<link rel="manifest" href="/manifest.webmanifest">')
    expect(page.html).toContain('<script type="module" src="/_hozu/sw-register.js"></script>')
    const sw = await a.get('/sw.js')
    expect(sw.html).toContain('const OFFLINE = "/offline"')
    expect((await a.get('/_hozu/sw-register.js')).html).toContain('register("/sw.js"')
    const offline = await a.get('/zh-TW/offline')
    expect(offline.text).toContain('目前離線')
  })

  it('serves no worker without an offline page', async () => {
    const a = testApp((await import('../../../examples/cart/app.ts')).default)
    expect((await a.get('/sw.js')).status).toBe(404)
    expect((await a.get('/')).html).not.toContain('sw-register')
  })
})

describe('@hozu/testing (ADR 0021)', () => {
  it('returns visible text, the payload and native form posts', async () => {
    const page = await testApp(blog).get('/zh-TW')
    expect(page.text).toContain('Hozu 部落格')
    expect(page.text).not.toContain('hozu-payload')
    expect(page.payload).toMatchObject({ islands: expect.any(Array) })
  })

  it('posts a native form', async () => {
    const b = testApp((await import('../../../examples/bookmarks/app.ts')).default)
    const action = /<form[^>]* action="([^"]+)"/.exec((await b.get('/')).html)![1]!.replace(/&amp;/g, '&')
    const page = await b.post(action, { title: 'x', kind: 'article' })
    expect([page.status, page.text]).toEqual([400, expect.stringContaining('Use at least 2 characters')])
  })
})
