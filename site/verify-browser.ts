import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { chromium } from 'playwright-core'

const root = new URL('./dist/', import.meta.url)
const types: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
}
const browser = await chromium.launch({
  executablePath:
    process.env.HOZU_BROWSER_EXECUTABLE ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
})
const failures: string[] = []
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.route('https://hozu.test/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const file = path.endsWith('/') ? `${path}index.html` : extname(path) ? path : `${path}/index.html`
    try {
      route.fulfill({
        body: await readFile(new URL(`.${file}`, root)),
        contentType: types[extname(file)] ?? 'application/octet-stream',
      })
    } catch {
      route.fulfill({ status: 404, body: '' })
    }
  })
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
} finally {
  await browser.close()
}
assert.deepEqual(failures, [], `text below WCAG AA contrast:\n${failures.join('\n')}`)
console.log('Text contrast is at least 4.5:1 (3:1 for large text) on 7 pages')
