import { existsSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { compileStyles } from '@tenon/css'
import { chromium } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { build, start } from './support.ts'

const chrome = process.env.CHROMIUM_PATH ?? chromium.executablePath()
let app: ReturnType<typeof start>
let url = ''

beforeAll(async () => {
  app = start({ styles: await compileStyles(build) })
  await new Promise<void>((r) => (app.server.listening ? r() : app.server.once('listening', () => r())))
  url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}/`
})
afterAll(() => app.close())

describe.skipIf(!existsSync(chrome))('in Chromium', () => {
  it('styles apply, hydration never replaces server elements, and list motion runs to completion', async () => {
    const browser = await chromium.launch({ executablePath: chrome })
    try {
      const page = await browser.newPage()
      await page.addInitScript(() => {
        const log: string[] = []
        ;(window as unknown as { __removed: string[] }).__removed = log
        new MutationObserver((records) => {
          for (const r of records)
            for (const n of r.removedNodes) if (n.nodeType === 1) log.push((n as Element).outerHTML)
        }).observe(document, { childList: true, subtree: true })
      })
      await page.goto(url)
      await page.waitForFunction(() => document.querySelector('input[name="qty"]') !== null)
      await page.waitForLoadState('networkidle')
      expect(await page.evaluate(() => getComputedStyle(document.querySelector('section')!).display)).toBe(
        'grid',
      )
      expect(await page.evaluate(() => (window as unknown as { __removed: string[] }).__removed)).toEqual([])
      expect(await page.locator('script[type="speculationrules"]').count()).toBe(1)

      await page.fill('input[name="qty"]', '3')
      expect(await page.locator('label span[style]').getAttribute('style')).toBe('--qty: 3;')
      const classes = page.evaluate(
        () =>
          new Promise<string[]>((resolve) => {
            const seen: string[] = []
            const ul = document.querySelector('ul.divide-y')!
            new MutationObserver((records) => {
              for (const r of records)
                if (r.type === 'attributes') seen.push((r.target as Element).className)
                else for (const n of r.addedNodes) if (n.nodeType === 1) seen.push((n as Element).className)
            }).observe(ul, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
            setTimeout(() => resolve(seen), 600)
          }),
      )
      await page.getByRole('button', { name: 'Add' }).first().click()
      const seen = await classes
      expect(seen).toContain('flex justify-between list-enter-from list-enter-active')
      expect(seen).toContain('flex justify-between list-enter-active list-enter-to')
      expect(seen.at(-1)).toBe('flex justify-between')
      expect(await page.locator('ul.divide-y li').first().textContent()).toContain('Mug × 3')
    } finally {
      await browser.close()
    }
  }, 30_000)

  it('soft navigation keeps the cart island alive, restores scroll and never refetches (ADR 0015)', async () => {
    const browser = await chromium.launch({ executablePath: chrome })
    try {
      const page = await browser.newPage({ viewport: { width: 800, height: 400 } })
      const requests: string[] = []
      page.on('request', (r) => requests.push(`${r.resourceType()} ${new URL(r.url()).pathname}`))
      await page.goto(url)
      await page.waitForFunction(() => document.querySelector('input[name="qty"]') !== null)
      await page.waitForLoadState('networkidle')
      await page.fill('input[name="qty"]', '5')
      await page.evaluate(() => {
        ;(window as unknown as { __alive: boolean }).__alive = true
        document.body.style.minHeight = '3000px'
        window.scrollTo(0, 900)
      })
      requests.length = 0

      await page.evaluate(() => (document.querySelector('a[href="/products/mug"]') as HTMLElement).click())
      await page.waitForFunction(() => document.querySelector('h2')?.textContent === 'Mug — $12')
      expect(await page.evaluate(() => window.scrollY)).toBe(0)
      expect(await page.evaluate(() => (window as unknown as { __alive?: boolean }).__alive)).toBe(true)
      expect(await page.title()).toBe('Mug')
      expect(new URL(page.url()).pathname).toBe('/products/mug')
      expect(await page.inputValue('input[name="qty"]')).toBe('5')
      expect(await page.evaluate(() => document.querySelector('div[aria-live]')?.textContent)).toBe('Mug')
      expect(requests).toEqual(['fetch /products/mug'])

      await page.evaluate(() => window.scrollTo(0, 0))
      await page.goBack()
      await page.waitForFunction(() => document.querySelector('h2')?.textContent === 'Products')
      await page.waitForFunction(() => window.scrollY > 0)
      expect(await page.evaluate(() => window.scrollY)).toBe(900)
      expect(await page.evaluate(() => (window as unknown as { __alive?: boolean }).__alive)).toBe(true)
      expect(await page.inputValue('input[name="qty"]')).toBe('5')
      expect(requests.filter((r) => r.includes('/_tenon/query'))).toEqual([])
    } finally {
      await browser.close()
    }
  }, 30_000)
})
