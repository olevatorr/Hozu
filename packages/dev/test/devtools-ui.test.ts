import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dev } from '@hozu/dev'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Cdp, findBrowser, launch } from '../../cli/src/cdp.ts'
import { appWithHozuUi, freePort } from './hozu-ui-app.ts'

describe.skipIf(!findBrowser())('Hozu UI in DevTools: Assets, Place, Main component (ADR 0089 P4–P6)', () => {
  let server: Awaited<ReturnType<typeof dev>>
  let cdp: Cdp
  let session: string
  const errors: string[] = []
  const loads: (() => void)[] = []
  const shadow = `document.querySelector('hozu-devtools')?.shadowRoot`

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
  const click = async (selector: string) => {
    const { x, y } = await evaluate(
      `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`,
    )
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, session)
    for (const type of ['mousePressed', 'mouseReleased'])
      await cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }, session)
  }
  const press = (selector: string, text: string) =>
    evaluate(
      `[...${shadow}.querySelectorAll(${JSON.stringify(selector)})].find((b) => b.textContent.includes(${JSON.stringify(text)})).click()`,
    )
  const copied = async () => {
    await press('.actions button', 'Copy for AI')
    await until(`!!${shadow}.querySelector('.status.ok, .status.err')`)
    expect(await evaluate(`${shadow}.querySelector('.status').textContent`)).toContain('Copied')
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

  it('Assets shows the Hozu UI kit first, with the package components the app does not have yet', async () => {
    await open('/')
    await evaluate('localStorage.clear()')
    await open('/')
    await press('.dock button', 'Assets')
    await until(
      `!!${shadow}.querySelector('.assets:not([hidden]) .owner.official [data-component="ui.Button"]')`,
    )
    expect(
      await evaluate(`${shadow}.querySelector('.assets-body > .owner').classList.contains('official')`),
    ).toBe(true)
    expect(await evaluate(`${shadow}.querySelector('.owner.official > .label').textContent`)).toMatch(
      /^Hozu UI · ui · \d+ · 0\.1\.0$/,
    )
    expect(
      await evaluate(`[...${shadow}.querySelectorAll('[data-available]')].map((r) => r.textContent)`),
    ).toEqual(['Dialogui/dialog.tsnpx hozu add component ui Dialog --from official'])
    await press('.asset-name', 'Button')
    await until(`!!${shadow}.querySelector('[data-place-first]')`)
    expect(await evaluate(`${shadow}.querySelector('[data-place-first]').textContent`)).toBe(
      'Select a part of the page first',
    )
    await press('.assets-head .act', 'Close')
  })

  it('places a component after the selected part, and a package component with its install line', async () => {
    await press('.dock .mode', 'Select')
    await click('h1')
    await until(`!!${shadow}.querySelector('.panel:not([hidden]) .title')`)
    await press('.dock button', 'Assets')
    await until(`!!${shadow}.querySelector('.assets:not([hidden]) [data-component="ui.Button"]')`)
    await press('.asset-name', 'Button')
    await until(`!!${shadow}.querySelector('[data-place="after"]')`)
    expect(await evaluate(`${shadow}.querySelector('.asset-detail').textContent`)).toContain(
      'Next to the selected part: Heading “Team tasks”',
    )
    await evaluate(
      `(() => { const s = ${shadow}.querySelector('select[data-dim="tone"]'); s.value = 'danger'; s.dispatchEvent(new Event('change')) })()`,
    )
    await evaluate(
      `(() => { const n = ${shadow}.querySelector('textarea[aria-label="A note for the placed component"]'); n.value = 'A button that adds a task' })()`,
    )
    await press('[data-place]', 'Place after')
    await until(`${shadow}.querySelector('.assets').hidden && !!${shadow}.querySelector('.panel .item')`)
    const text = await copied()
    expect(text).toContain(
      `## 1. Add <ui.Button> { tone: 'danger' } after <h1 "Team tasks">\n- Want: A button that adds a task\n- Where: \`features/tasks/views.ts:`,
    )
    expect(text).toContain("place `ui.use(Button, { variant: { tone: 'danger' } }, [...])` after it")
    expect(text).not.toContain('Install first')

    await click('h1')
    await press('.dock button', 'Assets')
    await until(`!!${shadow}.querySelector('.assets:not([hidden]) [data-available="Dialog"]')`)
    await press('[data-available="Dialog"] .asset-name', 'Dialog')
    await until(`!!${shadow}.querySelector('[data-place="inside"]')`)
    await press('[data-place]', 'Place inside')
    await until(
      `${shadow}.querySelector('.assets').hidden && ${shadow}.querySelectorAll('.panel .item').length === 2`,
    )
    const both = await copied()
    expect(both).toContain('## 2. Add <ui.Dialog> inside <h1 "Team tasks">')
    expect(both).toContain('- Install first: `npx hozu add component ui Dialog --from official`')
    expect(both).toContain('import it from `ui/dialog.ts`')
  }, 30_000)

  it('changes every use of a component the app does not use yet', async () => {
    await press('.dock button', 'Assets')
    await until(`!!${shadow}.querySelector('.assets:not([hidden]) [data-component="ui.Input"]')`)
    const unused = (await evaluate(
      `[...${shadow}.querySelectorAll('.asset')].find((a) => a.querySelector('.asset-uses').textContent.startsWith('0 places'))?.dataset.component ?? null`,
    )) as string | null
    expect(unused).not.toBeNull()
    await evaluate(`${shadow}.querySelector('[data-component="${unused}"] .asset-name').click()`)
    await until(`!!${shadow}.querySelector('[data-add]')`)
    await evaluate(
      `(() => { const n = ${shadow}.querySelector('.asset-detail textarea[aria-label^="Change the main component"]'); n.value = 'Rounder'; n.dispatchEvent(new Event('input')) })()`,
    )
    await press('[data-add]', 'Add to the request')
    await until(
      `${shadow}.querySelector('.assets').hidden && ${shadow}.querySelectorAll('.panel .item').length === 3`,
    )
    const text = await copied()
    expect(text).toMatch(
      new RegExp(
        `## 3\\. <${unused!.replace('.', '\\.')}> · Main component\\n- Want: Rounder\\n- Where: \`ui/[\\w-]+\\.ts:\\d+\``,
      ),
    )
    expect(text).toContain("- Scope: every use (the component's own file)")
    expect(errors).toEqual([])
  }, 30_000)
})
