import type { IncomingMessage, ServerResponse } from 'node:http'
import { brotliCompressSync, constants, createBrotliCompress, createGzip, gzipSync } from 'node:zlib'

export type Encoding = 'br' | 'gzip'

const compressible =
  /^(text\/(html|css|javascript|plain|xml)|application\/(json|javascript|xml|manifest\+json)|image\/svg\+xml)\b/

/** The encoding to send, from the request's Accept-Encoding and the answer's type (ADR 0057 B1). */
export function encodingFor(request: IncomingMessage, type: string | null): Encoding | null {
  if (request.method === 'HEAD' || !type || !compressible.test(type)) return null
  const accepted = String(request.headers['accept-encoding'] ?? '')
    .split(',')
    .map((part) => part.trim().split(';'))
    .filter(([, q]) => !q || Number(q.trim().replace(/^q=/, '')) > 0)
    .map(([name]) => name!.trim().toLowerCase())
  return accepted.includes('br') ? 'br' : accepted.includes('gzip') ? 'gzip' : null
}

export const accepts = (request: IncomingMessage, name: Encoding) =>
  String(request.headers['accept-encoding'] ?? '')
    .toLowerCase()
    .split(',')
    .some((part) => {
      const [enc, q] = part.trim().split(';')
      return enc === name && (!q || Number(q.trim().replace(/^q=/, '')) > 0)
    })

export const varyOn = (vary: string | string[] | undefined): string => {
  const list = (Array.isArray(vary) ? vary.join(',') : (vary ?? ''))
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
  return list.some((v) => v.toLowerCase() === 'accept-encoding')
    ? list.join(', ')
    : [...list, 'Accept-Encoding'].join(', ')
}

export const compressWhole = (encoding: Encoding, body: Uint8Array): Buffer =>
  encoding === 'br'
    ? brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } })
    : gzipSync(body, { level: 9 })

/** A whole body, compressed once: files that never change are kept, up to `max` entries. */
export function compressedCache(max = 256) {
  const kept = new Map<string, Buffer>()
  return (key: string, encoding: Encoding, body: Uint8Array): Buffer => {
    const id = `${encoding} ${key}`
    const hit = kept.get(id)
    if (hit) return hit
    const out = compressWhole(encoding, body)
    if (kept.size >= max) kept.delete(kept.keys().next().value!)
    kept.set(id, out)
    return out
  }
}

/** A streamed body (a page): flushed whenever the stream waits, so streaming keeps its order and timing. */
export async function streamCompressed(
  response: ServerResponse,
  reader: ReadableStreamDefaultReader<Uint8Array>,
  encoding: Encoding,
) {
  const zip =
    encoding === 'gzip'
      ? createGzip({ level: 6 })
      : createBrotliCompress({ params: { [constants.BROTLI_PARAM_QUALITY]: 4 } })
  const flushing = encoding === 'gzip' ? constants.Z_SYNC_FLUSH : constants.BROTLI_OPERATION_FLUSH
  zip.pipe(response)
  response.on('close', () => void reader.cancel().catch(() => {}))
  let idle: ReturnType<typeof setImmediate> | null = null
  for (;;) {
    const { done, value } = await reader.read()
    if (idle) clearImmediate(idle)
    idle = null
    if (done) break
    zip.write(value)
    idle = setImmediate(() => zip.flush(flushing))
  }
  zip.end()
}
