import { kvSessions, type SessionKV } from '@hozu/runtime-server'
import { describe, expect, it } from 'vitest'

const secret = 'kv-sessions-test-secret-0123456789abcdef'

function fakeKV() {
  const data = new Map<string, { value: string; ttl: number }>()
  const kv: SessionKV = {
    get: async (key) => data.get(key)?.value ?? null,
    put: async (key, value, { expirationTtl }) => void data.set(key, { value, ttl: expirationTtl }),
    delete: async (key) => void data.delete(key),
  }
  return { kv, data }
}

const withCookie = (setCookie: string) =>
  new Request('https://app.test/', { headers: { cookie: setCookie.split(';')[0]! } })

describe('kvSessions (ADR 0059 I)', () => {
  it('lets every instance read a session another one wrote, and sign-out removes it for all', async () => {
    const { kv, data } = fakeKV()
    const a = kvSessions(kv, { secret })
    const b = kvSessions(kv, { secret })
    const cookie = await a.write({ user: 'ada' })
    expect(cookie).toMatch(/^sid=[\w-]+\.[\w-]+; Path=\/; HttpOnly; SameSite=Lax; Secure; Max-Age=2592000$/)
    expect([...data.keys()]).toEqual([expect.stringMatching(/^session:/)])
    expect([...data.values()][0]!.ttl).toBe(2592000)
    expect(await b.read(withCookie(cookie))).toEqual({ user: 'ada' })
    expect(await b.write(null, withCookie(cookie))).toBe(
      'sid=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0',
    )
    expect(data.size).toBe(0)
    expect(await a.read(withCookie(cookie))).toBeNull()
  })

  it('keeps the value on the server and trusts only ids it signed', async () => {
    const { kv } = fakeKV()
    const store = kvSessions(kv, { secret, prefix: 'app:', name: 'who', secure: false, maxAge: 60 })
    const cookie = await store.write({ user: 'ada' })
    expect(cookie).not.toContain('ada')
    expect(cookie.endsWith('; Max-Age=60')).toBe(true)
    const [id] = cookie.slice('who='.length).split(';')[0]!.split('.')
    expect(
      await store.read(new Request('https://app.test/', { headers: { cookie: `who=${id}.forged` } })),
    ).toBeNull()
    expect(await kvSessions(kv, { secret: `${secret}-other` }).read(withCookie(cookie))).toBeNull()
    expect(() => kvSessions(kv, { secret: 'short' })).toThrow(
      'kvSessions secret must be at least 32 characters',
    )
  })

  it('keeps a value at least the 60 seconds Cloudflare KV allows, and reads a damaged one as signed out', async () => {
    const { kv, data } = fakeKV()
    const store = kvSessions(kv, { secret, maxAge: 30 })
    const cookie = await store.write({ user: 'ada' })
    expect(cookie.endsWith('; Max-Age=30')).toBe(true)
    expect([...data.values()][0]!.ttl).toBe(60)
    data.set([...data.keys()][0]!, { value: '{not json', ttl: 60 })
    expect(await store.read(withCookie(cookie))).toBeNull()
  })
})
