import { existsSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { createServer } from '@tenon/adapter-node'
import { buildProject } from '@tenon/core/ir'
import { chromium } from 'playwright-core'
import { describe, expect, it } from 'vitest'
import { createResolvers } from '../../../examples/feed/server.ts'
import project from '../../../examples/feed/tenon.config.ts'

const chrome = process.env.CHROMIUM_PATH ?? chromium.executablePath()

describe.skipIf(!existsSync(chrome))('feed in Chromium (ADR 0018)', () => {
  it('loads more on click and on scroll, in place, without a navigation', async () => {
    const server = createServer({
      build: buildProject(project, { sources: false }),
      resolvers: createResolvers(),
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const browser = await chromium.launch({ executablePath: chrome })
    try {
      const page = await browser.newPage({ viewport: { width: 800, height: 150 } })
      const documents: string[] = []
      page.on('request', (r) => r.resourceType() === 'document' && documents.push(r.url()))
      await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`)
      await page.waitForLoadState('networkidle')
      await page.evaluate(() => new Promise((resolve) => requestIdleCallback(resolve)))
      const items = () => page.locator('main li').count()
      expect(await items()).toBe(10)
      await page.evaluate(() => {
        ;(window as unknown as { __alive: boolean }).__alive = true
      })
      await page.getByRole('button', { name: 'Load more' }).click()
      await page.waitForFunction(() => document.querySelectorAll('main li').length === 20)
      expect(await page.getByRole('button', { name: 'Load more' }).count()).toBe(1)
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      await page.waitForFunction(() => document.querySelectorAll('main li').length >= 30)
      expect(await page.evaluate(() => (window as unknown as { __alive?: boolean }).__alive)).toBe(true)
      expect(documents).toHaveLength(1)
      expect(await page.locator('main li').first().textContent()).toContain('Item 1')
    } finally {
      await browser.close()
      server.close()
    }
  }, 60_000)
})
