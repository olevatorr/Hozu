import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dev } from '@hozu/dev'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Cdp, findBrowser, launch } from '../../cli/src/cdp.ts'

const notes = fileURLToPath(new URL('../../../examples/studio/', import.meta.url))
const scratch = mkdtempSync(join(tmpdir(), 'hozu-devtools-requests-'))
const requests = join(scratch, '.hozu/requests')
const listed = () => (existsSync(requests) ? readdirSync(requests) : [])

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = createServer().listen(0, () => {
      const { port } = s.address() as { port: number }
      s.close(() => resolve(port))
    })
  })

describe.skipIf(!findBrowser())('Workbench in a real browser (ADR 0047 P3)', () => {
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
      cwd: notes,
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

  const inFrame = (expression: string) =>
    evaluate(
      `(() => { const d = document.querySelector('hozu-devtools').shadowRoot.querySelector('iframe').contentDocument; return ${expression} })()`,
    )
  const frameReady = () =>
    until(
      `(() => { const f = document.querySelector('hozu-devtools')?.shadowRoot?.querySelector('iframe'); return !!f?.contentDocument?.documentElement?.hasAttribute('data-hozu-ready') })()`,
    )

  it('opens the page in an exact-size frame with Layers on the left and the inspector on the right', async () => {
    await open('/')
    await evaluate(`localStorage.clear(); document.cookie = 'hozu-dev-state=; path=/; max-age=0'`)
    await open('/')
    await shadowClick('.dock .act', 'Workbench')
    await frameReady()
    expect(await tool(`$('iframe').style.width`)).toBe('390px')
    expect(await tool(`$('[data-size]').textContent`)).toMatch(/^390 × 844/)
    await until(`document.querySelector('hozu-devtools').shadowRoot.querySelector('.bench-left .layer')`)
    expect(await tool(`$('.panel .empty').textContent`)).toContain('Nothing selected')
    expect(await inFrame(`d.querySelector('hozu-devtools')`)).toBeNull()
  })

  it('selects inside the frame and records the frame size in the request', async () => {
    await shadowClick('.bench-bar .mode', 'Select')
    const { x, y } = await evaluate(`(() => {
      const f = document.querySelector('hozu-devtools').shadowRoot.querySelector('iframe')
      const b = [...f.contentDocument.querySelectorAll('button')].find((e) => e.textContent === 'Add task')
      const fr = f.getBoundingClientRect(), r = b.getBoundingClientRect(), s = fr.width / f.offsetWidth
      return { x: fr.x + (r.x + r.width / 2) * s, y: fr.y + (r.y + r.height / 2) * s }
    })()`)
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased'])
      await cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }, session)
    await until(
      `document.querySelector('hozu-devtools').shadowRoot.querySelector('.panel .title')?.textContent.startsWith('Button')`,
    )
    expect(await inFrame(`d.querySelectorAll('[aria-busy]').length`)).toBe(0)
    await tool(
      `(() => { const t = $('.panel textarea'); t.value = 'Bigger on phones'; t.dispatchEvent(new Event('input')); })()`,
    )
    await cdp.send('Browser.grantPermissions', {
      permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
      origin: server.url,
    })
    await shadowClick('.actions button', 'Copy for AI')
    await until(`document.querySelector('hozu-devtools').shadowRoot.querySelector('.status.ok')`)
    expect(await evaluate('navigator.clipboard.readText()')).toContain('Page `/` · 390 × 844')
  })

  it('switches devices, rotates, and previews a state inside the frame', async () => {
    await tool(
      `(() => { const s = $('.bench-bar select'); s.value = 'Laptop'; s.dispatchEvent(new Event('change')); })()`,
    )
    expect(await tool(`$('iframe').style.width`)).toBe('1280px')
    await shadowClick('.bench-bar .act', '⟲')
    expect(await tool(`[$('iframe').style.width, $('iframe').style.height]`)).toEqual(['800px', '1280px'])
    await tool(
      `[...document.querySelector('hozu-devtools').shadowRoot.querySelectorAll('.bench-left .state')].find((s) => s.textContent.startsWith('Confirming')).querySelector('button').click()`,
    )
    await new Promise((r) => setTimeout(r, 300))
    await frameReady()
    await until(
      `(() => { const d = document.querySelector('hozu-devtools').shadowRoot.querySelector('iframe').contentDocument; return d.body.innerText.includes('Remove “Preview text”?') })()`,
    )
    await until(`document.querySelector('hozu-devtools').shadowRoot.querySelector('.bench-bar .previewing')`)
    await tool(`$('.bench-bar .previewing').click()`)
    await new Promise((r) => setTimeout(r, 300))
    await frameReady()
    expect(await inFrame(`d.body.innerText.includes('Preview text')`)).toBe(false)
  })

  const frameClick = async (pick: string, mouse: 'mouseMoved' | 'click' = 'click') => {
    const { x, y } = await evaluate(`(() => {
      const f = document.querySelector('hozu-devtools').shadowRoot.querySelector('iframe')
      const el = (${pick})(f.contentDocument)
      const fr = f.getBoundingClientRect(), r = el.getBoundingClientRect(), s = fr.width / f.offsetWidth
      return { x: fr.x + (r.x + r.width / 2) * s, y: fr.y + (r.y + r.height / 2) * s }
    })()`)
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, session)
    if (mouse === 'click')
      for (const type of ['mousePressed', 'mouseReleased'])
        await cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }, session)
  }

  it('the hover label stays inside the frame next to its right edge', async () => {
    await tool(
      `(() => { const s = $('.bench-bar select'); s.value = 'Phone'; s.dispatchEvent(new Event('change')); })()`,
    )
    await frameReady()
    await shadowClick('.bench-bar .act', '⚙')
    await shadowClick('.option', 'Developer')
    await shadowClick('.bench-bar .mode', 'Select')
    await frameClick(
      `(d) => [...d.querySelectorAll('span')].find((e) => e.textContent === 'Sprint 12')`,
      'mouseMoved',
    )
    await until(
      `(() => { const d = document.querySelector('hozu-devtools').shadowRoot.querySelector('iframe').contentDocument; const t = d.querySelector('hozu-devtools-outline').shadowRoot.querySelector('.box:not([hidden]) .tag'); return t && t.textContent.includes('views.ts') })()`,
    )
    await new Promise((r) => setTimeout(r, 100))
    const [right, width] = await inFrame(
      `(() => { const t = d.querySelector('hozu-devtools-outline').shadowRoot.querySelector('.box:not([hidden]) .tag').getBoundingClientRect(); return [t.right, d.defaultView.innerWidth] })()`,
    )
    expect(right).toBeLessThanOrEqual(width)
    await shadowClick('.option', 'Builder')
  })

  it('resizing keeps following the pointer outside the stage, and stops on release', async () => {
    const at = await tool(
      `(() => { const r = $('.resize').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`,
    )
    const before = await tool(`$('iframe').offsetWidth`)
    await cdp.send(
      'Input.dispatchMouseEvent',
      { type: 'mousePressed', x: at.x, y: at.y, button: 'left', clickCount: 1 },
      session,
    )
    for (const dx of [20, 60, 120])
      await cdp.send(
        'Input.dispatchMouseEvent',
        { type: 'mouseMoved', x: at.x + dx, y: at.y, button: 'left', buttons: 1 },
        session,
      )
    await cdp.send(
      'Input.dispatchMouseEvent',
      { type: 'mouseMoved', x: 1420, y: at.y, button: 'left', buttons: 1 },
      session,
    )
    await cdp.send(
      'Input.dispatchMouseEvent',
      { type: 'mouseReleased', x: 1420, y: at.y, button: 'left', clickCount: 1 },
      session,
    )
    await new Promise((r) => setTimeout(r, 100))
    const after = (await tool(`$('iframe').offsetWidth`)) as number
    expect(after).toBeGreaterThan((before as number) + 100)
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 300, y: at.y }, session)
    await new Promise((r) => setTimeout(r, 100))
    expect(await tool(`$('iframe').offsetWidth`)).toBe(after)
    expect(await tool(`$('.bench-bar select').value`)).toBe('Custom')
  })

  it('a text can be replaced on the page to test long or other-language copy, and goes into the request', async () => {
    await tool(
      `(() => { const s = $('.bench-bar select'); s.value = 'Phone'; s.dispatchEvent(new Event('change')); })()`,
    )
    await frameClick(`(d) => [...d.querySelectorAll('button')].find((e) => e.textContent === 'Add task')`)
    await until(`document.querySelector('hozu-devtools').shadowRoot.querySelector('.chip-button')`)
    await tool(
      `[...document.querySelector('hozu-devtools').shadowRoot.querySelectorAll('.chip-button')].find((b) => b.textContent === '中文').click()`,
    )
    await until(
      `(() => { const d = document.querySelector('hozu-devtools').shadowRoot.querySelector('iframe').contentDocument; return [...d.querySelectorAll('button')].some((b) => b.textContent.startsWith('這是一段')) })()`,
    )
    await tool(
      `(() => { const i = $('input[aria-label="Text on the page"]'); i.value = '新增任務'; i.dispatchEvent(new Event('change')); })()`,
    )
    await until(
      `(() => { const d = document.querySelector('hozu-devtools').shadowRoot.querySelector('iframe').contentDocument; return [...d.querySelectorAll('button')].some((b) => b.textContent === '新增任務') })()`,
    )
    await shadowClick('.actions button', 'Copy for AI')
    await until(`navigator.clipboard.readText().then((t) => t.includes('- Text: “Add task” → “新增任務”'))`)
    await tool(
      `[...document.querySelector('hozu-devtools').shadowRoot.querySelectorAll('.chip-button')].find((b) => b.textContent === 'Reset').click()`,
    )
    await until(
      `(() => { const d = document.querySelector('hozu-devtools').shadowRoot.querySelector('iframe').contentDocument; return [...d.querySelectorAll('button')].some((b) => b.textContent === 'Add task') })()`,
    )
  })

  it('below 1100 px the Layers column folds into a toolbar button (ADR 0057 B4)', async () => {
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width: 1000, height: 800, deviceScaleFactor: 1, mobile: false },
      session,
    )
    try {
      const shown = () =>
        tool(
          `getComputedStyle(document.querySelector('hozu-devtools').shadowRoot.querySelector('.bench-left')).display`,
        )
      expect(await shown()).toBe('none')
      await shadowClick('.bench-bar .layers-toggle', 'Layers')
      await until(
        `getComputedStyle(document.querySelector('hozu-devtools').shadowRoot.querySelector('.bench-left')).display === 'block'`,
      )
      expect(await tool(`$('.bench-bar .layers-toggle').getAttribute('aria-pressed')`)).toBe('true')
    } finally {
      await cdp.send(
        'Emulation.setDeviceMetricsOverride',
        { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false },
        session,
      )
    }
  })

  it('Exit returns to the overlay on the same page', async () => {
    await shadowClick('.bench-bar .act', 'Exit workbench')
    await until(`!document.querySelector('hozu-devtools').shadowRoot.querySelector('iframe')`)
    expect(await tool(`$('.dock').hidden`)).toBe(false)
    expect(errors).toEqual([])
  })

  it('follows the system light or dark scheme, and a chosen appearance sticks', async () => {
    const scheme = (value: 'light' | 'dark') =>
      cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value }] }, session)
    const theme = () => tool(`$('.root').dataset.theme`)
    const surface = () => tool(`getComputedStyle($('.dock')).backgroundColor`)
    await scheme('light')
    await until(
      `document.querySelector('hozu-devtools').shadowRoot.querySelector('.root').dataset.theme === 'light'`,
    )
    expect(await surface()).toBe('rgb(251, 250, 247)')
    await scheme('dark')
    await until(
      `document.querySelector('hozu-devtools').shadowRoot.querySelector('.root').dataset.theme === 'dark'`,
    )
    expect(await surface()).toBe('rgb(17, 16, 16)')
    await shadowClick('.dock button', '⚙')
    await shadowClick('.tab', 'Light')
    await scheme('dark')
    expect(await theme()).toBe('light')
    await shadowClick('.tab', 'System')
    expect(await theme()).toBe('dark')
  })
})
