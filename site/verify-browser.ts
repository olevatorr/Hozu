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
  const change = page.getByRole('button', { name: 'AI CHANGE' })
  assert.equal(
    await change.evaluate((el) => getComputedStyle(el).cursor),
    'pointer',
    'AI CHANGE shows a pointer cursor',
  )
  assert.notEqual(
    await change.evaluate((el) => getComputedStyle(el).animationName),
    'none',
    'AI CHANGE invites a click',
  )
  assert.ok(await page.getByText('Press AI CHANGE').count(), 'the demo says what the button does')
  await page.getByRole('button', { name: 'AI CHANGE' }).click()
  await page.waitForSelector(`${joint}[data-pose="split"]`, { timeout: 5000 })
  await page.getByRole('button', { name: 'APPLY FIX' }).click()
  await page.waitForSelector(`${joint}[data-pose="joined"]`, { timeout: 5000 })
  assert.deepEqual(errors, [], 'no console errors on the home page')
  const slow = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await slow.route('https://hozu.test/**', async (route) => {
    if (route.request().url().endsWith('.glb')) await new Promise((done) => setTimeout(done, 2500))
    await serve(route)
  })
  await slow.goto('https://hozu.test/')
  await slow.locator(joint).scrollIntoViewIfNeeded()
  await slow.waitForSelector(`${joint}[data-hozu-component-state="mounted"]`, { timeout: 15000 })
  await slow.getByRole('button', { name: 'AI CHANGE' }).click()
  await slow.waitForSelector(`${joint}[data-pose="split"]`, { timeout: 10000 })
  const canvas = page.locator(`${joint} canvas`)
  const box = (await canvas.boundingBox())!
  await page.mouse.move(5, 5)
  await page.waitForTimeout(900)
  const rest = await canvas.screenshot()
  await page.waitForTimeout(700)
  assert.ok(rest.equals(await canvas.screenshot()), 'the joint holds still without a pointer')
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.2)
  await page.waitForTimeout(500)
  assert.ok(!rest.equals(await canvas.screenshot()), 'the joint tilts toward the pointer')
  const still3d = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' })
  await still3d.route('https://hozu.test/**', (route) => serve(route))
  await still3d.goto('https://hozu.test/')
  await still3d.locator(joint).scrollIntoViewIfNeeded()
  await still3d.waitForSelector(`${joint}[data-pose="joined"]`, { timeout: 15000 })
  await still3d.waitForTimeout(300)
  const shot = await still3d.locator(`${joint} canvas`).screenshot()
  const tones = await still3d.evaluate(async (png) => {
    const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob())
    const c = new OffscreenCanvas(image.width, image.height)
    const x = c.getContext('2d')!
    x.drawImage(image, 0, 0)
    const d = x.getImageData(0, 0, image.width, image.height).data
    const counts = new Map<string, number>()
    for (let i = 0; i < d.length; i += 4) {
      const [r, g, b] = [d[i]!, d[i + 1]!, d[i + 2]!]
      if (r > 150 && r - b > 18 && r - g < 40) {
        const key = `${r >> 3},${g >> 3},${b >> 3}`
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
    const faces = [...counts.entries()]
      .filter(([, n]) => n > (image.width * image.height) / 50)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([key]) => key.split(',').map((v) => Number(v) * 8))
      .map(([r, g, b]) => 0.2126 * r! + 0.7152 * g! + 0.0722 * b!)
    return faces.length < 2 ? 0 : Math.abs(faces[0]! - faces[1]!)
  }, shot.toString('base64'))
  assert.ok(
    tones >= 16,
    `the posts' front and side differ by ${tones.toFixed(1)} luminance levels (at least 16)`,
  )
  assert.equal(await page.locator('[data-ticker] input').count(), 0, 'the ticker has no pause control')
  const seam = await page.$eval('[data-ticker-track]', (track) => {
    const [a, b] = [...track.children] as HTMLElement[]
    const inside =
      a!.children[1]!.getBoundingClientRect().left - a!.children[0]!.getBoundingClientRect().right
    const across =
      b!.children[0]!.getBoundingClientRect().left - a!.lastElementChild!.getBoundingClientRect().right
    return [inside, across]
  })
  assert.ok(Math.abs(seam[0]! - seam[1]!) < 1, `the ticker's seam keeps the item spacing ${seam}`)
  const scrollbar = await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarColor)
  assert.notEqual(scrollbar, 'auto', 'the page scrollbar is styled')
  const buttons = await page.$$eval('[data-button]', (els) =>
    els
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => {
        const own = getComputedStyle(el)
        let parent = el.parentElement
        while (parent && getComputedStyle(parent).backgroundColor === 'rgba(0, 0, 0, 0)')
          parent = parent.parentElement
        const ground = parent ? getComputedStyle(parent).backgroundColor : 'rgb(255, 255, 255)'
        const edge = Number.parseFloat(own.borderTopWidth) > 0 && own.borderTopColor !== ground
        return own.backgroundColor !== ground && own.backgroundColor !== 'rgba(0, 0, 0, 0)'
          ? ''
          : edge
            ? ''
            : el.textContent
      })
      .filter(Boolean),
  )
  assert.deepEqual(buttons, [], 'every button stands out from its section')
  const docs = await browser.newPage({ viewport: { width: 360, height: 900 } })
  await docs.route('https://hozu.test/**', (route) => serve(route))
  await docs.goto('https://hozu.test/docs/getting-started/')
  await docs.waitForSelector('[data-copy]', { timeout: 10000 })
  const moved = await docs.evaluate(() => {
    const pre = [...document.querySelectorAll('pre')].find((el) => el.scrollWidth > el.clientWidth + 40)!
    const button = (pre.closest('[data-copyable]') ?? pre).querySelector('[data-copy]')!
    const at = button.getBoundingClientRect().left
    pre.scrollLeft = 200
    return [pre.scrollLeft, at, button.getBoundingClientRect().left]
  })
  assert.ok(moved[0]! > 0, 'a code block scrolled sideways')
  assert.ok(Math.abs(moved[1]! - moved[2]!) < 1, `the copy button stays put when code scrolls ${moved}`)
  const lab = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await lab.route('https://hozu.test/**', (route) => serve(route))
  await lab.goto('https://hozu.test/how-it-works/')
  await lab.waitForSelector('html[data-hozu-ready]')
  await lab.getByRole('button', { name: 'Run example' }).click()
  const entering = await lab.waitForSelector('.fade-enter-active', { timeout: 1500 })
  assert.notEqual(
    await entering.evaluate((el) => getComputedStyle(el).transitionDuration),
    '0s',
    'the lab fades its stages in',
  )
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
  console.log(
    'Joint: mounted, one canvas, split and joined on the demo, a click during load kept, still at rest, tilts on hover, faces shaded apart, 0 console errors, poster without JS',
  )
} finally {
  await browser.close()
}
assert.deepEqual(failures, [], `text below WCAG AA contrast:\n${failures.join('\n')}`)
console.log('Text contrast is at least 4.5:1 (3:1 for large text) on 7 pages')
