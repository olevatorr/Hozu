import type { AddressInfo } from 'node:net'
import { createServer } from '@tenon/adapter-node'
import { feature, mutation, project, route, ui } from '@tenon/core'
import { buildProject } from '@tenon/core/ir'
import { resolvers } from '@tenon/data'
import { domField, fetchTransport } from '@tenon/runtime-client'
import { zodAdapter } from '@tenon/schema-zod'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const FileMeta = z.object({ name: z.string(), size: z.number(), type: z.string(), token: z.string() })
const upload = mutation({
  input: z.object({ file: FileMeta }),
  output: z.object({ size: z.number(), text: z.string() }),
  errors: {},
  invalidates: () => [],
})
const home = route({ path: '/', params: null, search: null })
const Home = ui.view({ machine: null, route: null, render: () => ui.p({}, ['Upload']) })
const site = project({
  schema: zodAdapter,
  styles: null,
  http: null,
  notFound: null,
  error: null,
  session: null,
  site: null,
  routes: { home },
  pages: [
    ui.page(home, {
      views: [Home],
      assert: null,
      head: {
        redirects: null,
        query: null,
        input: null,
        render: () => ({
          title: 'Up',
          description: 'Up',
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
      id: 'up',
      styles: [],
      widgets: {},
      intent: { summary: 'Upload fixture', invariants: [] },
      imports: [],
      tags: {},
      events: {},
      queries: {},
      mutations: { upload },
      fns: {},
      machine: null,
      views: { Home },
      contracts: {},
      exports: { events: [], queries: [], mutations: [], tags: [], fns: [], views: [] },
    }),
  ],
})

describe('file uploads (G10)', () => {
  it('DOM files become tokens, the transport sends multipart, the resolver reads the bytes', async () => {
    const server = createServer({
      build: buildProject(site),
      resolvers: resolvers(site, (implement) => [
        implement(upload, async ({ file }, ctx) => {
          const got = await ctx.file(file.token)
          return { size: got?.size ?? -1, text: new TextDecoder().decode(got?.bytes) }
        }),
      ]),
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const realFetch = globalThis.fetch
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((url, init) => realFetch(`${base}/_tenon/${String(url).split('/').pop()}`, init))
    try {
      const file = new File(['hello tenon'], 'note.txt', { type: 'text/plain' })
      const [meta] = domField({ target: { files: [file] } } as unknown as Event)('files') as [
        { name: string; size: number; type: string; token: string },
      ]
      expect(meta).toMatchObject({ name: 'note.txt', size: 11, type: 'text/plain' })
      const response = await fetchTransport('up.upload', { file: meta }, [])
      expect(response.result).toEqual({ ok: true, value: { size: 11, text: 'hello tenon' } })
      expect(spy.mock.calls[0]![1]!.body).toBeInstanceOf(FormData)
    } finally {
      spy.mockRestore()
      server.close()
    }
  })
})
