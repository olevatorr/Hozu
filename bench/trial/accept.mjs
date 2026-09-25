import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(new URL('../parity/package.json', import.meta.url))
const { chromium } = require('playwright-core')

const [name, cwd, entry, port, phase = '1'] = process.argv.slice(2)
const base = `http://127.0.0.1:${port}`
const server = spawn(process.execPath, [entry], {
  cwd,
  env: { ...process.env, PORT: port, HOST: '127.0.0.1', NITRO_HOST: '127.0.0.1' },
})
server.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`))
for (let i = 0; i < 100; i++) {
  try {
    await fetch(base)
    break
  } catch {
    await new Promise((r) => setTimeout(r, 100))
  }
}
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on(
  'console',
  (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(m.text()),
)
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
const items = async () =>
  (await page.locator('ul > li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim())
const has = async (title) => (await items()).some((t) => t.includes(title))
const settle = () => page.waitForTimeout(700)
const go = async (path) => {
  await page.goto(base + path, { waitUntil: 'networkidle' })
  await settle()
}
const li = (title) => page.locator('li', { hasText: title })

if (phase === '1') {
  await check('A1', 'SSR without JS contains the seeded tasks', async () => {
    const html = await (await fetch(`${base}/`)).text()
    for (const t of ['Write the spec', 'Build the app', 'Ship it']) assert(html.includes(t), `missing ${t}`)
  })
  await go('/')
  await check('A2', 'h1 Tasks and three tasks with links and badges', async () => {
    assert((await page.locator('h1').innerText()).trim() === 'Tasks', 'h1')
    assert((await items()).length === 3, `items ${(await items()).length}`)
    assert((await li('Write the spec').locator('a').getAttribute('href')) === '/tasks/t1', 'href t1')
    assert((await li('Write the spec').innerText()).includes('done'), 'badge done')
    assert((await li('Ship it').innerText()).includes('open'), 'badge open')
  })
  await check('A3', 'filters with aria-pressed', async () => {
    const btn = (t) => page.getByRole('button', { name: t, exact: true })
    assert((await btn('All').getAttribute('aria-pressed')) === 'true', 'All pressed initially')
    await btn('Open').click()
    await settle()
    assert((await btn('Open').getAttribute('aria-pressed')) === 'true', 'Open pressed')
    assert((await btn('All').getAttribute('aria-pressed')) === 'false', 'All not pressed')
    assert((await has('Ship it')) && !(await has('Write the spec')), `open list ${await items()}`)
    await btn('Done').click()
    await settle()
    assert((await has('Write the spec')) && !(await has('Ship it')), `done list ${await items()}`)
    await btn('All').click()
    await settle()
    assert((await items()).length === 3, 'all again')
  })
  await check('A4', 'browser blocks a 2-character title', async () => {
    await page.getByLabel('New task').fill('ab')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await settle()
    assert((await items()).length === 3, 'no new task')
    assert(!(await page.getByLabel('New task').evaluate((e) => e.checkValidity())), 'input invalid')
  })
  await check('A5', 'server rejects a duplicate title with role=alert', async () => {
    await page.getByLabel('New task').fill('  write the SPEC ')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await settle()
    const alert = await page.getByRole('alert').allInnerTexts()
    assert(alert.join(' ').includes('A task with this title already exists'), `alert: ${alert}`)
    assert((await items()).length === 3, 'no duplicate added')
  })
  await check('A6', 'adding a task clears the input, shows it first, survives reload', async () => {
    await page.getByLabel('New task').fill('Review the trial')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await settle()
    assert((await page.getByLabel('New task').inputValue()) === '', 'input cleared')
    assert((await items())[0]?.includes('Review the trial'), `first: ${(await items())[0]}`)
    await go('/')
    assert(await has('Review the trial'), 'after reload')
  })
  await check('A7', 'toggle persists across reload', async () => {
    await li('Write the spec').getByRole('button', { name: 'Mark open' }).click()
    await settle()
    assert((await li('Write the spec').innerText()).includes('Mark done'), 'button flips')
    await go('/')
    assert((await li('Write the spec').innerText()).includes('open'), 'persisted')
  })
  await check('A8', 'empty filter shows No tasks', async () => {
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await settle()
    assert((await page.locator('body').innerText()).includes('No tasks'), 'No tasks text')
  })
  await check('A9', 'list link opens the detail page', async () => {
    await go('/')
    await li('Build the app').locator('a').click()
    await page.waitForLoadState('networkidle')
    await settle()
    assert(new URL(page.url()).pathname === '/tasks/t2', page.url())
  })
  await check('A10', 'detail page h1, status, title, back link', async () => {
    await go('/tasks/t2')
    assert((await page.locator('h1').innerText()).trim() === 'Build the app', 'h1')
    assert((await page.locator('body').innerText()).includes('Status: open'), 'status')
    assert((await page.title()).includes('Build the app'), `title ${await page.title()}`)
    assert((await page.getByRole('link', { name: 'Back' }).getAttribute('href')) === '/', 'back')
  })
  await check('A11', 'unknown task is 404 with Task not found', async () => {
    const r = await fetch(`${base}/tasks/nope`)
    assert(r.status === 404, `status ${r.status}`)
    assert((await r.text()).includes('Task not found'), 'text')
  })
} else {
  await go('/')
  await check('B1', 'priority select defaults to normal; badges shown', async () => {
    const sel = page.getByLabel('Priority')
    assert((await sel.inputValue()) === 'normal', `default ${await sel.inputValue()}`)
    assert((await li('Ship it').innerText()).includes('normal'), 'seed badge normal')
  })
  await check('B2', 'add with high priority shows high badge, survives reload', async () => {
    await page.getByLabel('New task').fill('Urgent fix')
    await page.getByLabel('Priority').selectOption('high')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await settle()
    assert((await li('Urgent fix').innerText()).includes('high'), 'badge high')
    await go('/')
    assert((await li('Urgent fix').innerText()).includes('high'), 'after reload')
  })
  await check('B3', 'detail page shows Priority', async () => {
    await go('/tasks/t2')
    assert((await page.locator('body').innerText()).includes('Priority: normal'), 'priority line')
  })
  await check('B4', 'Clear done removes done tasks on the server', async () => {
    await go('/')
    await page.getByRole('button', { name: 'Clear done', exact: true }).click()
    await settle()
    assert(!(await has('Write the spec')), 'removed')
    await go('/')
    assert(!(await has('Write the spec')) && (await has('Ship it')), 'persisted, others kept')
    const r = await fetch(`${base}/tasks/t1`)
    assert(r.status === 404, `t1 now ${r.status}`)
  })
  await check('B5', 'phase-1 behaviour still works (duplicate alert, toggle)', async () => {
    await go('/')
    await page.getByLabel('New task').fill('ship IT')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await settle()
    assert((await page.getByRole('alert').allInnerTexts()).join(' ').includes('already exists'), 'dup')
    await li('Ship it').getByRole('button', { name: 'Mark done' }).click()
    await settle()
    await go('/')
    assert((await li('Ship it').innerText()).includes('Mark open'), 'toggle persisted')
  })
}
await check('Z', 'no page errors in the console', async () =>
  assert(errors.length === 0, errors.join(' | ').slice(0, 200)),
)
await browser.close()
server.kill()
const passed = results.filter((r) => r[2] === 'pass').length
console.log(JSON.stringify({ name, passed, total: results.length, results }, null, 1))
