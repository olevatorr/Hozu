import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { feature, project, query, route, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { resolvers } from '@hozu/data'
import { createHandler } from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const dir = mkdtempSync(join(tmpdir(), 'hozu-connect-'))
const file = join(dir, 'fetch.ts')
writeFileSync(file, 'export const search = async () => []\n')

const home = route({ path: '/', params: null, search: null })
const search = query({
  input: z.object({}),
  output: z.array(z.string()),
  scope: 'public',
  freshness: 'request',
})
const appWith = (connect: unknown[]) =>
  project({
    schema: zodAdapter,
    env: { server: z.object({}), public: z.object({ API_URL: z.string().optional() }) },
    routes: { home },
    pages: [ui.page(home, { views: [], head: { render: () => ({ title: 'Connect' }) } })],
    features: [
      feature({
        id: 'repos',
        intent: { summary: 'connect' },
        declarations: [{ search }],
        fetch: pathToFileURL(file),
        connect: connect as never,
      }),
    ],
  })
const handler = (connect: unknown[], env: Record<string, string>, csp = {}) => {
  const app = appWith(connect)
  return createHandler({
    build: buildProject(app, { sources: false }),
    resolvers: resolvers(app, () => []),
    components: { urls: {}, files: {}, fetches: { repos: '/_hozu/c/fetch-repos.js' } },
    env,
    csp,
  })
}
const connectSrc = async (h: ReturnType<typeof handler>) =>
  /connect-src ([^;]*)/.exec(
    (await h.fetch(new Request('http://localhost/'))).headers.get('content-security-policy') ?? '',
  )?.[1]

describe('CSP connect-src from feature connect (ADR 0051)', () => {
  it('adds declared origins and the origin of an env URL to the app’s own csp.connect', async () => {
    const h = handler(
      ['https://api.github.com', { env: 'API_URL' }],
      { API_URL: 'https://staging.example.com/v2/' },
      { connect: ['https://analytics.example'] },
    )
    expect(await connectSrc(h)).toBe(
      "'self' https://analytics.example https://api.github.com https://staging.example.com",
    )
  })

  it('leaves out an unset env variable, and refuses one that is not a URL', async () => {
    expect(await connectSrc(handler([{ env: 'API_URL' }], {}))).toBe("'self'")
    expect(() => handler([{ env: 'API_URL' }], { API_URL: 'not a url' })).toThrow(
      'connect of repos reads the public env variable API_URL, which is not a URL: not a url',
    )
  })
})
