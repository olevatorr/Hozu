import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(new URL('../../parity/package.json', import.meta.url))
const { chromium } = require('playwright-core')

const [name, cwd, entry, port, phase = '1'] = process.argv.slice(2)
const base = `http://127.0.0.1:${port}`
const server = spawn(process.execPath, [entry], {
  cwd,
  env: { ...process.env, PORT: port, HOST: '127.0.0.1', NITRO_HOST: '127.0.0.1', NODE_ENV: 'production' },
})
server.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`))
for (let i = 0; i < 100; i++) {
  try {
    await fetch(`${base}/login`)
    break
  } catch {
    await new Promise((r) => setTimeout(r, 100))
  }
}
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH })
const errors = []
const context = async (javaScriptEnabled = true) => {
  const ctx = await browser.newContext({ javaScriptEnabled })
  const page = await ctx.newPage()
  if (javaScriptEnabled) {
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
const settle = (page, ms = 700) => page.waitForTimeout(ms)
const items = async (page) =>
  (await page.locator('ul > li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim())
const has = async (page, text) => (await items(page)).some((t) => t.includes(text))
const count = async (page) => /Notes:\s*(\d+)/.exec(await page.locator('body').innerText())?.[1] ?? null
const path = (page) => new URL(page.url()).pathname
const alert = async (page) =>
  (await page.locator('[role="alert"]').allInnerTexts()).map((t) => t.trim()).filter(Boolean)
const go = async (page, p) => {
  await page.goto(base + p, { waitUntil: 'networkidle' })
  await settle(page, 300)
}
const signIn = async (page, who) => {
  await go(page, '/login')
  await page.getByLabel('Name', { exact: true }).fill(who)
  await Promise.all([
    page.waitForURL((u) => new URL(u).pathname === '/', { timeout: 8000 }),
    page.getByRole('button', { name: 'Sign in', exact: true }).click(),
  ])
  await page.waitForLoadState('networkidle')
  await settle(page, 500)
}
const add = async (page, text) => {
  await page.getByLabel('New note', { exact: true }).fill(text)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.waitForLoadState('networkidle')
  await settle(page)
}
const liButton = (page, text, label) =>
  page.locator('ul > li', { hasText: text }).getByRole('button', { name: label, exact: true })
const click = async (page, locator) => {
  await locator.click()
  await page.waitForLoadState('networkidle')
  await settle(page)
}

const { ctx: adaCtx, page: ada } = await context()
const { ctx: bobCtx, page: bob } = await context()

if (phase === '1') {
  await check('N1', 'signed out: / redirects to /login', async () => {
    const res = await fetch(`${base}/`, { redirect: 'manual' })
    assert(res.status >= 300 && res.status < 400, `status ${res.status}`)
    assert(new URL(res.headers.get('location') ?? '', base).pathname === '/login', 'location')
    await go(ada, '/')
    assert(path(ada) === '/login', `landed on ${path(ada)}`)
  })
  await check('N2', 'sign-in page: h1, labelled Name input, Sign in button', async () => {
    assert((await ada.locator('h1').innerText()).trim() === 'Sign in', 'h1')
    assert((await ada.getByLabel('Name', { exact: true }).count()) === 1, 'Name input')
  })
  await check('N3', 'ada signs in and sees her two notes', async () => {
    await signIn(ada, 'ada')
    assert((await ada.locator('h1').innerText()).trim() === 'Notes', 'h1')
    assert((await ada.locator('body').innerText()).includes('Signed in as ada'), 'signed in as')
    assert((await count(ada)) === '2', `count ${await count(ada)}`)
    const list = await items(ada)
    assert(list.length === 2 && list[0].includes('Buy milk') && list[1].includes('Call Bob'), `list ${list}`)
  })
  await check('N4', 'every cookie is HttpOnly', async () => {
    const cookies = await adaCtx.cookies()
    assert(cookies.length > 0, 'no cookie')
    for (const c of cookies) assert(c.httpOnly, `${c.name} not HttpOnly`)
  })
  await check('N5', 'bob, signed in at the same time, sees only his note; ada never sees it', async () => {
    await signIn(bob, 'bob')
    const list = await items(bob)
    assert(list.length === 1 && list[0].includes("Bob's secret"), `bob list ${list}`)
    assert((await count(bob)) === '1', 'bob count')
    await go(ada, '/')
    assert(!(await has(ada, "Bob's secret")), 'ada sees bob')
    assert((await items(ada)).length === 2, 'ada list')
  })
  await check('N6', "the HTML sent to bob contains none of ada's notes", async () => {
    const cookie = (await bobCtx.cookies()).map((c) => `${c.name}=${c.value}`).join('; ')
    const html = await (await fetch(`${base}/`, { headers: { cookie } })).text()
    assert(html.includes('Bob'), 'bob page')
    assert(!html.includes('Buy milk') && !html.includes('Call Bob'), "ada's notes in bob's HTML")
  })
  await check('N7', 'add with JS: first in the list, count updates, input cleared', async () => {
    await add(ada, 'Pay rent')
    assert((await items(ada))[0]?.includes('Pay rent'), `list ${await items(ada)}`)
    assert((await count(ada)) === '3', `count ${await count(ada)}`)
    assert((await ada.getByLabel('New note', { exact: true }).inputValue()) === '', 'input not cleared')
  })
  await check('N8', 'duplicate (any case, spaces) shows the alert and adds nothing', async () => {
    await add(ada, '  buy MILK ')
    assert(
      (await alert(ada)).some((t) => t.includes('You already have this note')),
      `alert ${await alert(ada)}`,
    )
    assert((await count(ada)) === '3', `count ${await count(ada)}`)
  })
  await check('N9', 'the browser limits a note to 100 characters', async () => {
    const max = await ada.getByLabel('New note', { exact: true }).getAttribute('maxlength')
    assert(max === '100', `maxlength ${max}`)
  })
  await check('N10', 'double click on Add adds once, with no error shown', async () => {
    await go(ada, '/')
    await ada.getByLabel('New note', { exact: true }).fill('Double')
    await ada.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Add')
      button?.click()
      button?.click()
    })
    await ada.waitForLoadState('networkidle')
    await settle(ada, 1200)
    const n = (await items(ada)).filter((t) => t.includes('Double')).length
    assert(n === 1, `Double listed ${n} times`)
    assert((await count(ada)) === '4', `count ${await count(ada)}`)
    assert((await alert(ada)).length === 0, `alert shown: ${await alert(ada)}`)
  })
  await check('N11', 'delete with JS', async () => {
    await click(ada, liButton(ada, 'Call Bob', 'Delete'))
    assert(!(await has(ada, 'Call Bob')), 'still listed')
    assert((await count(ada)) === '3', `count ${await count(ada)}`)
  })
  await check('N12', 'changes survive a reload', async () => {
    await go(ada, '/')
    assert((await has(ada, 'Pay rent')) && !(await has(ada, 'Call Bob')), `list ${await items(ada)}`)
  })
  await check('N13', 'without JS: sign in, add, duplicate alert, delete, sign out', async () => {
    const { ctx, page } = await context(false)
    await go(page, '/')
    assert(path(page) === '/login', `landed on ${path(page)}`)
    await signIn(page, 'carl')
    assert((await page.locator('body').innerText()).includes('Signed in as carl'), 'signed in')
    assert((await count(page)) === '0', `count ${await count(page)}`)
    await add(page, 'First')
    assert(await has(page, 'First'), 'added')
    await add(page, ' first ')
    assert(
      (await alert(page)).some((t) => t.includes('You already have this note')),
      'duplicate alert',
    )
    await go(page, '/')
    await click(page, liButton(page, 'First', 'Delete'))
    assert(!(await has(page, 'First')), 'deleted')
    await click(page, page.getByRole('button', { name: 'Sign out', exact: true }))
    assert(path(page) === '/login', `after sign out ${path(page)}`)
    await go(page, '/')
    assert(path(page) === '/login', 'still signed in')
    await ctx.close()
  })
  await check('N14', 'sign out with JS', async () => {
    await go(bob, '/')
    await click(bob, bob.getByRole('button', { name: 'Sign out', exact: true }))
    assert(path(bob) === '/login', `after sign out ${path(bob)}`)
    await go(bob, '/')
    assert(path(bob) === '/login', 'still signed in')
  })
  await check('N15', 'no console errors', async () => {
    assert(errors.length === 0, errors.join(' | '))
  })
}

if (phase === '2') {
  await signIn(ada, 'ada')
  await check('P1', 'pin with JS moves the note first and marks it pinned', async () => {
    await click(ada, liButton(ada, 'Call Bob', 'Pin'))
    const list = await items(ada)
    assert(list[0]?.includes('Call Bob') && list[0].includes('pinned'), `list ${list}`)
    assert((await liButton(ada, 'Call Bob', 'Unpin').count()) === 1, 'Unpin button')
  })
  await check('P2', 'pinning survives a reload and does not affect other users', async () => {
    await go(ada, '/')
    assert((await items(ada))[0]?.includes('Call Bob'), 'order after reload')
    await signIn(bob, 'bob')
    assert(!(await items(bob)).some((t) => t.includes('pinned')), 'bob sees a pin')
  })
  await check('P3', 'unpin', async () => {
    await click(ada, liButton(ada, 'Call Bob', 'Unpin'))
    const list = await items(ada)
    assert(!list.some((t) => t.includes('pinned')), `list ${list}`)
    assert(list[0]?.includes('Buy milk'), `order ${list}`)
  })
  await check('P4', 'search filters in the browser; the count stays the total', async () => {
    const search = ada.getByLabel('Search', { exact: true })
    await search.fill('MILK')
    await settle(ada)
    const list = await items(ada)
    assert(list.length === 1 && list[0].includes('Buy milk'), `list ${list}`)
    assert((await count(ada)) === '2', `count ${await count(ada)}`)
    await search.fill('zzz')
    await settle(ada)
    assert((await ada.locator('body').innerText()).includes('No notes match'), 'no match text')
    assert((await items(ada)).length === 0, 'list not empty')
  })
  await check('P5', 'pin and unpin without JS', async () => {
    const { ctx, page } = await context(false)
    await signIn(page, 'dora')
    await add(page, 'Alpha')
    await add(page, 'Beta')
    await click(page, liButton(page, 'Alpha', 'Pin'))
    const list = await items(page)
    assert(list[0]?.includes('Alpha') && list[0].includes('pinned'), `list ${list}`)
    await click(page, liButton(page, 'Alpha', 'Unpin'))
    assert((await items(page))[0]?.includes('Beta'), 'unpinned order')
    await ctx.close()
  })
  await check('P6', 'no console errors', async () => {
    assert(errors.length === 0, errors.join(' | '))
  })
}

await adaCtx.close()
await bobCtx.close()
await browser.close()
server.kill()
const passed = results.filter((r) => r[2] === 'pass').length
console.log(JSON.stringify({ name, phase, passed, total: results.length, results }, null, 1))
process.exit(0)
