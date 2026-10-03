import { mkdtempSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dev } from '@hozu/dev'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Cdp, findBrowser, launch } from '../../cli/src/cdp.ts'

const bookmarks = fileURLToPath(new URL('../../../examples/bookmarks/', import.meta.url))
const scratch = mkdtempSync(join(tmpdir(), 'hozu-devtools-api-'))

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = createServer().listen(0, () => {
      const { port } = s.address() as { port: number }
      s.close(() => resolve(port))
    })
  })

describe.skipIf(!findBrowser())('the DevTools API panel (ADR 0050 G)', () => {
  let server: Awaited<ReturnType<typeof dev>>
  let cdp: Cdp
  let session: string
  const errors: string[] = []
  const loads: (() => void)[] = []

  const evaluate = async (expression: string) => {
    const { result, exceptionDetails } = await cdp.send(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      session,
    )
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text)
    return result.value
  }
  const until = async (expression: string) => {
    for (let i = 0; i < 80; i++) {
      if (await evaluate(expression)) return
      await new Promise((r) => setTimeout(r, 50))
    }
    throw new Error(`Timed out: ${expression}`)
  }
  const open = async (path: string) => {
    const loaded = new Promise<void>((resolve) => loads.push(resolve))
    await cdp.send('Page.navigate', { url: `${server.url}${path}` }, session)
    await loaded
    await until(`!!document.querySelector('hozu-devtools')?.shadowRoot?.querySelector('.dock button')`)
  }
  const tool = (expression: string) =>
    evaluate(
      `(() => { const $ = (s) => document.querySelector('hozu-devtools').shadowRoot.querySelector(s); return ${expression} })()`,
    )

  beforeAll(async () => {
    server = await dev({
      cwd: bookmarks,
      requestsRoot: scratch,
      port: await freePort(),
      appPort: await freePort(),
      log: () => {},
    })
    cdp = launch(findBrowser()!, mkdtempSync(join(tmpdir(), 'hozu-devtools-chrome-')))
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
    session = (await cdp.send('Target.attachToTarget', { targetId, flatten: true })).sessionId
    cdp.on((method, params, from) => {
      if (from !== session) return
      if (method === 'Page.loadEventFired') loads.shift()?.()
      if (method === 'Runtime.exceptionThrown')
        errors.push(params.exceptionDetails?.exception?.description ?? 'error')
    })
    await cdp.send('Page.enable', {}, session)
    await cdp.send('Runtime.enable', {}, session)
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false },
      session,
    )
  }, 60_000)

  afterAll(async () => {
    await cdp?.close()
    await server?.close()
  })

  const shadowClick = (selector: string, text: string) =>
    tool(
      `[...document.querySelector('hozu-devtools').shadowRoot.querySelectorAll(${JSON.stringify(selector)})].find((b) => b.textContent.includes(${JSON.stringify(text)})).click()`,
    )

  it('lists the effects a page uses, with where they run, their schemas and their errors', async () => {
    const list = await (await fetch(`${server.url}/_hozu/dev/effects?path=/`)).json()
    expect(list.map((e: { ref: string; kind: string; runs: string }) => [e.ref, e.kind, e.runs])).toEqual([
      ['bookmarks.listBookmarks', 'query', 'server'],
      ['bookmarks.addBookmark', 'mutation', 'server'],
      ['bookmarks.toggleRead', 'mutation', 'server'],
    ])
    const add = list.find((e: { ref: string }) => e.ref === 'bookmarks.addBookmark')
    expect(add.errors).toEqual(['Duplicate', 'Invalid', 'Unexpected'])
    expect(Object.keys(add.input.properties)).toEqual(['title', 'kind'])
    expect(add.usedBy).toEqual(['bookmarks.adding'])
  })

  const api = (selector: string) =>
    `document.querySelector('hozu-devtools').shadowRoot.querySelector(${JSON.stringify(selector)})`
  const apiClick = (selector: string, text: string) =>
    tool(
      `[...document.querySelector('hozu-devtools').shadowRoot.querySelectorAll(${JSON.stringify(selector)})].find((b) => b.textContent.includes(${JSON.stringify(text)})).click()`,
    )

  it('runs a query from the bottom drawer and shows rows as a table', async () => {
    await open('/')
    await evaluate(`localStorage.clear()`)
    await open('/')
    await shadowClick('.dock button', 'API')
    await until(`!!${api('.api [data-effect="bookmarks.listBookmarks"]')}`)
    expect(await evaluate(`getComputedStyle(${api('.api')}).position`)).toBe('fixed')
    expect(await tool(`$('.api [data-effect="bookmarks.listBookmarks"] .api-runs').textContent`)).toBe(
      'server',
    )
    expect(await tool(`$('.api [data-effect="bookmarks.listBookmarks"] .api-where').textContent`)).toMatch(
      /^app\.ts:\d+$/,
    )
    await apiClick('.api [data-effect="bookmarks.listBookmarks"] button', 'Run')
    await until(`!!${api('.api-status.ok')}`)
    expect(await tool(`$('.api-status').textContent`)).toMatch(
      /^OK · \d+ ms · through the server · List bookmarks$/,
    )
    expect(await tool(`$('.api [data-effect="bookmarks.listBookmarks"] .api-kind').textContent`)).toBe('read')
    expect(await tool(`$('.api-sent summary').textContent`)).toMatch(
      /^POST.*\/_hozu\/query200\d+ ms · from this browser$/,
    )
    expect(await tool(`[...$('.api-table').querySelectorAll('thead th')].map((t) => t.textContent)`)).toEqual(
      ['id', 'title', 'kind', 'read'],
    )
  })

  it('asks in the drawer before a mutation, marks an invalid field, and refreshes the page in place', async () => {
    await apiClick('.api-tabs button', 'Changes')
    await until(`!!${api('.api [data-effect="bookmarks.addBookmark"]')}`)
    await tool(
      `(() => { const i = $('.api [data-effect="bookmarks.addBookmark"] input'); i.value = 'x'; i.dispatchEvent(new Event('input')) })()`,
    )
    await apiClick('.api [data-effect="bookmarks.addBookmark"] button', 'Run')
    expect(await tool(`$('.api-confirm').textContent`)).toContain('Writes your development data.')
    await apiClick('.api-confirm button', 'Run')
    await until(`!!${api('.api-invalid')}`)
    expect(await tool(`$('.api-invalid').textContent`)).toBe('Use at least 2 characters')
    expect(await tool(`$('.api-status').textContent`)).toContain('Declared error: Invalid')

    await tool(
      `(() => { const i = $('.api [data-effect="bookmarks.addBookmark"] input'); i.value = 'From the drawer'; i.dispatchEvent(new Event('input')) })()`,
    )
    await apiClick('.api [data-effect="bookmarks.addBookmark"] button', 'Run')
    await apiClick('.api-confirm button', 'Run')
    await until(`document.body.textContent.includes('From the drawer')`)
    expect(await tool(`$('.api-note').textContent`)).toBe(
      'Invalidated bookmarks.bookmarksTag · the page re-read it',
    )
    expect(await tool(`$('.api-tabs button:last-child').textContent`)).toBe('History3')

    await apiClick('.api [data-effect="bookmarks.addBookmark"] .api-switch', 'JSON')
    await tool(
      `(() => { const a = $('.api [data-effect="bookmarks.addBookmark"] textarea'); a.value = '{"title": 7}'; a.dispatchEvent(new Event('input')) })()`,
    )
    await apiClick('.api [data-effect="bookmarks.addBookmark"] button', 'Run')
    await apiClick('.api-confirm button', 'Run')
    await until(`${api('.api-tabs button:last-child')}.textContent === 'History4'`)
    expect(await tool(`$('.api-status').textContent`)).toContain('Declared error: Invalid')
    expect(errors).toEqual([])
  })

  it('draws history saved by an older DevTools', async () => {
    const key = `hozu-devtools-api:${new URL(server.url).host}`
    await open('/')
    const old = {
      id: 1,
      ref: 'bookmarks.listBookmarks',
      kind: 'query',
      runs: 'server',
      input: {},
      ok: true,
      error: null,
      value: [],
      ms: 3,
      where: 'server',
      tags: [],
      refreshed: false,
      at: 1,
    }
    await evaluate(
      `localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(JSON.stringify({ tab: 'history', view: 'table', height: 340, open: true, history: [old] }))})`,
    )
    await open('/')
    await until(`!!${api('.api-head')}`)
    expect(await tool(`$('.api-tabs button[aria-selected="true"]').textContent`)).toBe('History1')
    expect(await tool(`$('.api-status').textContent`)).toContain('OK · 3 ms')
    expect(errors).toEqual([])
  })

  it('opens the drawer from the Workbench too', async () => {
    await shadowClick('.dock button', 'Workbench')
    await until(`!!${api('.bench-bar')}`)
    expect(
      await tool(`[...$('.bench-bar').querySelectorAll('button')].some((b) => b.textContent === 'API')`),
    ).toBe(true)
    expect(await tool(`$('.api').hidden`)).toBe(false)
    await shadowClick('.bench-bar button', 'Exit workbench')
  })
})
