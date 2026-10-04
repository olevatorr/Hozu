import type { AddressInfo } from 'node:net'
import { createServer } from '@hozu/adapter-node'
import { feature, mutation, project, route, ui } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { resolvers } from '@hozu/data'
import { domField, fetchTransport } from '@hozu/runtime-client'
import { zodAdapter } from '@hozu/schema-zod'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const FileMeta = z.object({ name: z.string(), size: z.number(), type: z.string(), token: z.string() })
const upload = mutation({
  input: z.object({ file: FileMeta }),
  output: z.object({ size: z.number(), text: z.string() }),
  invalidates: () => [],
  runs: 'server',
  access: 'anyone',
})
const home = route({ path: '/', params: null, search: null })
const Home = ui.view({ render: () => ui.p({}, ['Upload']) })
const site = project({
  schema: zodAdapter,
  routes: { home },
  pages: [ui.page(home, { views: [Home], head: { render: () => ({ title: 'Up', description: 'Up' }) } })],
  features: [feature({ id: 'up', intent: { summary: 'Upload fixture' }, declarations: [{ upload, Home }] })],
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
      .mockImplementation((url, init) => realFetch(`${base}/_hozu/${String(url).split('/').pop()}`, init))
    try {
      const file = new File(['hello hozu'], 'note.txt', { type: 'text/plain' })
      const [meta] = domField({ target: { files: [file] } } as unknown as Event)('files') as [
        { name: string; size: number; type: string; token: string },
      ]
      expect(meta).toMatchObject({ name: 'note.txt', size: 10, type: 'text/plain' })
      const response = await fetchTransport('up.upload', { file: meta }, [])
      expect(response.result).toEqual({ ok: true, value: { size: 10, text: 'hello hozu' } })
      expect(spy.mock.calls[0]![1]!.body).toBeInstanceOf(FormData)
    } finally {
      spy.mockRestore()
      server.close()
    }
  })
})
