import { mkdtempSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dev } from '@hozu/dev'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Cdp, findBrowser, launch } from '../../cli/src/cdp.ts'

const bookmarks = fileURLToPath(new URL('../../../examples/notes/', import.meta.url))
const scratch = mkdtempSync(join(tmpdir(), 'hozu-devtools-api-'))

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = createServer().listen(0, () => {
      const { port } = s.address() as { port: number }
      s.close(() => resolve(port))
    })
  })

describe.skipIf(!findBrowser())('the DevTools API drawer on a signed-in app (ADR 0050 G)', () => {
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

  const api = (selector: string) =>
    `document.querySelector('hozu-devtools').shadowRoot.querySelector(${JSON.stringify(selector)})`
  const apiClick = (selector: string, text: string) =>
    tool(
      `[...document.querySelector('hozu-devtools').shadowRoot.querySelectorAll(${JSON.stringify(selector)})].find((b) => b.textContent.includes(${JSON.stringify(text)})).click()`,
    )

  it('acts as a session user, then sends a request with a header to a declared endpoint', async () => {
    await open('/login')
    await evaluate(`localStorage.clear()`)
    await open('/login')
    await shadowClick('.dock button', 'API')
    await until(`!!${api('.api-session')}`)
    expect(await tool(`$('.api-session').textContent`)).toBe('Signed out')
    await tool(`$('.api-session').click()`)
    await tool(
      `(() => { const a = $('.api-row.session textarea'); a.value = '{"user":"ada"}'; a.dispatchEvent(new Event('input')) })()`,
    )
    const loaded = new Promise<void>((resolve) => loads.push(resolve))
    await apiClick('.api-row.session button', 'Act as')
    await loaded
    await until(`${api('.api-session')}?.textContent === 'As {"user":"ada"}'`)

    await apiClick('.api-tabs button', 'Endpoints')
    await until(`!!${api('[data-endpoint="notes.notesApi"]')}`)
    expect(await tool(`$('[data-endpoint="notes.notesApi"] .api-method').textContent`)).toBe('GET')
    await tool(
      `(() => { const [k, v] = $('[data-endpoint="notes.notesApi"] .api-header').querySelectorAll('input'); k.value = 'x-trace'; v.value = 'yes'; k.dispatchEvent(new Event('input')); v.dispatchEvent(new Event('input')) })()`,
    )
    await apiClick('[data-endpoint="notes.notesApi"] button', 'Send')
    await until(`!!${api('.api-status')}`)
    expect(await tool(`$('.api-status').textContent`)).toMatch(/^200 · \d+ ms · HTTP/)
    expect(await tool(`$('.api-result').textContent`)).toContain('Buy milk')
    expect(errors).toEqual([])
  })
})
