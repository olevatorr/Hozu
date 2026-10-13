import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dev } from '@hozu/dev'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Cdp, findBrowser, launch } from '../../cli/src/cdp.ts'
import { appWithHozuUi, freePort } from './hozu-ui-app.ts'

describe.skipIf(!findBrowser())('Assets docked beside the page, components dragged onto it', () => {
  let server: Awaited<ReturnType<typeof dev>>
  let cdp: Cdp
  let session: string
  const errors: string[] = []
  const loads: (() => void)[] = []
  const shadow = `document.querySelector('hozu-devtools')?.shadowRoot`
  const outline = `document.querySelector('hozu-devtools-outline')?.shadowRoot`

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
    for (let i = 0; i < 100; i++) {
      if (await evaluate(expression)) return
      await new Promise((r) => setTimeout(r, 50))
    }
    throw new Error(`Timed out: ${expression}`)
  }
  const open = async (path: string) => {
    const loaded = new Promise<void>((resolve) => loads.push(resolve))
    await cdp.send('Page.navigate', { url: `${server.url}${path}` }, session)
    await loaded
    await until(`!!${shadow}?.querySelector('.dock button')`)
  }
  const press = (selector: string, text: string) =>
    evaluate(
      `[...${shadow}.querySelectorAll(${JSON.stringify(selector)})].find((b) => b.textContent.includes(${JSON.stringify(text)})).click()`,
    )
  const mouse = (type: string, x: number, y: number, held: boolean) =>
    cdp.send(
      'Input.dispatchMouseEvent',
      {
        type,
        x,
        y,
        button: held || type !== 'mouseMoved' ? 'left' : 'none',
        buttons: held ? 1 : 0,
        clickCount: 1,
      },
      session,
    )
  /** Presses on the tile, moves in steps to the point, and leaves the button held. */
  const dragTo = async (tile: string, to: { x: number; y: number }) => {
    const from = (await evaluate(
      `(() => { const t = ${shadow}.querySelector(${JSON.stringify(tile)}); t.scrollIntoView({ block: 'center' }); const r = t.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`,
    )) as { x: number; y: number }
    await mouse('mouseMoved', from.x, from.y, false)
    await mouse('mousePressed', from.x, from.y, true)
    for (let i = 1; i <= 12; i++)
      await mouse(
        'mouseMoved',
        from.x + ((to.x - from.x) * i) / 12,
        from.y + ((to.y - from.y) * i) / 12,
        true,
      )
  }
  const pendingAfterH1 = () =>
    evaluate(`(() => {
      const p = document.querySelector('h1').nextElementSibling
      const button = p.querySelector('button')
      return {
        number: p.dataset.hozuPending,
        tag: p.shadowRoot.querySelector('.tag').textContent,
        text: button.textContent,
        red: button.classList.contains('bg-brand'),
        marked: p.querySelectorAll('[data-hz]').length,
      }
    })()`)
  const label = () => evaluate(`${outline}.querySelector('[data-drop-label]')?.textContent ?? ''`)
  const copied = async () => {
    await press('.actions button', 'Copy for AI')
    await until(`!!${shadow}.querySelector('.status.ok, .status.err')`)
    return (await evaluate('navigator.clipboard.readText()')) as string
  }

  beforeAll(async () => {
    const root = appWithHozuUi()
    server = await dev({ cwd: root, port: await freePort(), appPort: await freePort(), log: () => {} })
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
    await cdp.send('Browser.grantPermissions', {
      permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
      origin: server.url,
    })
  }, 60_000)

  afterAll(async () => {
    await cdp?.close()
    await server?.close()
  })

  it('docks Assets, remembers it, and drags a variant tile after the heading', async () => {
    await open('/')
    await evaluate('localStorage.clear()')
    await open('/')
    await press('.dock button', 'Assets')
    await until(`!!${shadow}.querySelector('.assets:not([hidden]) [data-component="ui.Button"]')`)
    await press('.assets-head .act', 'Dock to the side')
    expect(await evaluate(`${shadow}.querySelector('.assets').classList.contains('docked')`)).toBe(true)
    expect(
      await evaluate(`Math.round(${shadow}.querySelector('.assets').getBoundingClientRect().width)`),
    ).toBe(360)
    expect(await evaluate(`${shadow}.querySelector('[data-dock]').textContent`)).toBe('Full screen')

    const h1 = (await evaluate(
      `(() => { const r = document.querySelector('h1').getBoundingClientRect(); return { x: r.x + 40, y: r.bottom - 3 } })()`,
    )) as { x: number; y: number }
    await dragTo('[data-component="ui.Button"] [data-tile="tone: danger"]', { x: h1.x + 20, y: h1.y - 10 })
    await mouse('mouseMoved', h1.x, h1.y, true)
    await until(
      `(${outline}.querySelector('[data-drop-label]')?.textContent ?? '').startsWith('Place after')`,
    )
    expect(await label()).toBe('Place after Heading “Team tasks”')
    expect(await evaluate(`${shadow}.querySelector('.drag-ghost').textContent`)).toBe('Button · tone: danger')
    expect(await evaluate(`${outline}.querySelector('.drop-mark').className`)).toBe('drop-mark line')
    await mouse('mouseReleased', h1.x, h1.y, true)
    await until(`!${shadow}.querySelector('.drop-note').hidden`)
    expect(await evaluate(`${shadow}.querySelector('.drop-note b').textContent`)).toBe(
      'Place after Heading “Team tasks”',
    )
    expect(await evaluate(`${outline}.querySelector('.drop').hidden`)).toBe(true)
    await evaluate(
      `(() => { const n = ${shadow}.querySelector('.drop-note textarea'); n.value = 'A button that adds a task' })()`,
    )
    await evaluate(`${shadow}.querySelector('[data-drop-add]').click()`)
    await until(`!!${shadow}.querySelector('.panel .item')`)
    expect(await evaluate(`${shadow}.querySelector('.assets').hidden`)).toBe(false)
    await until(`!!document.querySelector('h1').nextElementSibling?.matches('[data-hozu-pending]')`)
    expect(await pendingAfterH1()).toEqual({
      number: '1',
      tag: 'Pending #1',
      text: 'Button',
      red: true,
      marked: 0,
    })
    const list = (await evaluate(`(() => {
      const ul = document.querySelector('main ul')
      ul.replaceChildren()
      ul.style.border = '1px solid'
      const r = ul.getBoundingClientRect()
      return { x: r.x + 12, y: r.y - 4, height: r.height }
    })()`)) as { x: number; y: number; height: number }
    expect(list.height).toBe(2)
    await dragTo('[data-component="ui.Badge"] .tile', list)
    await until(
      `(${outline}.querySelector('[data-drop-label]')?.textContent ?? '').startsWith('Place before')`,
    )
    expect(await label()).toBe('Place before List')
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' }, session)
    await mouse('mouseReleased', list.x, list.y, true)
    const text = await copied()
    expect(text).toContain(
      `## 1. Add <ui.Button> { tone: 'danger' } after <h1 "Team tasks">\n- Want: A button that adds a task\n`,
    )

    await open('/')
    await until(`!!document.querySelector('h1').nextElementSibling?.matches('[data-hozu-pending]')`)
    expect(await pendingAfterH1()).toEqual({
      number: '1',
      tag: 'Pending #1',
      text: 'Button',
      red: true,
      marked: 0,
    })
    expect(await evaluate(`document.querySelectorAll('[data-hozu-pending]').length`)).toBe(1)
    await press('.dock button', 'Assets')
    await until(`${shadow}.querySelector('.assets:not([hidden])')?.classList.contains('docked')`)
  }, 40_000)

  it('shows an icon-sized variant with a glyph that fits its button', async () => {
    const frame = `${shadow}.querySelector('[data-component="ui.Button"] [data-tile="size: icon"] iframe')`
    await until(`!!${frame}`)
    await evaluate(`${frame}.scrollIntoView({ block: 'center' })`)
    await until(`!!${frame}?.contentDocument?.querySelector('button')`)
    expect(
      await evaluate(`(() => {
        const b = ${frame}.contentDocument.querySelector('button')
        return { text: b.textContent, fits: b.scrollWidth <= b.clientWidth }
      })()`),
    ).toEqual({ text: '★', fits: true })
  })

  it('drops inside a container from the middle, and Escape cancels a drag', async () => {
    await until(`!!${shadow}.querySelector('.assets:not([hidden]) [data-component="ui.Badge"]')`)
    const spot = (await evaluate(`(() => {
      const header = document.querySelector('header')
      const r = header.getBoundingClientRect()
      const y = r.y + r.height / 2
      for (let x = r.x + r.width / 2; x < r.right; x += 4)
        if (document.elementFromPoint(x, y) === header) return { x, y }
      return null
    })()`)) as { x: number; y: number }
    expect(spot).not.toBeNull()

    await dragTo('[data-component="ui.Badge"] .tile', spot)
    await until(
      `(${outline}.querySelector('[data-drop-label]')?.textContent ?? '').startsWith('Place inside')`,
    )
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' }, session)
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' }, session)
    expect(await evaluate(`${outline}.querySelector('.drop').hidden`)).toBe(true)
    expect(await evaluate(`${shadow}.querySelector('.drag-ghost').hidden`)).toBe(true)
    expect(await evaluate(`!${shadow}.querySelector('.assets').hidden`)).toBe(true)
    await mouse('mouseReleased', spot.x, spot.y, true)
    expect(await evaluate(`${shadow}.querySelector('.drop-note').hidden`)).toBe(true)

    await dragTo('[data-component="ui.Badge"] .tile', spot)
    await until(
      `(${outline}.querySelector('[data-drop-label]')?.textContent ?? '').startsWith('Place inside')`,
    )
    expect(await evaluate(`${outline}.querySelector('.drop-mark').className`)).toBe('drop-mark inside')
    await mouse('mouseReleased', spot.x, spot.y, true)
    await until(`!${shadow}.querySelector('.drop-note').hidden`)
    await evaluate(`${shadow}.querySelector('[data-drop-add]').click()`)
    await until(`${shadow}.querySelectorAll('.panel .item').length === 2`)
    const text = await copied()
    expect(text).toMatch(/## 2\. Add <ui\.Badge> inside <header[ >"]/)
    expect(text).toContain('(not described: ask the user what should change)')
    await until(`!!document.querySelector('header > [data-hozu-pending="2"]:last-child')`)

    await evaluate(`[...${shadow}.querySelectorAll('.panel .item')][0].querySelectorAll('button')[1].click()`)
    await until(`${shadow}.querySelectorAll('.panel .item').length === 1`)
    expect(
      await evaluate(
        `document.querySelector('h1').nextElementSibling?.matches('[data-hozu-pending]') ?? false`,
      ),
    ).toBe(false)
    await until(`document.querySelector('header > [data-hozu-pending]')?.dataset.hozuPending === '1'`)

    const number = /hozu requests done (\d+)/.exec(text)?.[1]
    expect(number).toBeTruthy()
    await evaluate(
      `fetch('/_hozu/dev/requests/${number}/done', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ result: 'Added' }) }).then((r) => r.status)`,
    )
    await until(`!document.querySelector('[data-hozu-pending]')`)
    expect(errors).toEqual([])
  }, 40_000)
})
