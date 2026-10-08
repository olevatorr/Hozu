import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { endpoint, feature, mutation, project, query } from '@hozu/core'
import { buildProject, remoteContract } from '@hozu/core/ir'
import { createDataRuntime, type DataRuntimeError, remote, resolvers } from '@hozu/data'
import { zodAdapter } from '@hozu/schema-zod'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

const Note = z.object({ id: z.string(), text: z.string() }).meta({ title: 'Note' })
const mine = query({
  input: z.object({}),
  output: z.array(Note),
  scope: 'user',
  freshness: 'request',
  runs: 'server',
  access: 'signedIn',
})
const total = query({
  input: z.object({}),
  output: z.number(),
  scope: 'public',
  freshness: 'request',
  runs: 'server',
})
const inBrowser = query({
  input: z.object({}),
  output: z.number(),
  scope: 'public',
  freshness: 'request',
  runs: 'browser',
})
const add = mutation({
  input: z.object({ text: z.string() }),
  output: Note,
  errors: { Duplicate: z.object({ text: z.string() }) },
  runs: 'server',
  access: 'anyone',
})
const signIn = mutation({
  input: z.object({ name: z.string() }),
  output: z.object({}),
  runs: 'server',
  access: 'anyone',
})
const feed = endpoint({ method: 'GET', path: '/feed.xml', input: z.object({}), output: 'response' })
const hook = endpoint({ method: 'POST', path: '/api/hook', input: z.object({}), output: z.object({}) })
const p = project({
  schema: zodAdapter,
  session: z.object({ user: z.string() }),
  env: { server: z.object({ SVC_SECRET: z.string() }) },
  routes: {},
  pages: [],
  features: [
    feature({
      id: 'notes',
      intent: { summary: 'remote resolvers (ADR 0068)' },
      declarations: [{ mine, total, inBrowser, add, signIn, feed, hook }],
    }),
  ],
})
const build = buildProject(p)

interface Seen {
  headers: IncomingMessage['headers']
  body: {
    effect: string
    input: unknown
    session: unknown
    preview: boolean
    headers: Record<string, string>
    files: Record<string, { name: string; type: string; size: number; data: string }>
  }
}

const seen: Seen[] = []
const answers: Record<string, { status?: number; body: unknown }> = {
  'notes.mine': { body: { ok: [{ id: 'n1', text: 'Tea' }] } },
  'notes.total': { body: { ok: 3 } },
  'notes.add': { body: { fail: { name: 'Duplicate', data: { text: 'Tea' } } } },
  'notes.signIn': { body: { ok: {}, session: { user: 'ada' } } },
  'notes.hook': { body: { ok: {} } },
}
let server: Server
let url = ''

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      const body = JSON.parse(raw) as Seen['body']
      seen.push({ headers: req.headers, body })
      const answer = answers[body.effect] ?? { status: 404, body: 'unknown' }
      res.writeHead(answer.status ?? 200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(answer.body))
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/effect`
})
afterAll(() => new Promise<void>((r) => server.close(() => r())))

const options = () => ({
  url,
  secret: { env: 'SVC_SECRET' },
  contract: new URL('./service/hozu/contract.go', import.meta.url),
})
const runtime = () =>
  createDataRuntime({
    build,
    env: { SVC_SECRET: 's3cret-0123456789abcdef' },
    resolvers: resolvers(p, (implement) => [
      ...remote(options(), [mine, total, add, signIn, hook]),
      implement(feed, () => new Response('')),
    ]),
  })
const last = () => seen.at(-1)!

describe('remote() resolvers (ADR 0068)', () => {
  it('posts the effect, its input and the session with the contract fingerprint and the secret', async () => {
    expect(await runtime().query(mine, {}, { user: 'ada' })).toEqual({
      ok: true,
      value: [{ id: 'n1', text: 'Tea' }],
    })
    expect(last().body).toEqual({
      effect: 'notes.mine',
      input: {},
      session: { user: 'ada' },
      preview: false,
      headers: {},
      files: {},
    })
    expect(last().headers['x-hozu-secret']).toBe('s3cret-0123456789abcdef')
    expect(last().headers['x-hozu-fingerprint']).toBe(
      remoteContract(build.ir, ['notes.mine', 'notes.total', 'notes.add', 'notes.signIn', 'notes.hook'])
        .fingerprint,
    )
  })

  it('never sends the session for public data (ADR 0005)', async () => {
    expect(await runtime().query(total, {}, { user: 'ada' })).toEqual({ ok: true, value: 3 })
    expect(last().body.session).toBeNull()
  })

  it('maps a declared error and a session change back to the runtime', async () => {
    expect(await runtime().mutate(add, { text: 'Tea' }, { user: 'ada' })).toMatchObject({
      ok: false,
      error: 'Duplicate',
      data: { text: 'Tea' },
    })
    const scope = runtime().scope(null)
    expect(await scope.run('notes.signIn', { name: 'ada' })).toMatchObject({ ok: true })
    expect(scope.written).toEqual({ value: { user: 'ada' } })
  })

  it('checks the answer against the output schema, so a wrong service fails closed', async () => {
    answers['notes.total'] = { body: { ok: 'three' } }
    expect(await runtime().query(total, {})).toMatchObject({ ok: false, error: 'Unexpected' })
    answers['notes.total'] = { status: 409, body: 'stale' }
    const stale = await runtime().query(total, {})
    expect(stale).toMatchObject({ ok: false, error: 'Unexpected' })
    expect(JSON.stringify(stale)).toContain('run hozu gen')
    answers['notes.total'] = { body: { ok: 3 } }
  })

  it('HZ093: a browser-run effect, a non-JSON endpoint or an undeclared env variable cannot be remote', () => {
    const codes = (list: Parameters<typeof remote>[1], o = options()) => {
      try {
        createDataRuntime({
          build,
          env: { SVC_SECRET: 's3cret-0123456789abcdef' },
          resolvers: resolvers(p, (implement) => [
            ...remote(o, list),
            ...[mine, total, add, signIn]
              .filter((d) => !list.includes(d))
              .map((d) => implement(d as typeof total, () => 0)),
            ...(list.includes(feed) ? [] : [implement(feed, () => new Response(''))]),
            ...(list.includes(hook) ? [] : [implement(hook, () => ({}))]),
          ]),
        })
        return []
      } catch (error) {
        return (error as DataRuntimeError).diagnostics.map((d) => `${d.code} ${d.message}`)
      }
    }
    expect(codes([inBrowser])).toEqual([
      "HZ093 notes.inBrowser runs: 'browser', so the browser runs it: only server effects are remote",
    ])
    expect(codes([feed])).toEqual([
      "HZ093 notes.feed answers output: 'response': only JSON endpoints are remote",
    ])
    expect(codes([total], { ...options(), url: { env: 'SVC_URL' } } as never)).toEqual([
      'HZ093 remote() reads SVC_URL, which project({ env: { server } }) does not declare',
    ])
  })

  it('HZ093: a remote() without a secret of 16 characters or more, since the service trusts the session it is sent', () => {
    const run = (o: object, secret: string) => {
      try {
        createDataRuntime({
          build,
          env: { SVC_SECRET: secret },
          resolvers: resolvers(p, (implement) => [
            ...remote(o as never, [mine, total, add, signIn, hook]),
            implement(feed, () => new Response('')),
          ]),
        })
        return []
      } catch (error) {
        return (error as DataRuntimeError).diagnostics.map((d) => d.message)
      }
    }
    const { secret: _, ...open } = options()
    expect(run(open, 's3cret-0123456789abcdef')).toEqual([
      'remote() has no secret, so anyone who reaches the service could call it with any session',
    ])
    expect(run(options(), 'short')).toEqual([
      'remote() secret SVC_SECRET holds 5 characters; it needs 16 or more',
    ])
  })

  it('a service may answer Forbidden for user data, as access would (ADR 0069 B8)', async () => {
    answers['notes.mine'] = { body: { fail: { name: 'Forbidden', data: { message: 'Staff only' } } } }
    expect(await runtime().query(mine, {}, { user: 'ada' })).toEqual({
      ok: false,
      error: 'Forbidden',
      data: { message: 'Staff only' },
    })
    answers['notes.mine'] = { body: { ok: [{ id: 'n1', text: 'Tea' }] } }
  })

  it("sends an endpoint's request headers without the cookie, and a mutation's uploads", async () => {
    const data = runtime().scope({ user: 'ada' })
    const request = new Request('http://app.test/api/hook', {
      method: 'POST',
      headers: { authorization: 'Bearer t0ken', cookie: 'hozu-session=abc' },
    })
    expect(await data.endpoint('notes.hook', {}, { request })).toMatchObject({ ok: true })
    expect(last().body.headers).toEqual({ authorization: 'Bearer t0ken' })
    const files = new Map([['f1', new File([new Uint8Array([104, 105])], 'hi.txt', { type: 'text/plain' })]])
    await data.run('notes.add', { text: 'Tea' }, files)
    expect(last().body.files).toEqual({ f1: { name: 'hi.txt', type: 'text/plain', size: 2, data: 'aGk=' } })
  })

  it('the fingerprint follows the declarations', () => {
    const before = remoteContract(build.ir, ['notes.add']).fingerprint
    const changed = buildProject(
      project({
        schema: zodAdapter,
        routes: {},
        pages: [],
        features: [
          feature({
            id: 'notes',
            intent: { summary: 'changed' },
            declarations: [
              {
                add: mutation({
                  input: z.object({ text: z.string(), pinned: z.boolean() }),
                  output: Note,
                  errors: { Duplicate: z.object({ text: z.string() }) },
                  runs: 'server',
                  access: 'anyone',
                }),
              },
            ],
          }),
        ],
      }),
    )
    expect(remoteContract(changed.ir, ['notes.add']).fingerprint).not.toBe(before)
    expect(remoteContract(build.ir, ['notes.add']).fingerprint).toBe(before)
  })
})
