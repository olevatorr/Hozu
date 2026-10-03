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

const dir = mkdtempSync(join(tmpdir(), 'hozu-env-internal-'))
const file = join(dir, 'fetch.ts')
writeFileSync(file, 'export const where = async (_, { env }) => ({ api: env.API })\n')

const home = route({ path: '/', params: null, search: null })
const where = query({
  input: z.object({}),
  output: z.object({ api: z.string() }),
  scope: 'public',
  freshness: 'request',
})
const Page = ui.view({
  render: () =>
    ui.main({}, [
      ui.query(where, {}, { ready: (w) => ui.p({}, ['via ', w.api]), failed: { Unexpected: () => null } }),
    ]),
})
const app = project({
  schema: zodAdapter,
  env: {
    public: z.object({ API: z.string() }),
    server: z.object({ API_INTERNAL: z.string().optional() }),
    internal: { API: 'API_INTERNAL' },
  },
  routes: { home },
  pages: [ui.page(home, { views: [Page], head: { render: () => ({ title: 'Env' }) } })],
  features: [
    feature({
      id: 'env',
      intent: { summary: 'internal URLs' },
      declarations: [{ where, Page }],
      fetch: pathToFileURL(file),
      connect: [{ env: 'API' }],
    }),
  ],
})
const page = async (env: Record<string, string>) => {
  const response = await createHandler({
    build: buildProject(app, { sources: false }),
    resolvers: resolvers(app, () => []),
    components: { urls: {}, files: {}, fetches: { env: '/_hozu/c/fetch-env.js' } },
    env,
  }).fetch(new Request('http://localhost/'))
  return { html: await response.text(), csp: response.headers.get('content-security-policy') ?? '' }
}

describe('env.internal (ADR 0052)', () => {
  it("renders an 'either' query through the internal URL on the server, and keeps it out of the browser's env and CSP", async () => {
    const { html, csp } = await page({
      API: 'https://api.example.com',
      API_INTERNAL: 'http://api.internal:8080',
    })
    expect(html).toContain('<p>via http://api.internal:8080</p>')
    const payload = JSON.parse(/id="hozu-payload">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '{}')
    expect(payload.env ?? {}).not.toHaveProperty('API_INTERNAL')
    expect(csp).toContain("connect-src 'self' https://api.example.com;")
  })

  it('uses the public URL when no internal one is set', async () => {
    expect((await page({ API: 'https://api.example.com' })).html).toContain(
      '<p>via https://api.example.com</p>',
    )
  })
})
