import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { feature, project, query, route, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { resolvers } from '@hozu/data'
import { zodAdapter } from '@hozu/schema-zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createHandler } from '../src/index.ts'

const env = { SESSION_SECRET: 'devtools-test-secret-0123456789abcdef' }
const notesRoot = fileURLToPath(new URL('../../../examples/notes/', import.meta.url))

describe('DevTools API endpoints (ADR 0050 G)', () => {
  it('records the requests a resolver sends out, with headers and bodies', async () => {
    const home = route({ path: '/', params: null, search: null })
    const outside = query({
      input: z.object({}),
      output: z.object({ a: z.number() }),
      scope: 'public',
      freshness: 'request',
      runs: 'server',
    })
    const app = project({
      schema: zodAdapter,
      routes: { home },
      pages: [ui.page(home, { views: [], head: { render: () => ({ title: 'Trace' }) } })],
      features: [feature({ id: 'trace', intent: { summary: 'trace' }, declarations: [{ outside }] })],
    })
    const handler = createHandler({
      build: buildProject(app, { sources: false }),
      dev: { root: '/' },
      resolvers: resolvers(app, (implement) => [
        implement(outside, async () =>
          (
            await fetch('data:application/json,{"a":1}', { headers: { authorization: 'Bearer t0ken' } })
          ).json(),
        ),
      ]),
    })
    const get = async (path: string) => (await handler.fetch(new Request(`http://localhost${path}`))).json()
    const { last } = await get('/_hozu/dev/trace?after=latest')
    const answer = await handler.fetch(
      new Request('http://localhost/_hozu/query', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost' },
        body: JSON.stringify({ query: 'trace.outside', input: {} }),
      }),
    )
    expect(await answer.json()).toEqual({ ok: true, value: { a: 1 } })
    const { entries } = await get(`/_hozu/dev/trace?after=${last}`)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      method: 'GET',
      url: 'data:application/json,{"a":1}',
      requestHeaders: [['authorization', 'Bearer t0ken']],
      status: 200,
      responseBody: '{"a":1}',
      error: null,
    })
  })

  it('lists the endpoints and acts as a session user', async () => {
    const app = (await import(join(notesRoot, 'app.ts'))).default
    const handler = createHandler(app, { dev: { root: notesRoot }, env, readFile })
    const endpoints = await (await handler.fetch(new Request('http://localhost/_hozu/dev/endpoints'))).json()
    expect(
      endpoints.map((e: { ref: string; method: string; path: string }) => [e.ref, e.method, e.path]),
    ).toContainEqual(['notes.notesApi', 'GET', '/api/notes'])
    const before = await (await handler.fetch(new Request('http://localhost/_hozu/dev/session'))).json()
    expect(before).toMatchObject({ declared: true, current: null })
    expect(before.schema.properties).toHaveProperty('user')
    const post = (session: unknown) =>
      handler.fetch(
        new Request('http://localhost/_hozu/dev/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: 'http://localhost' },
          body: JSON.stringify({ session }),
        }),
      )
    expect((await post({ name: 'no user' })).status).toBe(400)
    const acted = await post({ user: 'ada' })
    const cookie = acted.headers.get('set-cookie')!.split(';')[0]!
    const after = await (
      await handler.fetch(new Request('http://localhost/_hozu/dev/session', { headers: { cookie } }))
    ).json()
    expect(after.current).toEqual({ user: 'ada' })
    const remote = await handler.fetch(new Request('http://10.0.0.5/_hozu/dev/session'))
    expect(remote.status).toBe(403)
  })

  it('never waits for a streamed response while it records one', async () => {
    const { createServer } = await import('node:http')
    const server = createServer((_, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write('data: 1\n\n')
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    try {
      const { port } = server.address() as { port: number }
      const answered = await Promise.race([
        fetch(`http://127.0.0.1:${port}/`).then((r) => r.status),
        new Promise((r) => setTimeout(() => r('waited'), 2000)),
      ])
      expect(answered).toBe(200)
    } finally {
      server.closeAllConnections()
      server.close()
    }
  })
})
