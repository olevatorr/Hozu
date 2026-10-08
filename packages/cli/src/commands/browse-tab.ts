import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import type { Cdp } from '../cdp.ts'
import type { BrowseError, BrowseMode, ServerError } from '../contract.ts'
import { HozuCliError } from '../errors.ts'
import { BuildFailed } from './app.ts'
import { PAGE } from './browse-page.ts'
import type { WorldReply, WorldRequest } from './browse-world.ts'

export const ORIGIN = 'http://localhost'
const QUIET_MS = 200
const SETTLE_MS = 500
const CAP_MS = 8000
const RETRY_MS = 20
const COUNTED = new Set(['Document', 'Fetch', 'XHR'])
const STILL = `!document.getAnimations().some((a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations !== Infinity)`
const READY = `(() => {
  const key = Symbol.for('hozu.browse.mutated')
  if (!window[key]) {
    window[key] = { at: performance.now() }
    new MutationObserver(() => { window[key].at = performance.now() })
      .observe(document, { subtree: true, childList: true, characterData: true, attributes: true })
    return false
  }
  return performance.now() - window[key].at >= ${QUIET_MS} &&
    (!document.getElementById('hozu-payload') || document.documentElement.hasAttribute('data-hozu-ready')) &&
    ${STILL}
})()`

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface Head {
  id: number
  status: number
  headers: [string, string][]
  stream: boolean
  body?: Uint8Array
}

/** One app world (module graph, data, session store) per mode, in its own worker. */
export class World {
  readonly cookies: Promise<(string | null)[]>
  readonly serverErrors: ServerError[] = []
  private readonly worker: Worker
  private next = 0
  private readonly heads = new Map<number, { resolve(h: Head): void; reject(e: Error): void }>()
  private readonly chunks = new Map<number, (chunk: string | null) => void>()

  constructor(config: string | undefined, cwd: string, sessions: (string | undefined)[]) {
    const self = fileURLToPath(import.meta.url)
    this.worker = new Worker(join(dirname(self), `browse-world${extname(self)}`), {
      workerData: { config, cwd, sessions },
    })
    this.cookies = new Promise((resolve, reject) => {
      this.worker.on('message', (m: WorldReply) => {
        if ('ready' in m) return resolve(m.cookies)
        if ('serverError' in m) return void this.serverErrors.push(m.serverError)
        if ('failed' in m) {
          const { code, message, suggestions, diagnostics } = m.failed
          return reject(
            diagnostics
              ? new BuildFailed(diagnostics as never)
              : new HozuCliError(code as never, message, suggestions),
          )
        }
        if ('chunk' in m) return this.chunks.get(m.id)?.(m.chunk)
        if ('end' in m) {
          this.chunks.get(m.id)?.(null)
          this.chunks.delete(m.id)
          return
        }
        const pending = this.heads.get(m.id)
        this.heads.delete(m.id)
        if ('error' in m) {
          this.chunks.get(m.id)?.(null)
          pending?.reject(new Error(m.error))
        } else pending?.resolve(m)
      })
      this.worker.once('error', (e) => reject(new HozuCliError('config', `hozu browse: ${e.message}`)))
    })
  }

  fetch(request: Omit<Extract<WorldRequest, { url: string }>, 'id'>, onChunk: (c: string | null) => void) {
    const id = ++this.next
    this.chunks.set(id, onChunk)
    return new Promise<Head>((resolve, reject) => {
      this.heads.set(id, { resolve, reject })
      this.worker.postMessage({ id, ...request } satisfies WorldRequest)
    })
  }

  cancel(id: number) {
    this.chunks.delete(id)
    this.worker.postMessage({ cancel: id } satisfies WorldRequest)
  }

  close() {
    return this.worker.terminate()
  }
}

class Live {
  frames: string[] = []
  waiting: { requestId: string; session: string } | null = null
  private buffer = ''
  readonly id: number
  private readonly fulfill: (requestId: string, session: string, body: string) => void
  constructor(id: number, fulfill: (requestId: string, session: string, body: string) => void) {
    this.id = id
    this.fulfill = fulfill
  }
  chunk(text: string) {
    this.buffer += text.replace(/\r\n?/g, '\n')
    const parts = this.buffer.split('\n\n')
    this.buffer = parts.pop() ?? ''
    for (const frame of parts)
      if (frame.split('\n').some((l) => l && !l.startsWith(':'))) this.frames.push(frame)
    this.flush()
  }
  wait(requestId: string, session: string) {
    this.waiting = { requestId, session }
    this.flush()
  }
  flush() {
    if (!this.waiting || !this.frames.length) return
    const { requestId, session } = this.waiting
    this.waiting = null
    this.fulfill(requestId, session, `retry: ${RETRY_MS}\n\n${this.frames.join('\n\n')}\n\n`)
    this.frames = []
  }
}

export interface Snapshot {
  url: string
  title: string
  text: string
  component: string[]
}

export interface StepResult {
  ok: boolean
  note: string | null
  jsOnly: string | null
}

const bodyOf = (request: { postData?: string; postDataEntries?: { bytes?: string }[] }) => {
  if (request.postDataEntries?.length)
    return new Uint8Array(
      Buffer.concat(request.postDataEntries.map((e) => Buffer.from(e.bytes ?? '', 'base64'))),
    )
  return request.postData === undefined ? null : new Uint8Array(Buffer.from(request.postData))
}

const pathOf = (url: string) => (url.startsWith(ORIGIN) ? url.slice(ORIGIN.length) || '/' : url)

/** One browser context and page for one actor in one mode. */
const pageAnswers = new Set([401, 403, 404, 410])
const viewTransitionAbortedByNonHtmlAnswer = /^InvalidStateError: Transition was aborted/

const FETCH_MODULE = /\/_hozu\/c\/fetch-(.+)-[A-Za-z0-9_]+\.js$/

/** The names a bundled ES module exports: `export { a as b }` lists and `export const|function|class` declarations. */
export function exportNames(source: string): string[] {
  const names = new Set<string>()
  for (const list of source.matchAll(/export\s*\{([^}]*)\}/g))
    for (const item of list[1]!.split(',')) {
      const name = item
        .trim()
        .split(/\s+as\s+/)
        .pop()
        ?.trim()
      if (name && /^[A-Za-z_$][\w$]*$/.test(name) && name !== 'default') names.add(name)
    }
  for (const d of source.matchAll(
    /export\s+(?:const|let|var|async\s+function|function|class)\s+([A-Za-z_$][\w$]*)/g,
  ))
    names.add(d[1]!)
  return [...names]
}

export class Tab {
  sessionId = ''
  targetId = ''
  status = 0
  loaded = false
  requested = false
  documentLoads = 0
  readonly held = new Set<string>()
  snapshot: Snapshot = { url: '', title: '', text: '', component: [] }
  private readonly holding: { networkId: string; answer: () => Promise<void> }[] = []
  private readonly heldIds = new Set<string>()
  readonly sessions = new Set<string>()
  private readonly prerender = new Set<string>()
  private readonly tracked = new Map<string, string>()
  private readonly urls = new Map<string, { url: string; type: string }>()
  private readonly live = new Map<string, Live>()
  private readonly invalidPosts = new Set<string>()
  private lastActivity = Date.now()
  private activity = 0
  private marked = 0
  private location = ''
  private prerendering = ''
  private readonly cdp: Cdp
  private readonly world: World
  readonly mode: BrowseMode
  readonly actor: string | null
  private readonly errors: BrowseError[]

  constructor(cdp: Cdp, world: World, mode: BrowseMode, actor: string | null, errors: BrowseError[]) {
    this.cdp = cdp
    this.world = world
    this.mode = mode
    this.actor = actor
    this.errors = errors
  }

  send(method: string, params: Record<string, unknown> = {}, session = this.sessionId) {
    return this.cdp.send(method, params, session)
  }

  async start(cookie: string | null, reducedMotion: boolean, viewport: { width: number; height: number }) {
    const { browserContextId } = await this.cdp.send('Target.createBrowserContext', {})
    const { targetId } = await this.cdp.send('Target.createTarget', { url: 'about:blank', browserContextId })
    this.targetId = targetId
    const { sessionId } = await this.cdp.send('Target.attachToTarget', { targetId, flatten: true })
    this.sessionId = sessionId
    this.sessions.add(sessionId)
    await this.enable(sessionId)
    await this.send('Page.enable')
    await this.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true })
    if (cookie) {
      const eq = cookie.indexOf('=')
      await this.send('Network.setCookie', {
        name: cookie.slice(0, eq),
        value: cookie.slice(eq + 1),
        url: ORIGIN,
        httpOnly: true,
      })
    }
    await this.send('Emulation.setDeviceMetricsOverride', {
      ...viewport,
      deviceScaleFactor: 1,
      mobile: viewport.width < 768,
    })
    if (reducedMotion)
      await this.send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
      })
    if (this.mode === 'off') await this.send('Emulation.setScriptExecutionDisabled', { value: true })
  }

  private async enable(session: string) {
    await this.send('Fetch.enable', { patterns: [{ urlPattern: `${ORIGIN}/*` }] }, session)
    await this.send('Network.enable', {}, session)
    await this.send('Runtime.enable', {}, session)
    await this.send('Log.enable', {}, session)
    if (session !== this.sessionId) await this.send('Page.enable', {}, session).catch(() => {})
  }

  private error(e: BrowseError, session: string) {
    const prerender = this.prerender.has(session)
    const url = e.url ?? (prerender ? this.prerendering : this.location)
    this.errors.push({
      ...e,
      ...(url ? { url } : {}),
      ...(prerender ? { type: `prerender ${e.type ?? ''}`.trim() } : {}),
      ...(this.actor === null ? {} : { actor: this.actor }),
      mode: this.mode,
    })
  }

  handle(method: string, params: any, session: string) {
    if (method === 'Target.attachedToTarget') {
      const child = params.sessionId as string
      this.sessions.add(child)
      if (params.targetInfo?.subtype === 'prerender' || params.targetInfo?.type === 'page')
        this.prerender.add(child)
      void this.enable(child)
        .catch(() => {})
        .then(() => this.send('Runtime.runIfWaitingForDebugger', {}, child).catch(() => {}))
      return true
    }
    if (method === 'Fetch.requestPaused') {
      void this.paused(params, session)
      return true
    }
    const main = session === this.sessionId
    if (method.startsWith('Network.')) {
      const id = params.requestId as string
      if (method === 'Network.requestWillBeSent') {
        const type = params.type ?? 'Other'
        this.urls.set(id, { url: params.request.url, type })
        if (type === 'EventSource') return true
        this.tracked.set(id, type)
        this.activity++
        if (main && COUNTED.has(type)) this.requested = true
      }
      if (!this.tracked.has(id)) return true
      this.lastActivity = Date.now()
      if (method === 'Network.loadingFinished') this.tracked.delete(id)
      if (method === 'Network.loadingFailed') {
        this.tracked.delete(id)
        const r = this.urls.get(id)
        const script = this.mode === 'off' && (params.type ?? r?.type) === 'Script'
        const blocked = params.blockedReason === 'inspector' || params.blockedReason === 'csp'
        if (!params.canceled && !blocked && !script)
          this.error(
            {
              kind: 'request',
              text: params.errorText || params.blockedReason || 'failed',
              at: r ? pathOf(r.url) : null,
              type: params.type ?? r?.type,
            },
            session,
          )
      }
      if (method === 'Network.responseReceived') {
        const url = pathOf(params.response.url)
        const type = params.type ?? 'Other'
        const page = main && type === 'Document' && params.frameId === this.targetId
        if (page) this.status = this.stepStatus = params.response.status
        const status = params.response.status as number
        const favicon = type === 'Other' && url === '/favicon.ico'
        const answered = this.opened && page && pageAnswers.has(status)
        if (status >= 400 && !answered && !this.invalidPosts.has(id) && !favicon)
          this.error(
            {
              kind: 'request',
              text: `${status} ${url}`,
              at: url,
              type,
              ...(type === 'Document' ? { url } : {}),
            },
            session,
          )
      }
      return true
    }
    if (method === 'Runtime.exceptionThrown') {
      const d = params.exceptionDetails
      const description: string = d.exception?.description ?? d.text ?? ''
      if (viewTransitionAbortedByNonHtmlAnswer.test(description)) return true
      const frame = d.stackTrace?.callFrames?.[0]
      this.error(
        {
          kind: 'exception',
          text: d.exception?.description?.split('\n')[0] ?? d.text,
          at: frame ? `${pathOf(frame.url)}:${frame.lineNumber + 1}` : (d.url ?? null),
          type: d.exception?.className ?? 'exception',
        },
        session,
      )
      return true
    }
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      const frame = params.stackTrace?.callFrames?.[0]
      this.error(
        {
          kind: 'console',
          text: params.args
            .map((a: any) =>
              a.value !== undefined ? String(a.value) : String(a.description ?? a.type).split('\n')[0],
            )
            .join(' '),
          at: frame ? `${pathOf(frame.url)}:${frame.lineNumber + 1}` : null,
          type: 'console.error',
        },
        session,
      )
      return true
    }
    if (method === 'Log.entryAdded') {
      const e = params.entry
      if (e.level === 'error' && !['network', 'javascript', 'console-api'].includes(e.source))
        this.error(
          {
            kind: 'console',
            text: e.text,
            at: e.url ? `${pathOf(e.url)}${e.lineNumber === undefined ? '' : `:${e.lineNumber + 1}`}` : null,
            type: e.source,
          },
          session,
        )
      return true
    }
    if (main && method === 'Page.frameRequestedNavigation' && params.frameId === this.targetId) {
      this.loaded = false
      this.activity++
    }
    if (main && method === 'Page.frameStartedLoading' && params.frameId === this.targetId) {
      this.loaded = false
      this.activity++
    }
    if (method === 'Page.frameNavigated' && !params.frame.parentId) {
      const url = new URL(params.frame.url)
      url.searchParams.delete('__hozu')
      if (main) {
        this.location = pathOf(url.href)
        this.documentLoads++
        for (const live of this.live.values()) this.world.cancel(live.id)
        this.live.clear()
      } else this.prerendering = pathOf(url.href)
    }
    if (main && method === 'Page.navigatedWithinDocument' && params.frameId === this.targetId) {
      this.location = pathOf(params.url)
      this.loaded = true
    }
    if (main && method === 'Page.loadEventFired') this.loaded = true
    return true
  }

  private fulfill(
    requestId: string,
    session: string,
    status: number,
    headers: { name: string; value: string }[],
    body: Uint8Array | string,
  ) {
    return this.send(
      'Fetch.fulfillRequest',
      {
        requestId,
        responseCode: status,
        responseHeaders: headers,
        body: Buffer.from(body).toString('base64'),
      },
      session,
    ).catch(() => {})
  }

  /** Headers added to every request this actor's tab makes (`--header`, ADR 0056 C). */
  headers: Record<string, string> = {}

  private async paused(params: any, session: string) {
    const r = params.request
    if (this.held.size && r.method === 'POST' && pathOf(r.url).endsWith('/_hozu/effect')) {
      const effect = (() => {
        try {
          return JSON.parse(Buffer.from(bodyOf(r) ?? new Uint8Array()).toString()).effect as string
        } catch {
          return null
        }
      })()
      if (effect && this.held.has(effect)) {
        const networkId = params.networkId ?? params.requestId
        this.heldIds.add(networkId)
        this.holding.push({ networkId, answer: () => this.answer(params, session) })
        return
      }
    }
    return this.answer(params, session)
  }

  /** Answers every effect call `hold` kept back, in order, and lets held browser effects run; how many there were. */
  async release(): Promise<number> {
    const all = this.holding.splice(0)
    this.held.clear()
    const waiting = await this.evaluate(
      '(() => { const n = globalThis.__hozuWaiting ?? 0; globalThis.__hozuWaiting = 0; globalThis.__hozuHeld?.clear(); return n })()',
    ).catch(() => 0)
    for (const h of all) {
      this.heldIds.delete(h.networkId)
      await h.answer()
    }
    return all.length + Number(waiting)
  }

  /** The moment a person's input happened: shifts within 500 ms of it are expected, as CLS counts them. */
  markInput() {
    return this.evaluate('globalThis.__hozuInputAt = performance.now()').catch(() => null)
  }

  /** Holds a browser-run effect on the page: its call waits until `release` (ADR 0065 A). */
  holdInPage(ref: string) {
    return this.evaluate(`(globalThis.__hozuHeld ??= new Set()).add(${JSON.stringify(ref)}), true`)
  }

  /** Serves a feature's fetch module through a wrapper whose exports wait while `hold` names them (ADR 0065 A). */
  private async holdable(params: any, session: string, feature: string): Promise<void> {
    const r = params.request
    const plain = {
      ...params,
      request: { ...r, url: `${r.url}${r.url.includes('?') ? '&' : '?'}hozu-original` },
    }
    try {
      const original = await this.world.fetch(
        { url: r.url, method: 'GET', headers: { ...r.headers, ...this.headers }, body: null },
        () => {},
      )
      if (original.status !== 200 || !original.body) return this.answer(plain, session)
      const from = JSON.stringify(`${pathOf(r.url).split('?')[0]}?hozu-original`)
      const shim = [
        `import * as __hozu$m from ${from}`,
        `export * from ${from}`,
        `const __hozu$held = (globalThis.__hozuHeld ??= new Set())`,
        `for (const n of ${JSON.stringify([...this.held])}) __hozu$held.add(n)`,
        `const __hozu$w = (n, f) => typeof f !== 'function' ? f : async (...a) => { if (globalThis.__hozuHeld?.has(n)) { globalThis.__hozuWaiting = (globalThis.__hozuWaiting ?? 0) + 1; while (globalThis.__hozuHeld?.has(n)) await new Promise((t) => setTimeout(t, 20)) } return f(...a) }`,
        ...exportNames(Buffer.from(original.body).toString()).map(
          (n) => `export const ${n} = __hozu$w(${JSON.stringify(`${feature}.${n}`)}, __hozu$m.${n})`,
        ),
      ].join('\n')
      const headers = original.headers
        .filter(([k]) => !['content-length', 'etag', 'cache-control', 'last-modified'].includes(k))
        .map(([name, value]) => ({ name, value }))
      return this.fulfill(
        params.requestId,
        session,
        200,
        [...headers, { name: 'cache-control', value: 'no-store' }],
        shim,
      )
    } catch (error) {
      this.error({ kind: 'request', text: `the app threw: ${String(error)}`, at: pathOf(r.url) }, session)
      await this.send(
        'Fetch.failRequest',
        { requestId: params.requestId, errorReason: 'Failed' },
        session,
      ).catch(() => {})
    }
  }

  /** Marks every element now on the page, so `smoothness` can count what a step replaced. */
  tagElements(): Promise<number> {
    return this.evaluate(`(() => {
      const s = Symbol.for('hozu.browse.seen')
      const g = globalThis
      if (!g.__hozuShiftObserver && typeof PerformanceObserver === 'function') {
        g.__hozuShiftObserver = new PerformanceObserver((list) => { for (const e of list.getEntries()) g.__hozuShifts.push(e) })
        try { g.__hozuShiftObserver.observe({ type: 'layout-shift' }) } catch {}
      }
      g.__hozuShiftObserver?.takeRecords()
      g.__hozuShifts = []
      g.__hozuInputAt = -Infinity
      g.__hozuSeen = []
      const chain = Symbol.for('hozu.browse.chain')
      for (const el of document.querySelectorAll('body *')) {
        const p = el.parentElement
        el[chain] = p === document.body || !p ? '' : (p[chain] ?? '') + '>' + p.tagName + '.' + (p.getAttribute('class') ?? '')
        el[s] = true
        el[Symbol.for('hozu.browse.parent')] = p
        g.__hozuSeen.push(el)
      }
      return g.__hozuSeen.length
    })()`)
  }

  /** How the page shown arrived: prerendered or loaded, and its first contentful paint after activation (ADR 0072 D3). */
  arrival(): Promise<{ prerendered: boolean; ms: number }> {
    return this.evaluate(`(() => {
      const n = performance.getEntriesByType('navigation')[0]
      const a = n?.activationStart ?? 0
      const paint = performance.getEntriesByType('paint').find((e) => e.name === 'first-contentful-paint')?.startTime
      return { prerendered: a > 0, ms: Math.round(Math.max(0, (paint ?? n?.domContentLoadedEventEnd ?? 0) - a)) }
    })()`)
  }

  /** What a step did to the page in place: new elements, elements rebuilt unchanged (flashes, ADR 0069 A3) and layout shift (ADR 0067 C2). */
  smoothness(): Promise<{ replaced: number; flashes: number; flashed: string[]; shift: number }> {
    return this.evaluate(`(() => {
      const s = Symbol.for('hozu.browse.seen')
      const chain = Symbol.for('hozu.browse.chain')
      const g = globalThis
      const KEYS = ['name', 'id', 'href', 'src', 'type']
      const own = (el) => el.tagName + '|' + (el.getAttribute('class') ?? '') + '|' + KEYS.map((k) => el.getAttribute(k) ?? '').join('|') + '|' + el.textContent.replace(/\\s+/g, ' ').trim()
      const sig = (el) => (el[chain] ?? '') + '#' + own(el)
      const parent = Symbol.for('hozu.browse.parent')
      const gone = new Map()
      for (const el of g.__hozuSeen ?? []) if (!el.isConnected) gone.set(sig(el), [...(gone.get(sig(el)) ?? []), el[parent]])
      let replaced = 0
      let flashes = 0
      const flashed = new Set()
      for (const el of document.querySelectorAll('body *')) {
        if (el[s]) continue
        replaced++
        const p = el.parentElement
        el[chain] = p === document.body || !p ? '' : (p[chain] ?? '') + '>' + p.tagName + '.' + (p.getAttribute('class') ?? '')
        const was = gone.get(sig(el)) ?? []
        const i = was.findIndex((q) => !q?.isConnected || q === p)
        if (i < 0) continue
        was.splice(i, 1)
        flashes++
        flashed.add(el)
      }
      const css = (v) => /^[\\w:/.-]+$/.test(v) ? v : JSON.stringify(v)
      const name = (el, last) => {
        const tag = el.tagName.toLowerCase()
        const id = el.getAttribute('id')
        if (id) return tag + '#' + css(id)
        const key = last ? ['name', 'href', 'src', 'type'].find((k) => el.hasAttribute(k)) : el.hasAttribute('name') ? 'name' : null
        if (key) return tag + '[' + key + '=' + css(el.getAttribute(key)) + ']'
        const cls = (el.getAttribute('class') ?? '').trim().split(/\\s+/)[0]
        return cls && last ? tag + '.' + css(cls) : tag
      }
      const path = (el) => {
        const parts = [name(el, true)]
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) parts.unshift(name(p, false))
        return (parts.length > 5 ? ['…', ...parts.slice(-4)] : parts).join(' > ')
      }
      const outer = [...flashed].filter((el) => !flashed.has(el.parentElement)).map(path)
      for (const e of g.__hozuShiftObserver?.takeRecords() ?? []) g.__hozuShifts.push(e)
      let shift = 0
      for (const e of g.__hozuShifts ?? []) if (!e.hadRecentInput && e.startTime > g.__hozuInputAt + 500) shift += e.value
      return { replaced, flashes, flashed: outer, shift: Math.round(shift * 1000) / 1000 }
    })()`)
  }

  private async answer(params: any, session: string): Promise<void> {
    const r = params.request
    const existing = r.method === 'GET' ? this.live.get(r.url) : undefined
    if (existing) return existing.wait(params.requestId, session)
    const module = r.method === 'GET' ? FETCH_MODULE.exec(pathOf(r.url).split('?')[0]!) : null
    if (module && !r.url.includes('hozu-original')) return this.holdable(params, session, module[1]!)
    let live: Live | null = null
    try {
      const head = await this.world.fetch(
        { url: r.url, method: r.method, headers: { ...r.headers, ...this.headers }, body: bodyOf(r) },
        (chunk) => {
          if (chunk !== null) live?.chunk(chunk)
        },
      )
      const headers = head.headers
        .filter(([k]) => k !== 'content-length')
        .map(([name, value]) => ({ name, value }))
      if (!head.stream) {
        if (head.status === 400 && r.method === 'POST' && params.resourceType === 'Document')
          this.invalidPosts.add(params.networkId ?? params.requestId)
        return this.fulfill(params.requestId, session, head.status, headers, head.body ?? new Uint8Array())
      }
      live = new Live(head.id, (id, s, body) => void this.fulfill(id, s, 200, headers, body))
      this.live.set(r.url, live)
      live.wait(params.requestId, session)
    } catch (error) {
      this.error({ kind: 'request', text: `the app threw: ${String(error)}`, at: pathOf(r.url) }, session)
      await this.send(
        'Fetch.failRequest',
        { requestId: params.requestId, errorReason: 'Failed' },
        session,
      ).catch(() => {})
    }
  }

  evaluate(expression: string) {
    return this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }).then(
      (r) => {
        if (r.exceptionDetails)
          throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
        return r.result.value
      },
    )
  }

  page(call: string) {
    return this.evaluate(`${PAGE}.${call}`)
  }

  /** The status of the page this step loaded, if it loaded one. */
  stepStatus: number | null = null
  /** After the start page: a page a step loads may answer 401, 403, 404 or 410 on purpose; the start page may not. */
  private opened = false

  mark() {
    this.stepStatus = null
    this.marked = this.activity
  }

  async settle() {
    const start = Date.now()
    while (this.activity === this.marked && Date.now() - start < SETTLE_MS) await sleep(25)
    while (Date.now() - start < CAP_MS) {
      const open = [...this.tracked.keys()].some((id) => !this.heldIds.has(id))
      if (!open && Date.now() - this.lastActivity >= QUIET_MS && this.loaded) {
        const ready = await this.evaluate(this.mode === 'off' ? STILL : READY).catch(() => false)
        if (ready) return
      }
      await sleep(50)
    }
  }

  async open(path: string) {
    this.loaded = false
    this.lastActivity = Date.now()
    this.mark()
    await this.send('Page.navigate', { url: ORIGIN + path })
    await this.settle()
    this.opened = true
  }

  async look(): Promise<Snapshot> {
    this.snapshot = await this.page('snapshot()').catch(() => this.snapshot)
    return this.snapshot
  }

  async mouse(x: number, y: number) {
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased'])
      await this.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 })
  }

  async key(name: string) {
    const key = KEYS[name] ?? {
      code: `Key${name.toUpperCase()}`,
      keyCode: name.toUpperCase().charCodeAt(0),
      text: name,
    }
    const base = { key: name === 'Space' ? ' ' : name, code: key.code, windowsVirtualKeyCode: key.keyCode }
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      ...base,
      ...(key.text ? { text: key.text } : {}),
    })
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base })
  }
}

const KEYS: Record<string, { code: string; keyCode: number; text?: string }> = {
  Enter: { code: 'Enter', keyCode: 13, text: '\r' },
  Escape: { code: 'Escape', keyCode: 27 },
  Tab: { code: 'Tab', keyCode: 9 },
  Backspace: { code: 'Backspace', keyCode: 8 },
  Space: { code: 'Space', keyCode: 32, text: ' ' },
  ArrowUp: { code: 'ArrowUp', keyCode: 38 },
  ArrowDown: { code: 'ArrowDown', keyCode: 40 },
  ArrowLeft: { code: 'ArrowLeft', keyCode: 37 },
  ArrowRight: { code: 'ArrowRight', keyCode: 39 },
}
