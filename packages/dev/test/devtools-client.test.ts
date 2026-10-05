import { mkdtempSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dev } from '@hozu/dev'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Cdp, findBrowser, launch } from '../../cli/src/cdp.ts'

const stations = fileURLToPath(new URL('../../../examples/stations/', import.meta.url))

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = createServer().listen(0, () => {
      const { port } = s.address() as { port: number }
      s.close(() => resolve(port))
    })
  })

describe.skipIf(!findBrowser())('a client component in DevTools (0.18.1)', () => {
  let server: Awaited<ReturnType<typeof dev>>
  let cdp: Cdp
  let session: string
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
    for (let i = 0; i < 100; i++) {
      if (await evaluate(expression)) return
      await new Promise((r) => setTimeout(r, 50))
    }
    throw new Error(`Timed out: ${expression}`)
  }
  const click = async (expression: string) => {
    const { x, y } = await evaluate(
      `(() => { const r = (${expression}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`,
    )
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased'])
      await cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }, session)
  }
  const tool = `document.querySelector('hozu-devtools')?.shadowRoot`

  beforeAll(async () => {
    server = await dev({ cwd: stations, port: await freePort(), appPort: await freePort(), log: () => {} })
    cdp = launch(findBrowser()!, mkdtempSync(join(tmpdir(), 'hozu-devtools-chrome-')))
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
    session = (await cdp.send('Target.attachToTarget', { targetId, flatten: true })).sessionId
    cdp.on((method, _params, from) => {
      if (from === session && method === 'Page.loadEventFired') loads.shift()?.()
    })
    await cdp.send('Page.enable', {}, session)
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false },
      session,
    )
  }, 60_000)

  afterAll(async () => {
    await cdp?.close()
    await server?.close()
  })

  it('says which module draws its inside and offers no way into it', async () => {
    const loaded = new Promise<void>((resolve) => loads.push(resolve))
    await cdp.send('Page.navigate', { url: `${server.url}/` }, session)
    await loaded
    await until(`!!${tool}?.querySelector('.dock button')`)
    await until(
      `document.querySelector('[data-hozu-component="stations.StationMap"]')?.getAttribute('data-hozu-component-state') === 'mounted'`,
    )
    await click(
      `[...${tool}.querySelectorAll('.dock button')].find((b) => b.textContent.trim() === 'Select')`,
    )
    await click(`document.querySelector('[data-hozu-component="stations.StationMap"]')`)
    await until(`${tool}.querySelector('.panel').textContent.includes('Drawn in the browser')`)
    const panel = await evaluate(`${tool}.querySelector('.panel').textContent`)
    expect(panel).toContain('Drawn in the browser by features/stations/map.client.ts')
    expect(panel).not.toContain('↓ Inside')
  }, 60_000)
})
