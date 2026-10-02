import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { exportStatic } from '@hozu/adapter-static'
import { buildProject } from '@hozu/core/ir'
import { resolvers } from '@hozu/data'
import { hydrate } from '@hozu/runtime-client'
import { Window } from 'happy-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as fetches from '../../../examples/stars/features/stars/fetch.ts'
import project from '../../../examples/stars/hozu.config.ts'

const tick = () => new Promise((r) => setTimeout(r, 0))
const settle = async () => {
  for (let i = 0; i < 30; i++) await tick()
}
const repo = (id: number, full_name: string) => ({ id, full_name, description: null, stargazers_count: id })

function fakeGitHub() {
  const stars = new Map([[1, repo(1, 'hozu/hozu')]])
  const calls: string[] = []
  const answer = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const fetch = async (url: string, init: RequestInit = {}) => {
    const u = new URL(url)
    const method = init.method ?? 'GET'
    calls.push(`${method} ${u.origin}${u.pathname}${u.search}`)
    const auth = new Headers(init.headers).get('authorization')
    if (u.pathname === '/search/repositories')
      return answer(200, { items: [repo(2, `${u.searchParams.get('q')}/found`)] })
    if (auth !== 'Bearer t0ken') return answer(401, {})
    if (u.pathname === '/user/starred') return answer(200, [...stars.values()])
    const name = u.pathname.replace('/user/starred/', '')
    if (method === 'DELETE') for (const [id, r] of stars) if (r.full_name === name) stars.delete(id)
    return new Response(null, { status: 204 })
  }
  return { fetch, calls }
}

afterEach(() => vi.unstubAllGlobals())

describe('examples/stars on a static host (ADR 0049)', () => {
  it('exports a complete page, then reads, stars and searches GitHub from the browser alone', async () => {
    const build = buildProject(project, { sources: false })
    const out = mkdtempSync(join(tmpdir(), 'hozu-stars-'))
    const result = await exportStatic({
      build,
      resolvers: resolvers(project, () => []),
      outDir: out,
      components: { urls: {}, files: {}, fetches: { stars: '/_hozu/c/fetch-stars.js' } },
      env: {},
    })
    expect([result.skipped, result.needsServer]).toEqual([[], []])
    const html = readFileSync(join(out, 'index.html'), 'utf8')
    expect(html).toContain('Loading your stars…')

    const github = fakeGitHub()
    const store = new Map<string, string>()
    vi.stubGlobal('fetch', github.fetch)
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    })
    const window = new Window({ url: 'https://stars.example/' })
    const document = window.document as unknown as Document
    document.write(html.replace(/<script type="module"[^>]*><\/script>/g, ''))
    await hydrate(document, {
      loadFns: async (url) => (await import(pathToFileURL(join(out, url)).href)).fns,
      loadFetch: async () => fetches,
    })
    await settle()
    const stars = () => document.querySelector('[aria-label="Your stars"]')!.textContent
    expect(stars()).toContain('Paste a GitHub token to see your stars.')

    const token = document.querySelector('input[name=token]') as HTMLInputElement
    token.value = 't0ken'
    token.form!.dispatchEvent(new window.Event('submit', { cancelable: true }) as unknown as Event)
    await settle()
    expect(store.get('stars:github-token')).toBe('t0ken')
    expect(stars()).toContain('hozu/hozu')

    const unstar = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Unstar')!
    unstar.click()
    await settle()
    expect(stars()).not.toContain('hozu/hozu')

    const search = document.querySelector('input[name=q]') as HTMLInputElement
    search.value = 'tenon'
    search.dispatchEvent(new window.Event('input') as unknown as Event)
    await settle()
    expect(document.querySelector('[aria-label="Search"]')!.textContent).toContain('tenon/found')

    expect(github.calls).toEqual([
      'GET https://api.github.com/user/starred?per_page=50',
      'DELETE https://api.github.com/user/starred/hozu/hozu',
      'GET https://api.github.com/user/starred?per_page=50',
      'GET https://api.github.com/search/repositories?per_page=10&q=tenon',
    ])
  })
})
