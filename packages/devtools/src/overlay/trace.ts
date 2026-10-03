/** An outgoing request recorded while a DevTools call ran: on the server (`/_hozu/dev/trace`) or in the page. */
export interface Traced {
  id: number
  side: 'server' | 'browser'
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

const recorders = new WeakSet<Window>()
let recording: Traced[] | null = null
let next = 1

/** Wraps the page's `fetch` once; it records only while a DevTools call runs. */
function record(win: Window) {
  if (recorders.has(win)) return
  recorders.add(win)
  const original = win.fetch.bind(win)
  win.fetch = async (input: Request | string | URL, init?: RequestInit) => {
    const into = recording
    const request = new Request(input, init)
    if (!into || new URL(request.url).pathname.startsWith('/_hozu/dev/')) return original(request)
    const entry: Traced = {
      id: next++,
      side: 'browser',
      method: request.method,
      url: request.url,
      requestHeaders: [...request.headers],
      requestBody: request.body
        ? await request
            .clone()
            .text()
            .catch(() => null)
        : null,
      status: null,
      responseHeaders: [],
      responseBody: null,
      ms: 0,
      error: null,
    }
    const started = performance.now()
    try {
      const response = await original(request)
      entry.status = response.status
      entry.responseHeaders = [...response.headers]
      entry.responseBody = await response
        .clone()
        .text()
        .then((t) => (t.length > 8_000 ? `${t.slice(0, 8_000)}…` : t))
        .catch(() => null)
      return response
    } catch (error) {
      entry.error = error instanceof Error ? error.message : String(error)
      throw error
    } finally {
      entry.ms = Math.round(performance.now() - started)
      into.push(entry)
    }
  }
}

const serverAfter = async (after: string): Promise<{ last: number; entries: Omit<Traced, 'side'>[] }> => {
  try {
    const r = await fetch(`/_hozu/dev/trace?after=${after}`)
    return r.ok ? r.json() : { last: 0, entries: [] }
  } catch {
    return { last: 0, entries: [] }
  }
}

/** Runs `task` and returns what it sent out: the page's requests and the server's. */
export async function traced<T>(
  win: Window,
  task: () => Promise<T>,
): Promise<{ value: T; requests: Traced[] }> {
  record(win)
  const { last } = await serverAfter('latest')
  const browser: Traced[] = []
  recording = browser
  try {
    const value = await task()
    const server = (await serverAfter(String(last))).entries.map((e) => ({ ...e, side: 'server' as const }))
    return { value, requests: [...browser, ...server] }
  } finally {
    recording = null
  }
}

const quote = (s: string) => `'${s.replace(/'/g, "'\\''")}'`
const skipped = new Set(['content-length', 'host', 'connection'])

/** The request as a curl command, to take it to a terminal, Postman or Bruno. */
export const curl = (r: Pick<Traced, 'method' | 'url' | 'requestHeaders' | 'requestBody'>) =>
  [
    `curl -X ${r.method} ${quote(r.url)}`,
    ...r.requestHeaders
      .filter(([k]) => !skipped.has(k.toLowerCase()))
      .map(([k, v]) => `-H ${quote(`${k}: ${v}`)}`),
    ...(r.requestBody ? [`--data-raw ${quote(r.requestBody)}`] : []),
  ].join(' \\\n  ')
