import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(new URL('../../parity/package.json', import.meta.url))
const { chromium } = require('playwright-core')

const [name, cwd, entry, port, phase = '1'] = process.argv.slice(2)
const base = `http://127.0.0.1:${port}`
const transform = existsSync(join(cwd, 'node_modules/@hozu/transform'))
  ? ['--import', '@hozu/transform/register']
  : []
const server = spawn(process.execPath, [...transform, entry], {
  cwd,
  env: { ...process.env, PORT: port, HOST: '127.0.0.1', NITRO_HOST: '127.0.0.1', NODE_ENV: 'production' },
})
server.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`))
for (let i = 0; i < 150; i++) {
  try {
    await fetch(`${base}/`)
    break
  } catch {
    await new Promise((r) => setTimeout(r, 100))
  }
}
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const errors = []
const open = async ({ js = true, reduced = false } = {}) => {
  const ctx = await browser.newContext({
    javaScriptEnabled: js,
    reducedMotion: reduced ? 'reduce' : 'no-preference',
    viewport: { width: 1280, height: 1000 },
  })
  const page = await ctx.newPage()
  if (js) {
    page.on('pageerror', (e) => errors.push(e.message))
    page.on(
      'console',
      (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(m.text()),
    )
  }
  return { ctx, page }
}
const results = []
const check = async (id, what, fn) => {
  try {
    await fn()
    results.push([id, what, 'pass'])
  } catch (e) {
    results.push([id, what, `FAIL: ${String(e.message).split('\n')[0].slice(0, 160)}`])
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m)
}
const eq = (a, b, m) =>
  assert(
    JSON.stringify(a) === JSON.stringify(b),
    `${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`,
  )
const wait = (page, ms) => page.waitForTimeout(ms)
const go = async (page, p) => {
  await page.goto(base + p, { waitUntil: 'networkidle' })
  await wait(page, 400)
}
const list = async (page) =>
  page
    .locator('ul[aria-label="Stations"] > li')
    .evaluateAll((lis) => lis.map((li) => li.querySelector('button')?.textContent?.trim() ?? ''))
const totalText = async (page) =>
  /Available bikes:\s*(\d+)/.exec(await page.locator('body').innerText())?.[1] ?? null
const markers = async (page) =>
  page
    .locator('[role="region"][aria-label="Map"] .leaflet-marker-icon')
    .evaluateAll((ms) =>
      ms.map((m) => ({ title: m.getAttribute('title'), selected: m.getAttribute('data-selected') })),
    )
const table = async (page) =>
  page
    .locator('table:has(caption:text-is("Bikes by district")) tr')
    .evaluateAll((rows) =>
      rows
        .map((r) => [r.querySelector('th')?.textContent?.trim(), r.querySelector('td')?.textContent?.trim()])
        .filter(([d]) => d),
    )
const details = async (page) => {
  const region = page.locator('[role="region"][aria-label="Station details"]')
  if (!(await region.count())) return null
  const text = (await region.first().innerText()).replace(/\s+/g, ' ')
  return { name: (await region.locator('h2').first().innerText()).trim(), text }
}
const search = async (page, text) => {
  await page.getByLabel('Search', { exact: true }).fill(text)
  await wait(page, 1600)
}
const favoriteButton = (page, station) =>
  page
    .locator('ul[aria-label="Stations"] > li', {
      has: page.getByRole('button', { name: station, exact: true }),
    })
    .getByRole('button', { name: /^(Favorite|Unfavorite)$/ })
const pick = (page, station) =>
  page.locator('ul[aria-label="Stations"]').getByRole('button', { name: station, exact: true })
const globeShot = async (page) =>
  page.locator('[role="region"][aria-label="Globe"] canvas').first().screenshot()
const different = (a, b) => Buffer.compare(a, b) !== 0
const ALL = [
  'Central Station',
  'City Hall',
  'Lakeside',
  'Museum',
  'Night Market',
  'Riverside Park',
  'Tech Park',
  'Tower Plaza',
]

if (phase === '1') {
  const { page: n } = await open({ js: false })
  await check('W1', 'no JS: heading, total 62 and all stations by name', async () => {
    await go(n, '/')
    assert((await n.locator('h1').innerText()).trim() === 'City bikes', 'h1')
    eq(await totalText(n), '62', 'total')
    eq(await list(n), ALL, 'list')
  })
  await check('W2', 'no JS: /?q=park filters list and total', async () => {
    await go(n, '/?q=park')
    eq(await list(n), ['Riverside Park', 'Tech Park'], 'list')
    eq(await totalText(n), '15', 'total')
  })
  await check('W3', 'no JS: Favorite moves a station first and persists; Unfavorite restores', async () => {
    await go(n, '/')
    await favoriteButton(n, 'Museum').click()
    await n.waitForLoadState('networkidle')
    await go(n, '/')
    eq((await list(n))[0], 'Museum', 'first after favorite')
    eq(await favoriteButton(n, 'Museum').getAttribute('aria-pressed'), 'true', 'aria-pressed')
    eq((await favoriteButton(n, 'Museum').innerText()).trim(), 'Unfavorite', 'label')
    await favoriteButton(n, 'Museum').click()
    await n.waitForLoadState('networkidle')
    await go(n, '/')
    eq(await list(n), ALL, 'restored')
  })

  const { page } = await open()
  await check('W4', 'map: one titled marker per station, nothing selected', async () => {
    await go(page, '/')
    await wait(page, 800)
    const ms = await markers(page)
    eq(ms.map((m) => m.title).sort(), [...ALL].sort(), 'marker titles')
    assert(!ms.some((m) => m.selected === 'true'), 'nothing selected on load')
    assert((await details(page)) === null, 'no details on load')
  })
  await check('W5', 'clicking a marker selects its station', async () => {
    await page.locator('[role="region"][aria-label="Map"] .leaflet-marker-icon[title="Tech Park"]').click()
    await wait(page, 800)
    const d = await details(page)
    eq(d?.name, 'Tech Park', 'details name')
    assert(d.text.includes('Bikes: 15') && d.text.includes('Docks: 24'), `details text: ${d.text}`)
    const sel = (await markers(page)).filter((m) => m.selected === 'true').map((m) => m.title)
    eq(sel, ['Tech Park'], 'selected marker')
  })
  await check('W6', 'clicking a station in the list selects it on the map', async () => {
    await pick(page, 'Museum').click()
    await wait(page, 800)
    eq((await details(page))?.name, 'Museum', 'details name')
    eq(
      (await markers(page)).filter((m) => m.selected === 'true').map((m) => m.title),
      ['Museum'],
      'selected marker',
    )
  })
  await check('W7', 'details fade in', async () => {
    await pick(page, 'City Hall').click()
    const samples = []
    for (let i = 0; i < 6; i++) {
      samples.push(
        await page
          .locator('[role="region"][aria-label="Station details"]')
          .first()
          .evaluate((el) => {
            let o = 1
            for (let e = el.querySelector('h2') ?? el; e; e = e.parentElement)
              o *= Number(getComputedStyle(e).opacity)
            return o
          })
          .catch(() => null),
      )
      await wait(page, 40)
    }
    assert(
      samples.some((o) => o !== null && o < 0.95),
      `opacity samples ${samples.join(',')}`,
    )
  })
  await check('W8', 'chart: a drawn canvas and the table by district', async () => {
    const canvas = page.locator('canvas[role="img"][aria-label="Bikes by district"]')
    assert((await canvas.count()) === 1, 'one chart canvas')
    const drawn = await canvas.evaluate((c) => {
      const d = c.getContext('2d')?.getImageData(0, 0, c.width, c.height).data
      if (!d) return false
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true
      return false
    })
    assert(drawn, 'chart canvas has pixels')
    eq(
      await table(page),
      [
        ['Central', '21'],
        ['Datong', '7'],
        ['Neihu', '20'],
        ['Xinyi', '14'],
      ],
      'table',
    )
  })
  await check('W9', 'typing a search updates list, markers, table and total without reloading', async () => {
    await page.evaluate(() => {
      window.__noReload = true
    })
    await page.getByLabel('Search', { exact: true }).fill('park')
    await wait(page, 1600)
    eq(await page.evaluate(() => window.__noReload === true), true, 'no reload')
    eq(await list(page), ['Riverside Park', 'Tech Park'], 'list')
    eq((await markers(page)).map((m) => m.title).sort(), ['Riverside Park', 'Tech Park'], 'markers')
    eq(
      await table(page),
      [
        ['Datong', '0'],
        ['Neihu', '15'],
      ],
      'table',
    )
    eq(await totalText(page), '15', 'total')
  })
  await check('W10', 'the total counts to a new value (animated)', async () => {
    await page.getByLabel('Search', { exact: true }).fill('')
    const seen = new Set()
    for (let i = 0; i < 12; i++) {
      seen.add(await totalText(page))
      await wait(page, 60)
    }
    await wait(page, 1300)
    eq(await totalText(page), '62', 'final total')
    assert(
      [...seen].some((v) => v !== null && Number(v) > 15 && Number(v) < 62),
      `intermediate values: ${[...seen].join(',')}`,
    )
  })
  await check('W11', 'globe: a WebGL canvas that renders and rotates on its own', async () => {
    const a = await globeShot(page)
    await wait(page, 1000)
    const b = await globeShot(page)
    assert(a.length > 2000, 'globe canvas has content')
    assert(different(a, b), 'globe rotates')
  })
  await check('W12', 'JS: Favorite reorders at once and persists after reload', async () => {
    await favoriteButton(page, 'Tower Plaza').click()
    await wait(page, 1200)
    eq((await list(page))[0], 'Tower Plaza', 'first')
    eq(await favoriteButton(page, 'Tower Plaza').getAttribute('aria-pressed'), 'true', 'aria-pressed')
    await go(page, '/')
    eq((await list(page))[0], 'Tower Plaza', 'first after reload')
    await favoriteButton(page, 'Tower Plaza').click()
    await wait(page, 1200)
    eq(await list(page), ALL, 'restored')
  })
  const { page: r } = await open({ reduced: true })
  await check('W13', 'reduced motion: total jumps, details appear at once, globe still', async () => {
    await go(r, '/')
    await wait(r, 800)
    await r.getByLabel('Search', { exact: true }).fill('tech')
    await wait(r, 120)
    eq(await totalText(r), '15', 'total at once')
    await pick(r, 'Tech Park').click()
    await wait(r, 60)
    const o = await r
      .locator('[role="region"][aria-label="Station details"]')
      .first()
      .evaluate((el) => {
        let v = 1
        for (let e = el; e; e = e.parentElement) v *= Number(getComputedStyle(e).opacity)
        return v
      })
    assert(o > 0.95, `opacity ${o}`)
    const a = await globeShot(r)
    await wait(r, 1000)
    const b = await globeShot(r)
    assert(!different(a, b), 'globe does not rotate on its own')
  })
  await check('W14', 'dragging rotates the globe', async () => {
    const canvas = r.locator('[role="region"][aria-label="Globe"] canvas').first()
    const box = await canvas.boundingBox()
    const a = await globeShot(r)
    await r.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await r.mouse.down()
    await r.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 10, { steps: 8 })
    await r.mouse.up()
    await wait(r, 300)
    assert(different(a, await globeShot(r)), 'globe moved after drag')
  })
  await check('W15', 'no errors in the browser console', async () => {
    eq(errors, [], 'console errors')
  })
} else {
  const { page: n } = await open({ js: false })
  await check('C1', 'no JS: ?district= and ?q=&district= filter the page', async () => {
    await go(n, '/?district=Neihu')
    eq(await list(n), ['Lakeside', 'Tech Park'], 'district')
    eq(await totalText(n), '20', 'total')
    await go(n, '/?q=park&district=Datong')
    eq(await list(n), ['Riverside Park'], 'both')
  })
  const { page } = await open()
  const district = (value) => page.getByLabel('District', { exact: true }).selectOption({ label: value })
  await check('C2', 'District select: All districts first, then districts sorted', async () => {
    await go(page, '/')
    await wait(page, 600)
    const options = await page.getByLabel('District', { exact: true }).locator('option').allInnerTexts()
    eq(
      options.map((o) => o.trim()),
      ['All districts', 'Central', 'Datong', 'Neihu', 'Xinyi'],
      'options',
    )
  })
  await check('C3', 'choosing a district narrows list, markers, table and total', async () => {
    await district('Neihu')
    await wait(page, 1600)
    eq(await list(page), ['Lakeside', 'Tech Park'], 'list')
    eq((await markers(page)).map((m) => m.title).sort(), ['Lakeside', 'Tech Park'], 'markers')
    eq(await table(page), [['Neihu', '20']], 'table')
    eq(await totalText(page), '20', 'total')
  })
  await check('C4', 'district and search combine', async () => {
    await search(page, 'tech')
    eq(await list(page), ['Tech Park'], 'list')
    await search(page, '')
    await district('All districts')
    await wait(page, 1600)
    eq(await list(page), ALL, 'back to all')
  })
  await check('C5', 'the tour moves the selection every 1.5 s and wraps', async () => {
    await district('Neihu')
    await wait(page, 800)
    await page.getByRole('button', { name: 'Start tour', exact: true }).click()
    const seen = []
    for (let i = 0; i < 12; i++) {
      seen.push((await details(page))?.name ?? null)
      await wait(page, 400)
    }
    const changes = seen.filter((v, i) => i > 0 && v !== seen[i - 1]).length
    assert(seen.find((v) => v) === 'Lakeside', `starts at the first visible station: ${seen.join(',')}`)
    assert(changes >= 2 && seen.includes('Tech Park'), `moves and wraps: ${seen.join(',')}`)
    assert(
      (await page.getByRole('button', { name: 'Stop tour', exact: true }).count()) === 1,
      'Stop tour shown',
    )
  })
  await check('C6', 'Stop tour stops it', async () => {
    await page.getByRole('button', { name: 'Stop tour', exact: true }).click()
    const a = (await details(page))?.name
    await wait(page, 2200)
    eq((await details(page))?.name, a, 'selection unchanged')
    assert(
      (await page.getByRole('button', { name: 'Start tour', exact: true }).count()) === 1,
      'Start tour back',
    )
  })
  await check('C7', 'changing the search stops the tour', async () => {
    await page.getByRole('button', { name: 'Start tour', exact: true }).click()
    await wait(page, 300)
    await page.getByLabel('Search', { exact: true }).fill('lake')
    await wait(page, 600)
    const a = (await details(page))?.name
    await wait(page, 2200)
    eq((await details(page))?.name, a, 'selection unchanged')
    assert(
      (await page.getByRole('button', { name: 'Start tour', exact: true }).count()) === 1,
      'Start tour back',
    )
  })
  await check('C8', 'no errors in the browser console', async () => {
    eq(errors, [], 'console errors')
  })
}

await browser.close()
server.kill()
const passed = results.filter((r) => r[2] === 'pass').length
console.log(JSON.stringify({ name, phase, passed, total: results.length, results }, null, 1))
