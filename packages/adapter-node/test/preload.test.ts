import { existsSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { createServer } from '@hozu/adapter-node'
import { buildProject } from '@hozu/core/ir'
import { chromium } from 'playwright-core'
import { describe, expect, it } from 'vitest'
import { conditional, conditionalResolvers } from '../../runtime-server/test/support/conditional.ts'

const chrome = process.env.CHROMIUM_PATH ?? chromium.executablePath()

describe.skipIf(!existsSync(chrome))('conditional islands in Chromium (ADR 0036)', () => {
  it('hydrates islands preloaded in <body>, and fetches no JS where none renders', async () => {
    const server = createServer({
      build: buildProject(conditional, { sources: false }),
      resolvers: conditionalResolvers(),
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const browser = await chromium.launch({ executablePath: chrome })
    try {
      const page = await browser.newPage()
      const scripts: string[] = []
      page.on('request', (r) => r.resourceType() === 'script' && scripts.push(new URL(r.url()).pathname))
      await page.goto(`${origin}/docs/plain`)
      await page.waitForLoadState('networkidle')
      expect(scripts).toEqual([])
      for (const [path, button, id] of [
        ['/docs/code', 'b2', 'b2'],
        ['/notes?pinned=true', 'Unpin', 'pin'],
      ] as const) {
        await page.goto(origin + path)
        await page.waitForSelector('html[data-hozu-ready]')
        await page.getByRole('button', { name: button }).click()
        await page.waitForFunction((v) => document.querySelector('[data-copied]')?.textContent === v, id)
      }
      expect(scripts).toContain('/_hozu/client.js')
    } finally {
      await browser.close()
      server.close()
    }
  }, 60_000)
})
