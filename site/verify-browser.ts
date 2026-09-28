import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { chromium } from 'playwright-core'

const output = new URL('../.tmp/site-interactive/', import.meta.url)
await mkdir(output, { recursive: true })
const origin = process.env.HOZU_SITE_URL ?? 'http://127.0.0.1:4799'
const browser = await chromium.launch({
  executablePath:
    process.env.HOZU_BROWSER_EXECUTABLE ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
})
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const errors: string[] = []
  const scripts = new Map<string, { bytes: number; gzip: number }>()
  const reads: Promise<void>[] = []
  const effectRequests: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    if (request.url().includes('/_hozu/effect')) effectRequests.push(request.url())
  })
  page.on('response', (response) => {
    if (response.request().resourceType() === 'script' && response.status() === 200) {
      reads.push(
        response.body().then((body) => {
          scripts.set(response.url(), { bytes: body.length, gzip: gzipSync(body).length })
        }),
      )
    }
  })
  const screenshot = async (name: string) => {
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)), fullPage: true })
  }
  await page.goto(`${origin}/how-it-works/`)
  await page.waitForSelector('html[data-hozu-ready]')
  await Promise.all(reads)
  const initialScripts = [...scripts]
  const run = page.getByRole('button', { name: 'Run example', exact: true })
  await run.focus()
  await page.keyboard.press('Enter')
  assert.equal(
    await run.evaluate((element) => element === document.activeElement),
    true,
    'Run keeps keyboard focus',
  )
  await page.getByText('Ready to render.', { exact: true }).waitFor()
  assert.equal(
    await run.evaluate((element) => element === document.activeElement),
    true,
    'Completion keeps keyboard focus',
  )
  await page.getByRole('button', { name: 'Remove contract', exact: true }).click()
  await run.click()
  await page.getByText('Stopped at validation.', { exact: true }).waitFor()
  await screenshot('blocked-1280-light')
  await page.getByRole('button', { name: 'Restore contract', exact: true }).click()
  await run.click()
  await page.getByText('Ready to render.', { exact: true }).waitFor()
  const settings = page.locator('[data-render-settings]')
  for (const scope of ['public', 'user']) {
    await settings.getByRole('button', { name: scope, exact: true }).click()
    for (const freshness of ['static', 'revalidate', 'swr', 'live'] as const) {
      const choice = settings.getByRole('button', { name: freshness, exact: true })
      await choice.click()
      assert.equal(await choice.getAttribute('aria-pressed'), 'true')
      const expected =
        scope === 'user'
          ? 'Private · request-time'
          : {
              static: 'Static HTML',
              revalidate: 'ISR',
              swr: 'Stale while revalidate',
              live: 'Request-time data',
            }[freshness]
      assert.equal(await page.locator('[data-preview-data] h3').textContent(), expected)
      for (const binding of ['None', 'Bound']) {
        await settings.getByRole('button', { name: binding, exact: true }).click()
        assert.equal(
          await page.locator('[data-preview-island] strong').textContent(),
          binding === 'Bound' ? 'Interactive island' : 'Plain HTML',
        )
      }
    }
  }
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  assert.equal(
    await page
      .locator('[data-step-number]')
      .first()
      .evaluate((element) => getComputedStyle(element).transitionDuration),
    '0s',
  )
  await screenshot('plan-1280-dark')
  const layouts = []
  for (const width of [375, 768, 1280]) {
    for (const theme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width, height: 900 })
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'no-preference' })
      await page.goto(`${origin}/how-it-works/`)
      await page.waitForSelector('html[data-hozu-ready]')
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
      assert.equal(overflow, false)
      layouts.push({ width, theme, overflow })
      await screenshot(`overview-${width}-${theme}`)
    }
  }
  const noScript = await browser.newPage({ javaScriptEnabled: false })
  await noScript.goto(`${origin}/how-it-works/`)
  assert.equal(await noScript.locator('[data-design-chapters] li a').count(), 6)
  assert.ok((await noScript.locator('noscript [data-lab-note]').boundingBox())?.height)
  const staticPages = await browser.newPage()
  const staticScripts: string[] = []
  staticPages.on('request', (request) => {
    if (request.resourceType() === 'script') staticScripts.push(request.url())
  })
  for (const path of ['/trials/', '/changelog/', '/docs/ai-agents/']) {
    await staticPages.goto(`${origin}${path}`)
    assert.equal(
      await staticPages.locator('script[src], script[type="module"], link[rel="modulepreload"]').count(),
      0,
    )
  }
  await Promise.all(reads)
  assert.deepEqual(errors, [])
  assert.deepEqual(effectRequests, [])
  assert.deepEqual(staticScripts, [])
  const result = {
    initialScripts,
    allScripts: [...scripts],
    initialJsBytes: initialScripts.reduce((sum, [, script]) => sum + script.bytes, 0),
    allJsBytes: [...scripts.values()].reduce((sum, script) => sum + script.bytes, 0),
    allGzipBytes: [...scripts.values()].reduce((sum, script) => sum + script.gzip, 0),
    layouts,
    errors,
    effectRequests,
    staticScripts,
    checks:
      'Valid run, invalid run, repair, keyboard focus, 16 render combinations, reduced motion, no-JS chapters and script isolation',
  }
  await writeFile(new URL('browser-results.json', output), `${JSON.stringify(result, null, 2)}\n`)
  console.log(JSON.stringify(result, null, 2))
} finally {
  await browser.close()
}
