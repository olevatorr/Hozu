import { type ChildProcess, spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pixelmatch from 'pixelmatch'
import { chromium, type Page } from 'playwright-core'
import { PNG } from 'pngjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const out = join(here, 'out')
mkdirSync(out, { recursive: true })

const servers: ChildProcess[] = []
const start = (cwd: string, entry: string, port: number) =>
  new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, [entry], { cwd, env: { ...process.env, PORT: String(port) } })
    servers.push(child)
    child.stdout!.on('data', () => resolve(`http://127.0.0.1:${port}`))
    child.stderr!.on('data', (d) => process.stderr.write(d))
    child.on('exit', (code) => reject(new Error(`${entry} exited with ${code}`)))
  })

const [tenon, nuxt] = await Promise.all([
  start(join(here, '../../examples/showcase'), 'serve.ts', 4611),
  start(join(here, 'nuxt'), '.output/server/index.mjs', 4612),
])

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--font-render-hinting=none'],
})

type State = 'initial' | 'hover' | 'focus' | 'interacted'
const states: State[] = ['initial', 'hover', 'focus', 'interacted']
const widths = [375, 768, 1440]
const schemes = ['light', 'dark'] as const

async function prepare(page: Page, state: State) {
  if (state === 'hover') await page.hover('#features article')
  if (state === 'focus') await page.focus('#title')
  if (state === 'interacted') {
    await page.click('button[role="tab"]:has-text("build")')
    await page.fill('#title', 'Ship it')
    await page.press('#title', 'Enter')
    await page.selectOption('select[aria-label="Metric"]', 'signups')
    await page.click('#features')
  }
  await page.waitForTimeout(400)
}

async function capture(base: string, width: number, scheme: 'light' | 'dark', state: State) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    colorScheme: scheme,
    reducedMotion: 'reduce',
    deviceScaleFactor: 1,
  })
  const page = await context.newPage()
  await page.goto(`${base}/`, { waitUntil: 'networkidle' })
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 300) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 60))
    }
    window.scrollTo(0, 0)
  })
  await page.waitForTimeout(600)
  await prepare(page, state)
  const shot = await page.screenshot({
    fullPage: true,
    mask: [page.locator('canvas')],
    animations: 'disabled',
  })
  await context.close()
  return PNG.sync.read(shot)
}

interface Row {
  width: number
  scheme: string
  state: State
  heights: [number, number]
  diff: number
}
const rows: Row[] = []
for (const width of widths)
  for (const scheme of schemes)
    for (const state of states) {
      const a = await capture(tenon, width, scheme, state)
      const b = await capture(nuxt, width, scheme, state)
      const height = Math.min(a.height, b.height)
      const crop = (img: PNG) => {
        const c = new PNG({ width, height })
        PNG.bitblt(img, c, 0, 0, width, height, 0, 0)
        return c
      }
      const [ca, cb] = [crop(a), crop(b)]
      const diff = new PNG({ width, height })
      const pixels = pixelmatch(ca.data, cb.data, diff.data, width, height, { threshold: 0.1 })
      const name = `${width}-${scheme}-${state}`
      if (pixels) writeFileSync(join(out, `${name}-diff.png`), PNG.sync.write(diff))
      writeFileSync(join(out, `${name}-tenon.png`), PNG.sync.write(a))
      writeFileSync(join(out, `${name}-nuxt.png`), PNG.sync.write(b))
      rows.push({ width, scheme, state, heights: [a.height, b.height], diff: pixels / (width * height) })
      console.log(name, a.height, b.height, `${((pixels / (width * height)) * 100).toFixed(3)}%`)
    }

const noise: Record<string, number> = {}
for (const [name, base] of [
  ['tenon', tenon],
  ['nuxt', nuxt],
] as const)
  for (const width of widths) {
    const a = await capture(base, width, 'light', 'initial')
    const b = await capture(base, width, 'light', 'initial')
    const height = Math.min(a.height, b.height)
    const crop = (img: PNG) => {
      const c = new PNG({ width, height })
      PNG.bitblt(img, c, 0, 0, width, height, 0, 0)
      return c
    }
    noise[`${name} ${width}`] =
      pixelmatch(crop(a).data, crop(b).data, null, width, height, { threshold: 0.1 }) / (width * height)
  }

async function metrics(base: string) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const bytes = { js: 0, css: 0, html: 0 }
  page.on('response', async (r) => {
    const type = r.headers()['content-type'] ?? ''
    const size = (await r.body().catch(() => Buffer.alloc(0))).length
    if (type.includes('javascript')) bytes.js += size
    else if (type.includes('css')) bytes.css += size
    else if (type.includes('html')) bytes.html += size
  })
  await page.addInitScript(() => {
    ;(window as unknown as { __cls: number }).__cls = 0
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[])
        if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value
    }).observe({ type: 'layout-shift', buffered: true })
  })
  await page.goto(`${base}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  const timing = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
    return {
      dcl: nav.domContentLoadedEventEnd,
      load: nav.loadEventEnd,
      cls: (window as unknown as { __cls: number }).__cls,
    }
  })
  await context.close()
  return { ...bytes, ...timing }
}

const perf = { tenon: await metrics(tenon), nuxt: await metrics(nuxt) }
await browser.close()
for (const s of servers) s.kill()

writeFileSync(join(out, 'results.json'), `${JSON.stringify({ rows, noise, perf }, null, 2)}\n`)
const pct = (x: number) => `${(x * 100).toFixed(3)}%`
console.log('\n| Viewport | Scheme | State | Height (Tenon / Nuxt) | Pixel diff |\n|---|---|---|---|---|')
for (const r of rows)
  console.log(
    `| ${r.width} | ${r.scheme} | ${r.state} | ${r.heights[0]} / ${r.heights[1]} | ${pct(r.diff)} |`,
  )
console.log(
  '\nNoise floor (same framework, two loads):',
  Object.entries(noise)
    .map(([k, v]) => `${k}: ${pct(v)}`)
    .join(', '),
)
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`
console.log(
  '\n| | HTML | CSS | JS (all, incl. lazy widgets) | DOMContentLoaded | load | CLS |\n|---|---|---|---|---|---|---|',
)
for (const [name, p] of Object.entries(perf))
  console.log(
    `| ${name} | ${kb(p.html)} | ${kb(p.css)} | ${kb(p.js)} | ${p.dcl.toFixed(0)} ms | ${p.load.toFixed(0)} ms | ${p.cls.toFixed(4)} |`,
  )
