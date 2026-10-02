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
    for (const f of listed()) if (!before.has(f) && f !== '.next') rmSync(join(requests, f))
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

  it('Alt+click goes to the parent; described parts stay when the next one is clicked', async () => {
    await click('button[type=submit]', 1)
    await until(
      `document.querySelector('hozu-devtools').shadowRoot.querySelector('.title')?.textContent === '<form>'`,
    )
    await tool(
      `(() => { const t = $('textarea'); t.value = 'Clear the name after signing in'; t.dispatchEvent(new Event('input')); })()`,
    )
    await click('h1')
    await until(
      `document.querySelector('hozu-devtools').shadowRoot.querySelector('.title')?.textContent === '<h1>'`,
    )
    await tool(
      `(() => { const t = $('textarea'); t.value = 'Shorter heading'; t.dispatchEvent(new Event('input')); })()`,
    )
    await click('label')
    await until(
      `document.querySelector('hozu-devtools').shadowRoot.querySelectorAll('.picks button').length === 3`,
    )
    await click('h1')
    await until(
      `document.querySelector('hozu-devtools').shadowRoot.querySelectorAll('.picks button').length === 2`,
    )
    expect(await tool(`$('.dock [data-count]').textContent`)).toBe('2')
    expect(await tool(`$('.more').textContent`)).toContain('1 other change')
  })

  it('Copy and Save send every described part as one request; Save clears it and copies the line for the agent', async () => {
    await cdp.send('Browser.grantPermissions', {
      permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
      origin: server.url,
    })
    await shadowClick('.actions button', 'Copy for AI (2)')
    await until(`document.querySelector('hozu-devtools').shadowRoot.querySelector('.status.ok')`)
    const copied = (await evaluate('navigator.clipboard.readText()')) as string
    expect(copied).toContain('## 1. <form>\n- Want: Clear the name after signing in')
    expect(copied).toContain('## 2. <h1>\n- Want: Shorter heading')
    await shadowClick('.actions button', 'Save request (2)')
    await until(`document.querySelector('hozu-devtools').shadowRoot.querySelector('.notice code')`)
    const file = (await tool(`$('.notice code').textContent`)) as string
    const saved = readFileSync(join(notes, file), 'utf8')
    expect(saved).toContain('# Hozu request: Clear the name after signing in + 1 more')
    expect(saved).toContain('`submit` sends `account.SignIn`')
    expect(saved).toContain('## 2. <h1>')
    expect(saved).not.toContain('```')
    expect(await evaluate('navigator.clipboard.readText()')).toBe(`Do the Hozu request ${file}`)
    expect(await tool(`$('.dock [data-count]').textContent`)).toBe('')
    expect(
      await evaluate(
        `document.querySelector('hozu-devtools-outline').shadowRoot.querySelectorAll('.frame.selected').length`,
      ),
    ).toBe(0)
  })

  it('the saved list copies one line for the agent or all as one prompt, and Done on a row removes it', async () => {
    await shadowClick('.req .open-req', 'Clear the name after signing in + 1 more')
    await until(`document.querySelector('hozu-devtools').shadowRoot.querySelector('pre.md')`)
    expect(await tool(`$('pre.md').textContent`)).toContain('- Want: Shorter heading')
    await shadowClick('.back', 'Saved')
    await until(`document.querySelector('hozu-devtools').shadowRoot.querySelector('.req')`)
    const ours = (await tool(
      `[...document.querySelector('hozu-devtools').shadowRoot.querySelectorAll('.req')].find((r) => r.textContent.includes('Clear the name')).querySelector('.n').textContent`,
    )) as string
    await shadowClick('.choice button', 'Copy file paths only')
    await until(`document.querySelector('hozu-devtools').shadowRoot.querySelector('.status.ok')`)
    const line = (await evaluate('navigator.clipboard.readText()')) as string
    expect(line).toMatch(new RegExp(`^Do the open Hozu requests: .*\\.hozu/requests/${ours}-clear-the-name`))
    await shadowClick('.choice button', 'for AI')
    await until(`navigator.clipboard.readText().then((t) => t.startsWith('# Hozu requests: '))`)
    const prompt = (await evaluate('navigator.clipboard.readText()')) as string
    expect(prompt).toContain(`# Hozu request ${ours}: Clear the name after signing in + 1 more`)
    expect(prompt).toContain('When one is done: `hozu requests done <n>')
    const done = `[...document.querySelector('hozu-devtools').shadowRoot.querySelectorAll('.req')].find((r) => r.textContent.includes('Clear the name')).querySelector('.done')`
    await tool(`${done}.click()`)
    expect(await tool(`${done}.textContent`)).toBe('Remove?')
    await tool(`${done}.click()`)
    await until(
      `![...document.querySelector('hozu-devtools').shadowRoot.querySelectorAll('.req')].some((r) => r.textContent.includes('Clear the name'))`,
    )
    expect(listed().filter((f) => !before.has(f) && f !== '.next')).toEqual([])
  })

  it('Browse hides the selection outlines and Select shows them again', async () => {
    await click('h1')
    await until(
      `document.querySelector('hozu-devtools-outline').shadowRoot.querySelector('.frame.selected:not([hidden])')`,
    )
    await key('Escape', 'Escape', 0)
    await until(
      `!document.querySelector('hozu-devtools-outline').shadowRoot.querySelector('.frame.selected:not([hidden])')`,
    )
    await key('KeyS', 'S', 1 | 8)
    await until(
      `document.querySelector('hozu-devtools-outline').shadowRoot.querySelector('.frame.selected:not([hidden])')`,
    )
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

  it('outlines sit 2px outside the element', async () => {
    await key('KeyS', 'S', 1 | 8)
    await click('h1')
    await until(
      `document.querySelector('hozu-devtools').shadowRoot.querySelector('.panel:not([hidden]) .title')`,
    )
    const [frame, el] = await evaluate(`(() => {
      const f = document.querySelector('hozu-devtools-outline').shadowRoot.querySelector('.frame.selected').getBoundingClientRect()
      const e = document.querySelector('h1').getBoundingClientRect()
      return [[f.x, f.y, f.width, f.height], [e.x - 2, e.y - 2, e.width + 4, e.height + 4]]
    })()`)
    expect(frame).toEqual(el)
    await key('Escape', 'Escape', 0)
  })

  it('Layers lists the parts and previews the states that are not on screen', async () => {
    await evaluate(
      `(() => { const i = document.querySelector('input[name=name]'); i.value = 'devtools'; i.form.requestSubmit(); })()`,
    )
    await until(
      `location.pathname === '/' && !!document.querySelector('hozu-devtools')?.shadowRoot?.querySelector('.dock button')`,
    )
    await until(`document.documentElement.hasAttribute('data-hozu-ready')`)
    await shadowClick('.dock .act', 'Layers')
    await until(`document.querySelector('hozu-devtools').shadowRoot.querySelector('.layer')`)
    const states = (await tool(
      `[...document.querySelector('hozu-devtools').shadowRoot.querySelectorAll('.state span')].map((s) => s.textContent)`,
    )) as string[]
    expect(states).toEqual(expect.arrayContaining(['Adding', 'Loading list notes']))
    await shadowClick('.state', 'Loading list notes')
    const reloaded = new Promise<void>((resolve) => loads.push(resolve))
    await tool(
      `[...document.querySelector('hozu-devtools').shadowRoot.querySelectorAll('.state')].find((s) => s.textContent.includes('Loading list notes')).querySelector('button').click()`,
    )
    await reloaded
    await until(`document.documentElement.hasAttribute('data-hozu-ready')`)
    expect(await evaluate(`document.body.innerText.includes('Loading…')`)).toBe(true)
    await new Promise((r) => setTimeout(r, 400))
    expect(await evaluate(`document.body.innerText.includes('Loading…')`)).toBe(true)
    await until(
      `document.querySelector('hozu-devtools').shadowRoot.querySelector('.previewing')?.textContent.includes('Loading list notes')`,
    )
    const back = new Promise<void>((resolve) => loads.push(resolve))
    await tool(`$('.previewing').click()`)
    await back
    await until(`document.documentElement.hasAttribute('data-hozu-ready')`)
    expect(await evaluate(`document.body.innerText.includes('Loading…')`)).toBe(false)
    expect(await tool(`$('.previewing')`)).toBeNull()
  })

  it('a machine state preview starts the island in that state without running its effect', async () => {
    await evaluate(
      `document.cookie = 'hozu-dev-state=' + encodeURIComponent(JSON.stringify({ feature: 'notes', state: 'adding' })) + '; path=/'`,
    )
    const reloaded = new Promise<void>((resolve) => loads.push(resolve))
    await evaluate('location.reload()')
    await reloaded
    await until(`document.documentElement.hasAttribute('data-hozu-ready')`)
    expect(await evaluate(`!!document.querySelector('[aria-busy="true"]')`)).toBe(true)
    await new Promise((r) => setTimeout(r, 400))
    expect(await evaluate(`!!document.querySelector('[aria-busy="true"]')`)).toBe(true)
    await evaluate(`document.cookie = 'hozu-dev-state=; path=/; max-age=0'`)
    expect(errors).toEqual([])
  })

  it('the logo folds the dock to itself and opens it again; dragging it does not fold', async () => {
    const at = async () =>
      evaluate(
        `(() => { const r = document.querySelector('hozu-devtools').shadowRoot.querySelector('.grip').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`,
      )
    const press = async (moveBy = 0) => {
      const { x, y } = await at()
      await cdp.send(
        'Input.dispatchMouseEvent',
        { type: 'mousePressed', x, y, button: 'left', clickCount: 1 },
        session,
      )
      if (moveBy)
        await cdp.send(
          'Input.dispatchMouseEvent',
          { type: 'mouseMoved', x: x - moveBy, y, button: 'left', buttons: 1 },
          session,
        )
      await cdp.send(
        'Input.dispatchMouseEvent',
        { type: 'mouseReleased', x: x - moveBy, y, button: 'left', clickCount: 1 },
        session,
      )
    }
    const buttons = () =>
      tool(`document.querySelector('hozu-devtools').shadowRoot.querySelectorAll('.dock button').length`)
    expect(await buttons()).toBeGreaterThan(3)
    await press()
    await until(
      `document.querySelector('hozu-devtools').shadowRoot.querySelectorAll('.dock button').length === 0`,
    )
    expect(await tool(`$('.grip').getAttribute('aria-expanded')`)).toBe('false')
    await press()
    await until(
      `document.querySelector('hozu-devtools').shadowRoot.querySelectorAll('.dock button').length > 3`,
    )
    await press(40)
    await new Promise((r) => setTimeout(r, 200))
    expect(await buttons()).toBeGreaterThan(3)
  })
})
