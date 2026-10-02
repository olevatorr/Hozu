import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { chromium, type Route } from 'playwright-core'

const root = new URL('./dist/', import.meta.url)
const types: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
}
const browser = await chromium.launch({
  executablePath:
    process.env.HOZU_BROWSER_EXECUTABLE ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const failures: string[] = []
const serve = async (route: Route) => {
  const path = new URL(route.request().url()).pathname
  const file = path.endsWith('/') ? `${path}index.html` : extname(path) ? path : `${path}/index.html`
  try {
    await route.fulfill({
      body: await readFile(new URL(`.${file}`, root)),
      contentType: types[extname(file)] ?? 'application/octet-stream',
    })
  } catch {
    await route.fulfill({ status: 404, body: '' })
  }
}
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.route('https://hozu.test/**', (route) => serve(route))
  for (const path of [
    '/',
    '/docs/getting-started/',
    '/how-it-works/',
    '/how-it-works/pipeline/',
    '/trials/',
    '/trials/0021-0-8-long-run/',
    '/changelog/',
  ]) {
    await page.goto(`https://hozu.test${path}`)
    await page.waitForTimeout(400)
    const low = await page.evaluate(() => {
      const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number)
      const lum = ([r, g, b]: number[]) =>
        [r!, g!, b!]
          .map((v) => v / 255)
          .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
          .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i]!, 0)
      const background = (el: Element | null): number[] => {
        for (; el; el = el.parentElement) {
          const c = rgb(getComputedStyle(el).backgroundColor)
          if (c.length >= 3 && (c[3] ?? 1) > 0.5) return c
        }
        return [255, 255, 255]
      }
      const out: string[] = []
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const el = node.parentElement
        if (!el || !node.textContent?.trim() || el.closest('svg, [aria-hidden="true"], pre, code.hljs'))
          continue
        const style = getComputedStyle(el)
        if (style.visibility === 'hidden' || style.display === 'none' || el.getClientRects().length === 0)
          continue
        const size = Number.parseFloat(style.fontSize)
        const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700)
        const a = lum(rgb(style.color))
        const b = lum(background(el))
        const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
        if (ratio < (large ? 3 : 4.5))
          out.push(`${ratio.toFixed(2)} "${node.textContent.trim().slice(0, 40)}"`)
      }
      return [...new Set(out)]
    })
    for (const l of low) failures.push(`${path}: ${l}`)
  }
  const joint = '[data-hozu-component="site.Joint"]'
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()))
  await page.goto('https://hozu.test/')
  await page.locator(joint).scrollIntoViewIfNeeded()
  await page.waitForSelector(`${joint}[data-hozu-component-state="mounted"]`, { timeout: 15000 })
  assert.equal(await page.locator(`${joint} canvas`).count(), 1, 'the joint renders one canvas')
  await page.waitForSelector(`${joint}[data-pose="joined"]`, { timeout: 15000 })
  await page.getByRole('button', { name: 'AI CHANGE' }).click()
  await page.waitForSelector(`${joint}[data-pose="split"]`, { timeout: 5000 })
  await page.getByRole('button', { name: 'APPLY FIX' }).click()
  await page.waitForSelector(`${joint}[data-pose="joined"]`, { timeout: 5000 })
  assert.deepEqual(errors, [], 'no console errors on the home page')
  const off = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 900 } })
  const still = await off.newPage()
  await still.route('https://hozu.test/**', (route) => serve(route))
  await still.goto('https://hozu.test/')
  assert.equal(
    await still.locator('img[data-model][width][height]').count(),
    1,
    'without JS the joint is its poster',
  )
  assert.equal(await still.locator('canvas').count(), 0, 'without JS there is no canvas')
  console.log('Joint: mounted, one canvas, split and joined on the demo, 0 console errors, poster without JS')
} finally {
  await browser.close()
}
assert.deepEqual(failures, [], `text below WCAG AA contrast:\n${failures.join('\n')}`)
console.log('Text contrast is at least 4.5:1 (3:1 for large text) on 7 pages')
