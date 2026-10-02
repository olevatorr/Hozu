/**
 * Carries invalidated tags between the instances of one app (ADR 0050 B). Tags, never data: an instance that
 * receives tags drops its own pages and entries and pushes to its own live clients. Delivery is at least once and
 * unordered; dropping a tag twice is harmless.
 */
export interface InvalidationBus {
  publish(tags: string[]): void | Promise<void>
  subscribe(onTags: (tags: string[]) => void): () => void
  /** For a transport that receives over the app's own HTTP: answers `POST /_hozu/invalidate`. */
  accept?(request: Request): Promise<Response>
}

/** One process: nothing to tell. */
export function localBus(): InvalidationBus {
  return { publish: () => {}, subscribe: () => () => {} }
}

export interface HttpBusOptions {
  /** The base URL of every instance, including this one and the app's base path: `http://10.0.0.2:3000`. */
  peers: string[]
  /** Shared by every instance; at least 32 characters. */
  secret: string
  /** Reports a peer that stayed unreachable after the retries. */
  onError?: (error: unknown, peer: string) => void
  /** Delays between attempts, in milliseconds. */
  retries?: number[]
  fetch?: typeof fetch
  now?: () => number
}

const WINDOW_MS = 30_000
const encoder = new TextEncoder()

const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')

/**
 * Signed `POST /_hozu/invalidate` to every peer (HMAC-SHA256 over the body, which carries a timestamp; messages
 * older than 30 s or from the future are refused). Zero dependencies: Web Crypto and `fetch`.
 */
export function httpBus({
  peers,
  secret,
  onError = (error, peer) => console.error('[hozu] invalidation bus:', peer, error),
  retries = [100, 1_000],
  fetch: send = fetch,
  now = Date.now,
}: HttpBusOptions): InvalidationBus {
  if (secret.length < 32) throw new Error('httpBus needs a secret of at least 32 characters')
  const id = crypto.randomUUID()
  const key = crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
  const sign = async (body: string) => hex(await crypto.subtle.sign('HMAC', await key, encoder.encode(body)))
  const listeners = new Set<(tags: string[]) => void>()
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

  async function deliver(peer: string, body: string, signature: string) {
    const url = `${peer.replace(/\/$/, '')}/_hozu/invalidate`
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await send(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-hozu-signature': signature },
          body,
        })
        if (response.ok) return
        throw new Error(`${url} answered ${response.status}`)
      } catch (error) {
        const delay = retries[attempt]
        if (delay === undefined) return onError(error, peer)
        await wait(delay)
      }
    }
  }

  return {
    async publish(tags) {
      if (!tags.length) return
      const body = JSON.stringify({ tags, at: now(), from: id })
      const signature = await sign(body)
      await Promise.all(peers.map((peer) => deliver(peer, body, signature)))
    },
    subscribe(onTags) {
      listeners.add(onTags)
      return () => listeners.delete(onTags)
    },
    async accept(request) {
      if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } })
      const body = await request.text()
      const signature = request.headers.get('x-hozu-signature') ?? ''
      const given = new Uint8Array(signature.match(/../g)?.map((b) => Number.parseInt(b, 16)) ?? [])
      const valid =
        /^[0-9a-f]{64}$/.test(signature) &&
        (await crypto.subtle.verify('HMAC', await key, given, encoder.encode(body)))
      if (!valid) return new Response('Invalid signature', { status: 403 })
      const message = JSON.parse(body) as { tags: string[]; at: number; from: string }
      if (Math.abs(now() - message.at) > WINDOW_MS) return new Response('Expired message', { status: 403 })
      if (message.from !== id) for (const listener of listeners) listener(message.tags)
      return new Response(null, { status: 204 })
    },
  }
}
