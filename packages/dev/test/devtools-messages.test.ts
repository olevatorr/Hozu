import { mkdtempSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dev } from '@hozu/dev'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Cdp, findBrowser, launch } from '../../cli/src/cdp.ts'

const notes = fileURLToPath(new URL('../../../examples/notes/', import.meta.url))
const file = join(mkdtempSync(join(tmpdir(), 'hozu-devtools-messages-')), 'zh.json')
const write = (messages: Record<string, string>) =>
  writeFileSync(file, JSON.stringify({ hozu: 'test', messages }))

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = createServer().listen(0, () => {
      const { port } = s.address() as { port: number }
      s.close(() => resolve(port))
    })
  })

describe.skipIf(!findBrowser())('DevTools in the person’s language (ADR 0060 D)', () => {
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
  const dock = async () => {
    const loaded = new Promise<void>((resolve) => loads.push(resolve))
    await cdp.send('Page.navigate', { url: `${server.url}/` }, session)
    await loaded
    for (let i = 0; i < 80; i++) {
      const text = await evaluate(
        `[...(document.querySelector('hozu-devtools')?.shadowRoot?.querySelectorAll('.dock button') ?? [])].map((b) => b.textContent).join('|')`,
      )
      if (text) return text as string
      await new Promise((r) => setTimeout(r, 50))
    }
    throw new Error('DevTools did not draw its dock')
  }

  beforeAll(async () => {
    write({ 'dock.select': '選取', 'dock.browse': '瀏覽' })
    server = await dev({
      cwd: notes,
      devtoolsMessages: file,
      port: await freePort(),
      appPort: await freePort(),
      log: () => {},
    })
    cdp = launch(findBrowser()!, mkdtempSync(join(tmpdir(), 'hozu-devtools-chrome-')))
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
    session = (await cdp.send('Target.attachToTarget', { targetId, flatten: true })).sessionId
    cdp.on((method, _params, from) => {
      if (from === session && method === 'Page.loadEventFired') loads.shift()?.()
    })
    await cdp.send('Page.enable', {}, session)
    await cdp.send('Runtime.enable', {}, session)
  }, 60_000)

  afterAll(async () => {
    await cdp?.close()
    await server?.close()
  })

  it('draws its strings from the named file, English where the file has none, and rereads it on load', async () => {
    const first = await dock()
    expect(first).toContain('瀏覽')
    expect(first).toContain('選取')
    expect(first).toContain('Layers')
    write({ 'dock.select': '挑選' })
    const again = await dock()
    expect(again).toContain('挑選')
    expect(again).toContain('Browse')
    const served = await (await fetch(`${server.url}/_hozu/devtools/messages.json`)).json()
    expect(served).toEqual({ 'dock.select': '挑選' })
  }, 60_000)
})
