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
  const key = (code: string, key: string, modifiers: number) =>
    cdp
      .send('Input.dispatchKeyEvent', { type: 'keyDown', code, key, modifiers }, session)
      .then(() => cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key, modifiers }, session))
  const click = async (selector: string, modifiers = 0) => {
    const { x, y } = await evaluate(
      `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`,
    )
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, modifiers }, session)
    for (const type of ['mousePressed', 'mouseReleased'])
      await cdp.send(
        'Input.dispatchMouseEvent',
        { type, x, y, button: 'left', clickCount: 1, modifiers },
        session,
      )
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

  it('runs a query and, after a confirm, a mutation from the panel', async () => {
    await open('/')
    await evaluate(`localStorage.clear()`)
    await open('/')
    await shadowClick('.dock button', 'API')
    await until(
      `!!document.querySelector('hozu-devtools').shadowRoot.querySelector('[data-effect="bookmarks.listBookmarks"]')`,
    )
    expect(await tool(`$('.panel .title').textContent`)).toBe('API')
    expect(await tool(`$('[data-effect="bookmarks.listBookmarks"] summary').textContent`)).toContain(
      'List bookmarks',
    )
    await tool(`$('[data-effect="bookmarks.listBookmarks"]').open = true`)
    await shadowClick('[data-effect="bookmarks.listBookmarks"] button', 'Run')
    await until(
      `!!document.querySelector('hozu-devtools').shadowRoot.querySelector('[data-effect="bookmarks.listBookmarks"] .result')`,
    )
    expect(await tool(`$('[data-effect="bookmarks.listBookmarks"] .result .label').textContent`)).toMatch(
      /^OK · \d+ ms · through the server$/,
    )
    expect(await tool(`$('[data-effect="bookmarks.listBookmarks"] .result .value').textContent`)).toContain(
      'Closed-world UI',
    )

    await evaluate(`window.confirm = () => true`)
    await tool(`$('[data-effect="bookmarks.addBookmark"]').open = true`)
    await tool(
      `(() => { const i = $('[data-effect="bookmarks.addBookmark"] input'); i.value = 'From the panel'; i.dispatchEvent(new Event('input')) })()`,
    )
    await shadowClick('[data-effect="bookmarks.addBookmark"] button', 'writes your development data')
    await until(
      `!!document.querySelector('hozu-devtools').shadowRoot.querySelector('[data-effect="bookmarks.addBookmark"] .result')`,
    )
    expect(await tool(`$('[data-effect="bookmarks.addBookmark"] .result').textContent`)).toContain(
      'Invalidated bookmarks.bookmarksTag',
    )
    expect(await tool(`$('[data-effect="bookmarks.addBookmark"] .result .value').textContent`)).toContain(
      'From the panel',
    )
    expect(errors).toEqual([])
  })
})
