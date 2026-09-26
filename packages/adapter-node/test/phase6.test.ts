import type { AddressInfo } from 'node:net'
import { createServer } from '@tenonkit/adapter-node'
import { buildProject } from '@tenonkit/core/ir'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createResolvers } from '../../../examples/bookmarks/server.ts'
import project from '../../../examples/bookmarks/tenon.config.ts'

const errors: unknown[] = []
let base = ''
let close = () => {}

beforeAll(async () => {
  const build = buildProject(project, { sources: false })
  const set = createResolvers()
  const server = createServer({
    build,
    resolvers: set,
    onError: (error) => errors.push(error),
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  close = () => server.close()
})
afterAll(() => close())

const form = (action: string, body: Record<string, string>, headers: Record<string, string> = {}) =>
  fetch(`${base}${action}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(body).toString(),
  })

describe('Phase 6 (ADR 0014)', () => {
  it('renders forms that post natively, and search-dependent pages by canonical URL', async () => {
    const html = await (await fetch(`${base}/?show=unread&utm=x`)).text()
    expect(html).toContain('method="post" action="/?show=unread&amp;__tenon=bookmarks.Board%2F1"')
    expect(html).toContain('<link rel="canonical" href="http://localhost:3000/?show=unread">')
    expect(await (await fetch(`${base}/?show=all`)).text()).toContain(
      '<link rel="canonical" href="http://localhost:3000/">',
    )
  })

  it('runs the machine on the server for a no-JS post: navigate → 303, declared error → page with the alert', async () => {
    const ok = await form('/?__tenon=bookmarks.Board%2F1', { title: 'From a form', kind: 'video' })
    expect(ok.status).toBe(303)
    const location = ok.headers.get('location')!
    expect(location).toMatch(/^\/bookmarks\/b\d+$/)
    expect(await (await fetch(`${base}${location}`)).text()).toContain('Kind: video')
    const dup = await form('/?__tenon=bookmarks.Board%2F1', { title: 'from a form', kind: 'video' })
    expect(dup.status).toBe(200)
    const page = await dup.text()
    expect(page).toContain('This bookmark already exists')
    expect(page).toContain('"snapshots":{"bookmarks":{"state":"idle"')
  })

  it('rejects cross-site posts and sends security headers', async () => {
    const r = await form(
      '/?__tenon=bookmarks.Board%2F1',
      { title: 'x', kind: 'video' },
      { origin: 'https://evil.example' },
    )
    expect(r.status).toBe(403)
    const effect = await fetch(`${base}/_tenon/effect`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' },
      body: '{}',
    })
    expect(effect.status).toBe(403)
    const page = await fetch(`${base}/`)
    expect(page.headers.get('x-content-type-options')).toBe('nosniff')
    expect(page.headers.get('content-security-policy')).toMatch(/script-src 'self' 'sha256-[^']+'/)
  })

  it('reports resolver failures to onError and serves an HTML error page on crashes', async () => {
    const before = errors.length
    const r = await fetch(`${base}/_tenon/effect`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ effect: 'bookmarks.toggleRead', input: { id: 42 }, keys: [] }),
    })
    expect(r.status).toBe(200)
    const bad = await fetch(`${base}/_tenon/effect`, { method: 'POST', body: 'not json' })
    expect(bad.status).toBe(500)
    expect(errors.length).toBeGreaterThan(before)
  })
})
