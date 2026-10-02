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

  const shadowClick = (selector: string, text: string) =>
    tool(
      `[...document.querySelector('hozu-devtools').shadowRoot.querySelectorAll(${JSON.stringify(selector)})].find((b) => b.textContent.includes(${JSON.stringify(text)})).click()`,
    )

  it('serves the theme: Tailwind defaults with the project @theme over them', async () => {
    const theme = await (await fetch(`${server.url}/_hozu/dev/theme`)).json()
    expect(theme.text['2xl']).toBe(24)
    expect(theme.spacing).toBe(4)
    expect(theme.colors['indigo-600']).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('selects a component use without running the app; Builder speaks plainly, Developer names the source', async () => {
    await open('/login')
    await evaluate(`localStorage.clear()`)
    await open('/login')
    await key('KeyS', 'S', 1 | 8)
    expect(await tool(`$('.mode[aria-pressed="true"]').textContent`)).toBe('Select')
    await click('button[type=submit]')
    await until(
      `document.querySelector('hozu-devtools').shadowRoot.querySelector('.panel:not([hidden]) .title')`,
    )
    expect(await tool(`$('.title').textContent`)).toBe('Button“Sign in”')
    expect(await tool(`$('.plain').textContent`)).toBe(
      'A shared Button: the same design is used in 6 places.',
    )
    expect(await tool(`$('legend').textContent`)).toBe('Change only this one, or every Button like it?')
    expect(await evaluate('location.pathname')).toBe('/login')
    await shadowClick('.dock button', '⚙')
    await until(
      `document.querySelector('hozu-devtools').shadowRoot.querySelector('.title')?.textContent === 'Settings'`,
    )
    await shadowClick('.option', 'Developer')
    await shadowClick('.dock button', '⚙')
    await until(
      `document.querySelector('hozu-devtools').shadowRoot.querySelector('.title')?.textContent === '<button>ui.Button'`,
    )
    expect(await tool(`$('.loc').textContent`)).toContain('features/account/views.ts:38:12')
    expect(await tool(`$('pre .on').textContent`)).toContain('ui.use(Button')
  })

  it('Alt+click goes to the parent, Shift+click adds, and Save copies the line to give the agent', async () => {
    await click('button[type=submit]', 1)
    await until(
      `document.querySelector('hozu-devtools').shadowRoot.querySelector('.title')?.textContent === '<form>'`,
    )
    await click('h1', 8)
    await until(
      `document.querySelectorAll && document.querySelector('hozu-devtools').shadowRoot.querySelectorAll('.picks button').length === 2`,
    )
    await tool(
      `(() => { const t = $('textarea'); t.value = 'Shorter heading'; t.dispatchEvent(new Event('input')); })()`,
    )
    await cdp.send('Browser.grantPermissions', {
      permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
      origin: server.url,
    })
    await shadowClick('.actions button', 'Save request')
    await until(`document.querySelector('hozu-devtools').shadowRoot.querySelector('.status.ok')`)
    const file = (await tool(`$('.status code').textContent`)) as string
    const saved = readFileSync(join(notes, file), 'utf8')
    expect(saved).toContain('# Hozu request: Shorter heading')
    expect(saved).toContain(
      '## 1. <form>\n- Want: (not described: ask the user what should change)\n- Where: `features/account/views.ts:19:10`',
    )
    expect(saved).toContain('`submit` sends `account.SignIn`')
    expect(saved).toContain('shared by 2 places')
    expect(saved).not.toContain('```')
    expect(await evaluate('navigator.clipboard.readText()')).toBe(`Do the Hozu request ${file}`)
  })

  it('a saved request opens, can be marked done and deleted', async () => {
    await shadowClick('.dock button', 'Requests')
    await until(`document.querySelector('hozu-devtools').shadowRoot.querySelector('.req')`)
    await shadowClick('.req', 'Shorter heading')
    await until(`document.querySelector('hozu-devtools').shadowRoot.querySelector('pre.md')`)
    expect(await tool(`$('pre.md').textContent`)).toContain('- Want: Shorter heading')
    await tool(`(() => { const i = $('input.outcome'); i.value = 'h1 is text-2xl'; })()`)
    await shadowClick('.finish button', 'Mark done')
    await until(
      `document.querySelector('hozu-devtools').shadowRoot.querySelector('.kicker')?.textContent.includes('done · h1 is text-2xl')`,
    )
    await shadowClick('.actions button', 'Delete')
    await shadowClick('.actions button', 'Click again to delete')
    await until(
      `(() => { const r = document.querySelector('hozu-devtools').shadowRoot; return r.querySelector('.title')?.textContent === 'Requests' && ![...r.querySelectorAll('.req')].some((b) => b.textContent.includes('Shorter heading')) })()`,
    )
    expect(listed().filter((f) => !before.has(f))).toEqual([])
  })

  it('a live style edit previews on the page and becomes the theme class to use', async () => {
    await click('h1')
    await until(
      `document.querySelector('hozu-devtools').shadowRoot.querySelector('.look select[aria-label="Text size"]')`,
    )
    expect(await evaluate(`getComputedStyle(document.querySelector('h1')).fontSize`)).toBe('30px')
    await tool(
      `(() => { const s = $('.look select[aria-label="Text size"]'); s.value = '48px'; s.dispatchEvent(new Event('change')); })()`,
    )
    await until(`getComputedStyle(document.querySelector('h1')).fontSize === '48px'`)
    await shadowClick('.actions button', 'Copy for AI')
    await until(`document.querySelector('hozu-devtools').shadowRoot.querySelector('.status.ok')`)
    const copied = (await evaluate('navigator.clipboard.readText()')) as string
    expect(copied).toContain('- Style: font size 30px → 48px: replace `text-3xl` with `text-5xl`')
    expect(readFileSync(join(notes, 'features/account/views.ts'), 'utf8')).toContain(
      "ui.h1({ class: 'text-3xl font-bold' }",
    )
    await shadowClick('.row-end button', 'Reset')
    await until(`getComputedStyle(document.querySelector('h1')).fontSize === '30px'`)
  })

  it('Escape returns to Browse; the page button shows its head', async () => {
    await key('Escape', 'Escape', 0)
    expect(await tool(`$('.mode[aria-pressed="true"]').textContent`)).toBe('Browse')
    await shadowClick('.dock .act', 'Page')
    await until(
      `document.querySelector('hozu-devtools').shadowRoot.querySelector('.kicker')?.textContent.startsWith('Page')`,
    )
    expect(await tool(`$('.title').textContent`)).toBe('Sign in')
    expect(errors).toEqual([])
  })
})
