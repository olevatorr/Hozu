/** An outgoing request made while developing (ADR 0050 G): what an effect really sent and got back. */
export interface TraceEntry {
  id: number
  method: string
  url: string
  requestHeaders: [string, string][]
  requestBody: string | null
  status: number | null
  responseHeaders: [string, string][]
  responseBody: string | null
  ms: number
  error: string | null
}

const LIMIT = 200
const BODY = 8_000
const entries: TraceEntry[] = []
let next = 1
let installed = false

const cut = (text: string | null) =>
  text === null ? null : text.length > BODY ? `${text.slice(0, BODY)}… (${text.length} characters)` : text

const textual = (type: string | null) => !type || /json|text|xml|urlencoded|javascript/.test(type)

/** Wraps `fetch` once, in development only, keeping the last 200 outgoing requests. */
export function traceFetch() {
  if (installed) return
  installed = true
  const original = globalThis.fetch
  globalThis.fetch = async (input: Request | string | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    const entry: TraceEntry = {
      id: next++,
      method: request.method,
      url: request.url,
      requestHeaders: [...request.headers],
      requestBody: request.body
        ? cut(
            await request
              .clone()
              .text()
              .catch(() => null),
          )
        : null,
      status: null,
      responseHeaders: [],
      responseBody: null,
      ms: 0,
      error: null,
    }
    const started = performance.now()
    const done = () => {
      entry.ms = Math.round(performance.now() - started)
      entries.push(entry)
      if (entries.length > LIMIT) entries.shift()
    }
    let response: Response
    try {
      response = await original(request)
    } catch (error) {
      entry.error = error instanceof Error ? error.message : String(error)
      done()
      throw error
    }
    entry.status = response.status
    entry.responseHeaders = [...response.headers]
    done()
    void capture(response.clone()).then((body) => {
      entry.responseBody = body
    })
    return response
  }
}

/** At most BODY characters of a textual body, read beside the caller; a stream is never waited for. */
async function capture(response: Response): Promise<string | null> {
  const type = response.headers.get('content-type')
  if (!textual(type) || /event-stream/.test(type ?? '')) {
    void response.body?.cancel().catch(() => {})
    return `(${type ?? 'body'})`
  }
  const reader = response.body?.getReader()
  if (!reader) return null
  const decoder = new TextDecoder()
  let text = ''
  try {
    while (text.length <= BODY) {
      const { done, value } = await reader.read()
      if (done) break
      text += decoder.decode(value, { stream: true })
    }
  } catch {
    return cut(text) || null
  }
  void reader.cancel().catch(() => {})
  return cut(text)
}

/** The requests after `after` (an id), and the last id so far. */
export const traced = (after: number) => ({ last: next - 1, entries: entries.filter((e) => e.id > after) })
