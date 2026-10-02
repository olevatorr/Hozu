import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dev } from '@hozu/dev'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Cdp, findBrowser, launch } from '../../cli/src/cdp.ts'

const notes = fileURLToPath(new URL('../../../examples/notes/', import.meta.url))
const requests = join(notes, '.hozu/requests')
const listed = () => (existsSync(requests) ? readdirSync(requests) : [])
const before = new Set(listed())

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = createServer().listen(0, () => {
      const { port } = s.address() as { port: number }
      s.close(() => resolve(port))
    })
  })

describe.skipIf(!findBrowser())('DevTools in a real browser (ADR 0047 P2)', () => {
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
    server = await dev({ cwd: notes, port: await freePort(), appPort: await freePort(), log: () => {} })
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
    for (const f of listed()) if (!before.has(f)) rmSync(join(requests, f))
  })

  it('selects a component use without running the app, and the inspector names its source', async () => {
    await open('/login')
    await evaluate(`localStorage.clear()`)
    await open('/login')
    await key('KeyS', 'S', 1 | 8)
    expect(await tool(`$('.mode[aria-pressed="true"]').textContent`)).toBe('Select')
    await click('button[type=submit]')
    await until(
      `document.querySelector('hozu-devtools').shadowRoot.querySelector('.panel:not([hidden]) .title')`,
    )
    expect(await tool(`$('.title').textContent`)).toBe('<button>ui.Button')
    expect(await tool(`$('.loc').textContent`)).toContain('features/account/views.ts:38:12')
    expect(await tool(`$('pre .on').textContent`)).toContain('ui.use(Button')
    expect(await evaluate('location.pathname')).toBe('/login')
  })

  it('Alt+click goes to the parent, Shift+click adds, and the request is saved for the agent', async () => {
    await click('button[type=submit]', 1)
    await until(
      `document.querySelector('hozu-devtools').shadowRoot.querySelector('.title')?.textContent === '<form>'`,
    )
    await click('h1', 8)
    await until(
      `document.querySelector('hozu-devtools').shadowRoot.querySelectorAll('.picks button').length === 2`,
    )
    await tool(
      `(() => { const t = $('textarea'); t.value = 'Shorter heading'; t.dispatchEvent(new Event('input')); })()`,
    )
    await tool(
      `[...document.querySelector('hozu-devtools').shadowRoot.querySelectorAll('.actions button')].find((b) => b.textContent === 'Save request').click()`,
    )
    await until(`document.querySelector('hozu-devtools').shadowRoot.querySelector('.status.ok')`)
    const file = (await tool(`$('.status code').textContent`)) as string
    const saved = readFileSync(join(notes, file), 'utf8')
    expect(saved).toContain('# Hozu request: Shorter heading')
    expect(saved).toContain('`features/account/views.ts:19:10` — <form>')
    expect(saved).toContain('On `submit` it sends `account.SignIn`')
    expect(saved).toContain('used in 2 places')
  })

  it('Escape returns to Browse and the app works again; the page button shows its head', async () => {
    await key('Escape', 'Escape', 0)
    expect(await tool(`$('.mode[aria-pressed="true"]').textContent`)).toBe('Browse')
    await tool(
      `[...document.querySelector('hozu-devtools').shadowRoot.querySelectorAll('.dock .act')].find((b) => b.textContent === 'Page').click()`,
    )
    await until(
      `document.querySelector('hozu-devtools').shadowRoot.querySelector('.kicker')?.textContent.startsWith('Page')`,
    )
    expect(await tool(`$('.title').textContent`)).toBe('Sign in')
    expect(errors).toEqual([])
  })
})
