import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { type Cdp, findBrowser, launch } from '../cdp.ts'
import type { BrowseError, BrowseOutput, BrowseStep, BrowseWidget, RequestElement } from '../contract.ts'
import { HozuCliError } from '../errors.ts'
import type { Loaded } from '../load.ts'
import { appParts } from './request.ts'

const ORIGIN = 'http://localhost'
const LIMIT = 1500
const QUIET_MS = 300
const SETTLE_MS = 500
const CAP_MS = 8000

export interface BrowseOptions {
  path: string | undefined
  steps: string[]
  select: string[]
  screenshot: string | undefined
  reducedMotion: boolean
  session: string | undefined
  full: boolean
}

type Handler = { fetch(request: Request): Promise<Response> }

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.woff2': 'font/woff2',
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

const PAGE = String.raw`(() => {
  const norm = (s) => (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
  const shown = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 || r.height > 0 }
  const nameOf = (el) => {
    const aria = el.getAttribute('aria-label')
    if (aria) return aria
    const by = el.getAttribute('aria-labelledby')
    if (by) return by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ')
    if (el.labels && el.labels.length) return [...el.labels].map((l) => l.textContent).join(' ')
    if (el.tagName === 'INPUT' && ['submit', 'button'].includes(el.type)) return el.value
    if (el.placeholder) return el.placeholder
    if (el.getAttribute('title') && !el.textContent.trim()) return el.getAttribute('title')
    return el.textContent
  }
  const KINDS = {
    fill: 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]), textarea, [contenteditable=true]',
    select: 'select',
    check: 'input[type=checkbox], input[type=radio]',
    click: 'button, a[href], [role=button], [role=link], [role=tab], [role=option], [role=menuitem], [role=checkbox], [role=switch], input[type=submit], input[type=button], summary, [title], label',
  }
  const find = (kind, name) => {
    const all = [...document.querySelectorAll(KINDS[kind])].filter(shown)
    const want = norm(name)
    let hits = all.filter((el) => norm(nameOf(el)) === want || norm(el.getAttribute('title')) === want)
    if (!hits.length && kind === 'click')
      hits = [...document.body.querySelectorAll('*')].filter(
        (el) => shown(el) && norm(el.textContent) === want && ![...el.children].some((c) => norm(c.textContent) === want),
      )
    if (!hits.length) {
      const names = [...new Set(all.map((el) => (nameOf(el) ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean))]
      return { error: 'No ' + kind + ' target named "' + name + '"' + (names.length ? '. On the page: ' + names.slice(0, 20).map((n) => JSON.stringify(n.slice(0, 40))).join(', ') : '') }
    }
    return { el: hits[0], count: hits.length }
  }
  const setValue = (el, value) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    el.focus()
    if (el.isContentEditable) el.textContent = value
    else Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }
  const note = (count) => (count > 1 ? count + ' matched; used the first' : null)
  return {
    point(kind, name) {
      const f = find(kind, name)
      if (f.error) return f
      f.el.scrollIntoView({ block: 'center', inline: 'center' })
      const r = f.el.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, note: note(f.count) }
    },
    fill(name, value) {
      const f = find('fill', name)
      if (f.error) return f
      setValue(f.el, value)
      return { note: note(f.count) }
    },
    select(name, option) {
      const f = find('select', name)
      if (f.error) return f
      const o = [...f.el.options].find((o) => norm(o.textContent) === norm(option) || o.value === option)
      if (!o) return { error: 'Select "' + name + '" has no option "' + option + '". Options: ' + [...f.el.options].map((o) => JSON.stringify(o.textContent.trim())).join(', ') }
      setValue(f.el, o.value)
      return { note: note(f.count) }
    },
    report(selectors, expected) {
      const widgets = []
      const hydrated = document.documentElement.hasAttribute('data-hozu-ready')
      for (const el of document.querySelectorAll('[data-hozu-widget]')) {
        const name = el.getAttribute('data-hozu-widget')
        const state = el.getAttribute('data-hozu-widget-state')
        const load = expected.find(([n]) => n === name)?.[1]
        const r = el.getBoundingClientRect()
        const empty = !el.children.length && !el.textContent.trim()
        widgets.push({
          name,
          state: state === 'loading' ? 'not mounted' : state,
          width: Math.round(r.width),
          height: Math.round(r.height),
          canvases: el.querySelectorAll('canvas').length,
          elements: el.querySelectorAll('*').length,
          hint:
            state === 'failed'
              ? 'its setup threw; see errors'
              : state === 'loading'
                ? load === 'visible' && (r.bottom < 0 || r.top > innerHeight)
                  ? "load: 'visible' mounts it when it scrolls into view"
                  : load === 'idle'
                    ? "load: 'idle' mounts it when the browser is idle"
                    : 'its module has not loaded; see errors'
                : r.height === 0
                  ? 'it has no height, so a map or canvas inside shows nothing: give it a height class such as h-64'
                  : empty
                    ? 'it mounted but rendered nothing'
                    : null,
        })
      }
      if (!hydrated)
        for (const [name] of expected)
          widgets.push({
            name, state: 'not mounted', width: null, height: null, canvases: 0, elements: 0,
            hint: 'the page did not hydrate; see errors',
          })
      const elements = []
      for (const sel of selectors)
        for (const el of document.querySelectorAll(sel)) {
          const attrs = {}
          for (const a of el.attributes) attrs[a.name] = a.value
          const text = (el.innerText ?? el.textContent ?? '').replace(/\s+/g, ' ').trim()
          elements.push({ selector: sel, tag: el.tagName.toLowerCase(), attrs, text: text.length > 120 ? text.slice(0, 120) + '…' : text })
        }
      return {
        title: document.title,
        url: location.pathname + location.search,
        hydrated,
        text: (document.body?.innerText ?? '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim(),
        widgets,
        elements,
      }
    },
  }
})()`

async function bodyOf(request: { postData?: string; postDataEntries?: { bytes?: string }[] }) {
  if (request.postDataEntries?.length)
    return Buffer.concat(request.postDataEntries.map((e) => Buffer.from(e.bytes ?? '', 'base64')))
  return request.postData === undefined ? undefined : Buffer.from(request.postData)
}

export async function runBrowse(loaded: Loaded, options: BrowseOptions): Promise<BrowseOutput> {
  const path = options.path ?? '/'
  if (!path.startsWith('/')) throw new HozuCliError('usage', 'hozu browse needs a path', ['hozu browse /'])
  const browser = findBrowser()
  if (!browser)
    throw new HozuCliError('config', 'hozu browse needs Chrome, Chromium or Edge, and none was found', [
      'Install Google Chrome, or set HOZU_CHROME=/path/to/chrome',
    ])
  const parts = await appParts(loaded, 'browse', options.session)
  const root = dirname(loaded.path)
  const build = loaded.build(false) as any
  const server = await parts.importFrom<any>('@hozu/runtime-server', ['npm install @hozu/runtime-server'])
  const styles = await (await parts.importFrom<any>('@hozu/css', ['npm install @hozu/css'])).compileStyles(
    build,
    { base: root },
  )
  const used: string[] = server.usedWidgets(build.ir)
  const widgets = used.length
    ? await (await parts.importFrom<any>('@hozu/bundle', ['npm install @hozu/bundle'])).bundleWidgets(build)
    : null
  const handler: Handler = server.createHandler({
    build,
    styles,
    widgets,
    resolvers: parts.resolvers,
    session: parts.session,
    env: process.env,
  })
  const publicDir = join(root, 'public')
  const respond = async (request: Request): Promise<Response> => {
    const response = await handler.fetch(request)
    const file = join(publicDir, decodeURIComponent(new URL(request.url).pathname))
    if (response.status !== 404 || !file.startsWith(publicDir) || !existsSync(file)) return response
    return new Response(await readFile(file).catch(() => null), {
      headers: { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' },
    })
  }

  const profile = await mkdtemp(join(tmpdir(), 'hozu-browse-'))
  const cdp: Cdp = launch(browser, profile)
  const errors: BrowseError[] = []
  const steps: BrowseStep[] = []
  let status = 0
  let inflight = 0
  let lastActivity = Date.now()
  let loaded_ = false
  try {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
    const send = (method: string, params: Record<string, unknown> = {}) => cdp.send(method, params, sessionId)
    const documentUrls = new Set<string>()
    cdp.on((method, params, from) => {
      if (from !== sessionId) return
      if (method === 'Fetch.requestPaused') {
        const r = params.request
        void (async () => {
          try {
            const response = await respond(
              new Request(r.url, {
                method: r.method,
                headers: r.headers,
                ...(r.method === 'GET' || r.method === 'HEAD' ? {} : { body: (await bodyOf(r)) ?? null }),
              }),
            )
            const headers = [...response.headers]
              .filter(([k]) => k !== 'set-cookie')
              .map(([name, value]) => ({ name, value }))
            for (const c of response.headers.getSetCookie()) headers.push({ name: 'set-cookie', value: c })
            const body = Buffer.from(await response.arrayBuffer()).toString('base64')
            await send('Fetch.fulfillRequest', {
              requestId: params.requestId,
              responseCode: response.status,
              responseHeaders: headers,
              body,
            })
          } catch (error) {
            errors.push({ kind: 'request', text: `the app threw: ${String(error)}`, at: r.url })
            await send('Fetch.failRequest', { requestId: params.requestId, errorReason: 'Failed' }).catch(
              () => {},
            )
          }
        })()
      }
      if (method.startsWith('Network.')) lastActivity = Date.now()
      if (method === 'Network.requestWillBeSent') {
        inflight++
        if (params.type === 'Document') documentUrls.add(params.requestId)
      }
      if (method === 'Network.loadingFinished') inflight--
      if (method === 'Network.loadingFailed') {
        inflight--
        if (!params.canceled && params.blockedReason !== 'inspector')
          errors.push({ kind: 'request', text: params.errorText, at: null })
      }
      if (method === 'Network.responseReceived') {
        const url = params.response.url.startsWith(ORIGIN)
          ? params.response.url.slice(ORIGIN.length)
          : params.response.url
        if (documentUrls.has(params.requestId)) status = params.response.status
        if (params.response.status >= 400)
          errors.push({ kind: 'request', text: `${params.response.status} ${url}`, at: url })
      }
      if (method === 'Runtime.exceptionThrown') {
        const d = params.exceptionDetails
        const frame = d.stackTrace?.callFrames?.[0]
        errors.push({
          kind: 'exception',
          text: d.exception?.description?.split('\n')[0] ?? d.text,
          at: frame ? `${frame.url.replace(ORIGIN, '')}:${frame.lineNumber + 1}` : (d.url ?? null),
        })
      }
      if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
        const frame = params.stackTrace?.callFrames?.[0]
        errors.push({
          kind: 'console',
          text: params.args
            .map((a: any) =>
              a.value !== undefined ? String(a.value) : String(a.description ?? a.type).split('\n')[0],
            )
            .join(' '),
          at: frame ? `${frame.url.replace(ORIGIN, '')}:${frame.lineNumber + 1}` : null,
        })
      }
      if (method === 'Page.frameStartedLoading' && params.frameId === targetId) loaded_ = false
      if (method === 'Page.loadEventFired') loaded_ = true
    })
    await send('Fetch.enable', { patterns: [{ urlPattern: `${ORIGIN}/*` }] })
    await send('Network.enable')
    await send('Runtime.enable')
    await send('Page.enable')
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    })
    if (options.reducedMotion)
      await send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
      })

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
    const evaluate = async (expression: string) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (r.exceptionDetails)
        throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
      return r.result.value
    }
    const settle = async () => {
      const start = Date.now()
      await sleep(SETTLE_MS)
      while (Date.now() - start < CAP_MS) {
        if (inflight <= 0 && Date.now() - lastActivity >= QUIET_MS) {
          const ready = await evaluate(
            "!document.getElementById('hozu-payload') || document.documentElement.hasAttribute('data-hozu-ready')",
          ).catch(() => false)
          if (ready && loaded_) return
        }
        await sleep(50)
      }
    }
    const open = async (to: string) => {
      loaded_ = false
      lastActivity = Date.now()
      await send('Page.navigate', { url: ORIGIN + to })
      await settle()
    }
    const mouse = async (x: number, y: number) => {
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased'])
        await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 })
    }

    await open(path)
    const firstStatus = status
    for (const raw of options.steps) {
      const text = raw.trim()
      const space = text.indexOf(' ')
      const verb = space < 0 ? text : text.slice(0, space)
      const rest = space < 0 ? '' : text.slice(space + 1).trim()
      const pair = () => {
        const eq = rest.indexOf('=')
        if (eq <= 0) throw new Error(`"${text}" needs <label>=<value>`)
        return [rest.slice(0, eq).trim(), rest.slice(eq + 1)] as const
      }
      let result: { error?: string; note?: string | null } = {}
      try {
        if (verb === 'fill') {
          const [label, value] = pair()
          result = await evaluate(`${PAGE}.fill(${JSON.stringify(label)}, ${JSON.stringify(value)})`)
        } else if (verb === 'select') {
          const [label, value] = pair()
          result = await evaluate(`${PAGE}.select(${JSON.stringify(label)}, ${JSON.stringify(value)})`)
        } else if (verb === 'click' || verb === 'check') {
          const at = await evaluate(
            `${PAGE}.point(${JSON.stringify(verb === 'click' ? 'click' : 'check')}, ${JSON.stringify(rest)})`,
          )
          if (at.error) result = at
          else {
            await mouse(at.x, at.y)
            result = { note: at.note }
          }
        } else if (verb === 'press') {
          const key = KEYS[rest] ?? {
            code: `Key${rest.toUpperCase()}`,
            keyCode: rest.toUpperCase().charCodeAt(0),
            text: rest,
          }
          await send('Input.dispatchKeyEvent', {
            type: 'keyDown',
            key: rest,
            code: key.code,
            windowsVirtualKeyCode: key.keyCode,
            ...(key.text ? { text: key.text } : {}),
          })
          await send('Input.dispatchKeyEvent', {
            type: 'keyUp',
            key: rest,
            code: key.code,
            windowsVirtualKeyCode: key.keyCode,
          })
        } else if (verb === 'wait') {
          const ms = Number(rest)
          if (!Number.isFinite(ms) || ms < 0 || ms > 30000)
            throw new Error('wait takes milliseconds (0–30000)')
          await sleep(ms)
        } else if (verb === 'goto') {
          if (!rest.startsWith('/')) throw new Error('goto takes a path such as /items/1')
          await open(rest)
        } else
          throw new Error(
            `Unknown step "${verb}": use fill <label>=<value>, select <label>=<option>, check <label>, click <name>, press <key>, wait <ms>, goto <path>`,
          )
      } catch (error) {
        result = { error: error instanceof Error ? error.message : String(error) }
      }
      steps.push({ step: text, ok: !result.error, note: result.error ?? result.note ?? null })
      if (result.error) break
      if (verb !== 'wait' && verb !== 'goto') await settle()
    }
    for (const skipped of options.steps.slice(steps.length))
      steps.push({ step: skipped.trim(), ok: false, note: 'skipped after a failed step' })

    const expected = Object.entries(
      (await evaluate(
        "(() => { try { return JSON.parse(document.getElementById('hozu-payload')?.textContent ?? '{}').widgets ?? {} } catch { return {} } })()",
      )) as Record<string, { load: string }>,
    ).map(([name, w]) => [name, w.load])
    const report = await evaluate(
      `${PAGE}.report(${JSON.stringify(options.select)}, ${JSON.stringify(expected)})`,
    )
    let screenshot: string | null = null
    if (options.screenshot) {
      const shot = await send('Page.captureScreenshot', { format: 'png' })
      const file = resolve(options.screenshot)
      await writeFile(file, Buffer.from(shot.data, 'base64'))
      const near = relative(process.cwd(), file)
      screenshot = near && !near.startsWith('..') ? near : file
    }
    const full = report.text as string
    return {
      path,
      url: report.url,
      status: firstStatus,
      title: report.title,
      hydrated: report.hydrated,
      steps,
      errors,
      widgets: report.widgets as BrowseWidget[],
      text: full.length > LIMIT && !options.full ? `${full.slice(0, LIMIT)}…` : full,
      truncated: full.length > LIMIT && !options.full,
      elements: report.elements as RequestElement[],
      screenshot,
    }
  } finally {
    await cdp.close().catch(() => {})
    await rm(profile, { recursive: true, force: true }).catch(() => {})
  }
}

export const browseFailed = (out: BrowseOutput) =>
  out.errors.length > 0 || out.steps.some((s) => !s.ok) || out.widgets.some((w) => w.state === 'failed')

export function describeBrowse(out: BrowseOutput): string {
  const lines = [
    `BROWSE ${out.path} → ${out.status}${out.url !== out.path ? ` (now ${out.url})` : ''} · ${out.hydrated ? 'hydrated' : 'not hydrated'}`,
    `  title: ${out.title}`,
  ]
  for (const s of out.steps)
    lines.push(`  ${s.ok ? 'step' : 'FAILED'}: ${s.step}${s.note ? ` — ${s.note}` : ''}`)
  if (!out.errors.length) lines.push('  errors: none')
  for (const e of out.errors) lines.push(`  error (${e.kind}): ${e.text}${e.at ? ` at ${e.at}` : ''}`)
  for (const w of out.widgets)
    lines.push(
      `  widget ${w.name}: ${w.state}${w.width === null ? '' : ` ${w.width}×${w.height}`}${
        w.state === 'mounted' ? `, ${w.canvases} canvas, ${w.elements} elements` : ''
      }${w.hint ? ` — ${w.hint}` : ''}`,
    )
  lines.push(
    `  text: ${out.text.replace(/\n/g, ' · ')}${out.truncated ? ' (truncated; --full shows all)' : ''}`,
  )
  for (const e of out.elements)
    lines.push(
      `  ${e.selector}: <${e.tag}${Object.entries(e.attrs)
        .filter(([k]) => k !== 'class' && k !== 'style')
        .map(([k, v]) => (v === '' ? ` ${k}` : ` ${k}="${v}"`))
        .join('')}>${e.text ? ` ${e.text}` : ''}`,
    )
  if (out.screenshot) lines.push(`  screenshot: ${out.screenshot}`)
  return `${lines.join('\n')}\n`
}
