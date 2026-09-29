import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(new URL('../../parity/package.json', import.meta.url))
const { chromium } = require('playwright-core')

const [name, cwd, entry, port, stepArg, only] = process.argv.slice(2)
const step = Number(stepArg)
const base = `http://127.0.0.1:${port}`

const vocab = (k) => ({
  home: k >= 9 ? '/notes' : '/',
  addLabel: k >= 4 ? 'Title' : 'New note',
  dup: k >= 4 ? 'You already have a note with this title' : 'You already have this note',
  max: k >= 2 ? 60 : 100,
  tags: k >= 6 && k < 20,
  exportKeys:
    k >= 20
      ? ['archived', 'createdAt', 'pinned', 'title']
      : ['archived', 'createdAt', 'pinned', 'tags', 'title'],
})
const V = vocab(step)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const assert = (c, m) => {
  if (!c) throw new Error(m)
}
const errors = []
let browser

const newPage = async (javaScriptEnabled = true) => {
  const ctx = await browser.newContext({ javaScriptEnabled })
  const page = await ctx.newPage()
  page.setDefaultTimeout(10000)
  page.setDefaultNavigationTimeout(15000)
  if (javaScriptEnabled) {
    page.on('pageerror', (e) => errors.push(e.message))
    page.on(
      'console',
      (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(m.text()),
    )
  }
  return page
}
const settle = (page, ms = 700) => page.waitForTimeout(ms)
const text = async (page) => (await page.locator('body').innerText()).replace(/[ \t]+/g, ' ')
const norm = (t) => t.replace(/\s+/g, ' ').trim()
const noteItems = (page, button = 'Delete') =>
  page.locator('li').filter({ has: page.getByRole('button', { name: button, exact: true }) })
const items = async (page, button) => (await noteItems(page, button).allInnerTexts()).map(norm)
const has = async (page, t) => (await items(page)).some((x) => x.includes(t))
const count = async (page) => /Notes:\s*(\d+)/.exec(await text(page))?.[1] ?? null
const path = (page) => new URL(page.url()).pathname
const alerts = async (page) =>
  (await page.locator('[role="alert"]').allInnerTexts()).map((t) => t.trim()).filter(Boolean)
const statuses = async (page) =>
  (await page.locator('[role="status"]').allInnerTexts()).map(norm).filter(Boolean)
const hasAlert = async (page, t) => (await alerts(page)).some((a) => a.includes(t))
const go = async (page, p) => {
  await page.goto(base + p, { waitUntil: 'networkidle' })
  await settle(page, 300)
}
const signIn = async (page, who, home = V.home) => {
  await go(page, '/login')
  await page.getByLabel('Name', { exact: true }).fill(who)
  await Promise.all([
    page.waitForURL((u) => new URL(u).pathname === home, { timeout: 8000 }),
    page.getByRole('button', { name: 'Sign in', exact: true }).click(),
  ])
  await page.waitForLoadState('networkidle')
  await settle(page, 500)
}
const add = async (page, title, tags) => {
  await page.getByLabel(V.addLabel, { exact: true }).fill(title)
  if (tags !== undefined && V.tags) await page.getByLabel('Tags', { exact: true }).fill(tags)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.waitForLoadState('networkidle')
  await settle(page)
}
const liWith = (page, t) => page.locator('li', { hasText: t })
const liButton = (page, t, label) => liWith(page, t).getByRole('button', { name: label, exact: true })
const click = async (page, locator) => {
  await locator.click()
  await page.waitForLoadState('networkidle')
  await settle(page)
}
const control = (page, label) =>
  page
    .getByRole('button', { name: label, exact: true })
    .or(page.getByRole('link', { name: label, exact: true }))
    .first()
const cookieHeader = async (page) =>
  (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ')
const fetchAs = async (page, p, init = {}) =>
  fetch(base + p, { redirect: 'manual', ...init, headers: { cookie: await cookieHeader(page) } })
const isRedirectTo = (res, target) =>
  res.status >= 300 &&
  res.status < 400 &&
  new URL(res.headers.get('location') ?? '', base).pathname === target
const datetimeOf = async (page, t) => liWith(page, t).locator('time').first().getAttribute('datetime')
const sharedItems = async (page) =>
  (
    await page.locator('xpath=//h2[normalize-space()="Shared with me"]/following::ul[1]/li').allInnerTexts()
  ).map(norm)
const user = (id) => `u${id.toLowerCase().replace(/\d/g, (d) => 'abcdefghij'[d])}`
const fresh = async (id, js = true, suffix = '') => {
  const page = await newPage(js)
  await signIn(page, user(id) + suffix)
  return page
}
const edit = async (page, t, next) => {
  await click(page, liButton(page, t, 'Edit'))
  const input = page.getByLabel('Edit title', { exact: true })
  await input.fill(next)
  await click(page, page.getByRole('button', { name: 'Save', exact: true }))
}
const adminRows = async (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('table tr')].map((tr) =>
      [...tr.querySelectorAll('td,th')].map((c) => c.textContent.trim()),
    ),
  )

const checks = []
const check = (id, since, what, spec, run, until = Infinity) =>
  checks.push({ id, since, until, what, spec, run })

check(
  'N1',
  0,
  'signed out: the list page redirects to /login',
  'When nobody is signed in, the request is redirected to /login.',
  async () => {
    assert(
      isRedirectTo(await fetch(base + V.home, { redirect: 'manual' }), '/login'),
      'no redirect to /login',
    )
    const page = await newPage()
    await go(page, V.home)
    assert(path(page) === '/login', `landed on ${path(page)}`)
  },
)
check(
  'N2',
  0,
  'sign-in page: h1, labelled Name input, Sign in button',
  '<h1> Sign in, input labelled Name, button Sign in',
  async () => {
    const page = await newPage()
    await go(page, '/login')
    assert(norm(await page.locator('h1').innerText()) === 'Sign in', 'h1')
    assert((await page.getByLabel('Name', { exact: true }).count()) === 1, 'Name input')
    assert((await page.getByRole('button', { name: 'Sign in', exact: true }).count()) === 1, 'button')
  },
)
check(
  'N3',
  0,
  'ada signs in and sees her two notes',
  'seeded ada: Buy milk, Call Bob (newest first); Notes: <count>; Signed in as <name>',
  async () => {
    const page = await newPage()
    await signIn(page, 'ada')
    assert(norm(await page.locator('h1').innerText()) === 'Notes', 'h1')
    assert((await text(page)).includes('Signed in as ada'), 'signed in as')
    assert((await count(page)) === '2', `count ${await count(page)}`)
    const list = await items(page)
    assert(list.length === 2 && list[0].includes('Buy milk') && list[1].includes('Call Bob'), `list ${list}`)
  },
)
check('N4', 0, 'every cookie is HttpOnly', 'The cookie must be HttpOnly.', async () => {
  const page = await newPage()
  await signIn(page, 'ada')
  const cookies = await page.context().cookies()
  assert(cookies.length > 0, 'no cookie')
  for (const c of cookies) assert(c.httpOnly, `${c.name} not HttpOnly`)
})
check(
  'N5',
  0,
  'ada and bob at the same time see only their own notes',
  'Every user sees only their own notes, also when several users are signed in at the same time',
  async () => {
    const ada = await newPage()
    const bob = await newPage()
    await signIn(ada, 'ada')
    await signIn(bob, 'bob')
    const list = await items(bob)
    assert(list.length === 1 && list[0].includes("Bob's secret"), `bob list ${list}`)
    assert((await count(bob)) === '1', 'bob count')
    await go(ada, V.home)
    assert(!(await has(ada, "Bob's secret")), 'ada sees bob')
    assert((await items(ada)).length === 2, 'ada list')
  },
)
check(
  'N6',
  0,
  "the HTML sent to bob contains none of ada's notes",
  'Every user sees only their own notes',
  async () => {
    const bob = await newPage()
    await signIn(bob, 'bob')
    const html = await (await fetchAs(bob, V.home)).text()
    assert(
      html.includes("Bob's secret") || html.includes('Bob&#39;s secret') || html.includes('Bob&#x27;s'),
      'bob page',
    )
    assert(!html.includes('Buy milk') && !html.includes('Call Bob'), "ada's notes in bob's HTML")
  },
)
check(
  'N7',
  0,
  'add with JS: first in the list, count updates, input cleared',
  'on success the input is cleared and the new note appears first in the list',
  async () => {
    const page = await fresh('N7')
    await add(page, 'First one')
    await add(page, 'Pay rent')
    assert((await items(page))[0]?.includes('Pay rent'), `list ${await items(page)}`)
    assert((await count(page)) === '2', `count ${await count(page)}`)
    assert((await page.getByLabel(V.addLabel, { exact: true }).inputValue()) === '', 'input not cleared')
  },
)
check(
  'N8',
  0,
  'duplicate (any case, spaces) shows the alert and adds nothing',
  'the server rejects a note the user already has (case-insensitive, after trimming)',
  async () => {
    const page = await fresh('N8')
    await add(page, 'Pay rent')
    await add(page, '  pay RENT ')
    assert(await hasAlert(page, V.dup), `alert ${await alerts(page)}`)
    assert((await count(page)) === '1', `count ${await count(page)}`)
  },
)
check(
  'N9',
  0,
  `the browser limits a note to ${V.max} characters`,
  'the browser should block longer input',
  async () => {
    const page = await fresh('N9')
    const max = await page.getByLabel(V.addLabel, { exact: true }).getAttribute('maxlength')
    assert(max === String(V.max), `maxlength ${max}`)
  },
)
check(
  'N10',
  0,
  'double click on Add adds once, with no error shown',
  'clicking Add twice quickly must add the note only once',
  async () => {
    const page = await fresh('N10')
    await page.getByLabel(V.addLabel, { exact: true }).fill('Double')
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Add')
      button?.click()
      button?.click()
    })
    await page.waitForLoadState('networkidle')
    await settle(page, 1500)
    const n = (await items(page)).filter((t) => t.includes('Double')).length
    assert(n === 1, `Double listed ${n} times`)
    assert((await count(page)) === '1', `count ${await count(page)}`)
    assert((await alerts(page)).length === 0, `alert shown: ${await alerts(page)}`)
  },
)
check('N11', 0, 'delete with JS', 'each note is an <li> with a button Delete that removes it', async () => {
  const page = await fresh('N11')
  await add(page, 'Keep me')
  await add(page, 'Drop me')
  await click(page, liButton(page, 'Drop me', 'Delete'))
  assert(!(await has(page, 'Drop me')), 'still listed')
  assert((await count(page)) === '1', `count ${await count(page)}`)
})
check(
  'N12',
  0,
  'changes survive a reload',
  'Data changes persist across page reloads while the server runs.',
  async () => {
    const page = await fresh('N12')
    await add(page, 'Keep me')
    await add(page, 'Drop me')
    await click(page, liButton(page, 'Drop me', 'Delete'))
    await go(page, V.home)
    assert((await has(page, 'Keep me')) && !(await has(page, 'Drop me')), `list ${await items(page)}`)
  },
)
check(
  'N13',
  0,
  'without JS: sign in, add, duplicate alert, delete, sign out',
  'Everything on this page and on /login must also work with JavaScript disabled',
  async () => {
    const page = await newPage(false)
    await go(page, V.home)
    assert(path(page) === '/login', `landed on ${path(page)}`)
    await signIn(page, user('N13'))
    assert((await text(page)).includes(`Signed in as ${user('N13')}`), 'signed in')
    assert((await count(page)) === '0', `count ${await count(page)}`)
    await add(page, 'First')
    assert(await has(page, 'First'), 'added')
    await add(page, ' first ')
    assert(await hasAlert(page, V.dup), 'duplicate alert')
    await go(page, V.home)
    await click(page, liButton(page, 'First', 'Delete'))
    assert(!(await has(page, 'First')), 'deleted')
    await click(page, page.getByRole('button', { name: 'Sign out', exact: true }))
    assert(path(page) === '/login', `after sign out ${path(page)}`)
    await go(page, V.home)
    assert(path(page) === '/login', 'still signed in')
  },
)
check(
  'N14',
  0,
  'sign out with JS',
  'After signing out the browser ends up on /login, and / redirects to /login again.',
  async () => {
    const page = await fresh('N14')
    await click(page, page.getByRole('button', { name: 'Sign out', exact: true }))
    assert(path(page) === '/login', `after sign out ${path(page)}`)
    await go(page, V.home)
    assert(path(page) === '/login', 'still signed in')
  },
)

const twoPinned = async (page) => {
  await add(page, 'Alpha')
  await add(page, 'Beta')
  await click(page, liButton(page, 'Alpha', 'Pin'))
}
check(
  'P1',
  1,
  'pin with JS moves the note first and marks it pinned',
  'Pinned notes are listed before the others, and their <li> contains the text pinned.',
  async () => {
    const page = await fresh('P1')
    await twoPinned(page)
    const list = await items(page)
    assert(list[0]?.includes('Alpha') && list[0].includes('pinned'), `list ${list}`)
    assert((await liButton(page, 'Alpha', 'Unpin').count()) === 1, 'Unpin button')
  },
)
check(
  'P2',
  1,
  'pinning survives a reload and does not affect other users',
  'Pinning is stored on the server per user',
  async () => {
    const page = await fresh('P2')
    await twoPinned(page)
    await go(page, V.home)
    assert((await items(page))[0]?.includes('Alpha'), 'order after reload')
    const bob = await newPage()
    await signIn(bob, 'bob')
    assert(!(await items(bob)).some((t) => t.includes('pinned')), 'bob sees a pin')
  },
)
check('P3', 1, 'unpin', 'button Pin (unpinned note) or Unpin (pinned note)', async () => {
  const page = await fresh('P3')
  await twoPinned(page)
  await click(page, liButton(page, 'Alpha', 'Unpin'))
  const list = await items(page)
  assert(!list.some((t) => t.includes('pinned')), `list ${list}`)
  assert(list[0]?.includes('Beta'), `order ${list}`)
})
check(
  'P4',
  1,
  'search filters in the browser; the count stays the total',
  'Typing filters the list in the browser … No notes match … Notes: <count> still shows the total',
  async () => {
    const page = await fresh('P4')
    await add(page, 'Buy milk')
    await add(page, 'Call Bob')
    const search = page.getByLabel('Search', { exact: true })
    await search.fill('MILK')
    await settle(page)
    const list = await items(page)
    assert(list.length === 1 && list[0].includes('Buy milk'), `list ${list}`)
    assert((await count(page)) === '2', `count ${await count(page)}`)
    await search.fill('zzz')
    await settle(page)
    assert((await text(page)).includes('No notes match'), 'no match text')
    assert((await items(page)).length === 0, 'list not empty')
  },
)
check(
  'P5',
  1,
  'pin and unpin without JS',
  'Pinning and unpinning also work with JavaScript disabled.',
  async () => {
    const page = await fresh('P5', false)
    await twoPinned(page)
    const list = await items(page)
    assert(list[0]?.includes('Alpha') && list[0].includes('pinned'), `list ${list}`)
    await click(page, liButton(page, 'Alpha', 'Unpin'))
    assert((await items(page))[0]?.includes('Beta'), 'unpinned order')
  },
)

const tooLong = 'x'.repeat(61)
const forceAdd = async (page, title) => {
  await page.evaluate(() => {
    for (const i of document.querySelectorAll('input[maxlength]')) i.removeAttribute('maxlength')
  })
  await add(page, title)
}
check(
  'L1',
  2,
  'the server rejects 61 characters (no JS)',
  'The server rejects a longer note … Use at most 60 characters in role="alert". Nothing is added.',
  async () => {
    const page = await fresh('L1', false)
    await forceAdd(page, tooLong)
    assert(await hasAlert(page, 'Use at most 60 characters'), `alert ${await alerts(page)}`)
    assert((await count(page)) === '0', `count ${await count(page)}`)
  },
)
check(
  'L2',
  2,
  'a 61-character note is refused with JS too',
  'the page shows the text Use at most 60 characters … Nothing is added.',
  async () => {
    const page = await fresh('L2')
    await forceAdd(page, tooLong)
    assert(await hasAlert(page, 'Use at most 60 characters'), `alert ${await alerts(page)}`)
    await go(page, V.home)
    assert((await count(page)) === '0', `count ${await count(page)}`)
  },
)

check(
  'T1',
  3,
  'seeded notes show their creation date',
  '<time datetime> in ISO 8601 UTC and Added <YYYY-MM-DD>; seeded Buy milk 2026-01-15T09:00:00.000Z',
  async () => {
    const page = await newPage()
    await signIn(page, 'ada')
    const dt = await datetimeOf(page, 'Buy milk')
    assert(Date.parse(dt ?? '') === Date.parse('2026-01-15T09:00:00.000Z'), `datetime ${dt}`)
    assert((await liWith(page, 'Buy milk').innerText()).includes('Added 2026-01-15'), 'Added text')
    const dt2 = await datetimeOf(page, 'Call Bob')
    assert(Date.parse(dt2 ?? '') === Date.parse('2026-01-14T09:00:00.000Z'), `datetime ${dt2}`)
  },
)
check(
  'T2',
  3,
  'a new note records the moment it was added',
  'Every note records the moment it was created, on the server.',
  async () => {
    const page = await fresh('T2')
    const before = Date.now() - 5000
    await add(page, 'Timed')
    const after = Date.now() + 5000
    const dt = await datetimeOf(page, 'Timed')
    const at = Date.parse(dt ?? '')
    assert(/Z$|[+-]00:?00$/.test(dt ?? '') && at >= before && at <= after, `datetime ${dt}`)
    const day = new Date(at).toISOString().slice(0, 10)
    assert((await liWith(page, 'Timed').innerText()).includes(`Added ${day}`), 'Added text')
  },
)

check(
  'R1',
  4,
  'the add input is labelled Title',
  'The add input’s accessible label is Title instead of New note',
  async () => {
    const page = await fresh('R1')
    assert((await page.getByLabel('Title', { exact: true }).count()) === 1, 'Title input')
    assert((await page.getByLabel('New note', { exact: true }).count()) === 0, 'New note still labelled')
  },
)

check(
  'E1',
  5,
  'edit with JS keeps place, pin and date',
  'After a successful save the <li> shows the new title … keeps its place in the list, its pin and its Added date.',
  async () => {
    const page = await fresh('E1')
    await twoPinned(page)
    const dt = await datetimeOf(page, 'Alpha')
    await click(page, liButton(page, 'Alpha', 'Edit'))
    const input = page.getByLabel('Edit title', { exact: true })
    assert((await input.inputValue()) === 'Alpha', 'input value')
    assert((await input.getAttribute('maxlength')) === '60', 'maxlength')
    await input.fill('Gamma')
    await click(page, page.getByRole('button', { name: 'Save', exact: true }))
    const list = await items(page)
    assert(
      list[0]?.includes('Gamma') && list[0].includes('pinned') && !list.some((t) => t.includes('Alpha')),
      `list ${list}`,
    )
    assert((await page.getByLabel('Edit title', { exact: true }).count()) === 0, 'edit still open')
    assert((await datetimeOf(page, 'Gamma')) === dt, 'date changed')
  },
)
check(
  'E2',
  5,
  'edit to a duplicate is refused',
  'A duplicate shows You already have a note with this title … and leaves the note unchanged.',
  async () => {
    const page = await fresh('E2')
    await add(page, 'Alpha')
    await add(page, 'Beta')
    await edit(page, 'Alpha', ' beta ')
    assert(await hasAlert(page, V.dup), `alert ${await alerts(page)}`)
    await go(page, V.home)
    const list = await items(page)
    assert(list.length === 2 && list.some((t) => t.includes('Alpha')), `list ${list}`)
  },
)
check(
  'E3',
  5,
  'cancel leaves the note unchanged',
  'Cancel leaves the note unchanged and closes the edit.',
  async () => {
    const page = await fresh('E3')
    await add(page, 'Alpha')
    await click(page, liButton(page, 'Alpha', 'Edit'))
    await page.getByLabel('Edit title', { exact: true }).fill('Changed')
    await click(page, page.getByRole('button', { name: 'Cancel', exact: true }))
    assert((await page.getByLabel('Edit title', { exact: true }).count()) === 0, 'edit still open')
    assert(await has(page, 'Alpha'), `list ${await items(page)}`)
    await go(page, V.home)
    assert((await has(page, 'Alpha')) && !(await has(page, 'Changed')), 'changed on server')
  },
)
check('E4', 5, 'edit without JS', 'Editing also works with JavaScript disabled.', async () => {
  const page = await fresh('E4', false)
  await add(page, 'Alpha')
  await edit(page, 'Alpha', 'Omega')
  await go(page, V.home)
  const list = await items(page)
  assert(list.length === 1 && list[0].includes('Omega'), `list ${list}`)
})

const tagHref = async (page, title, tag) => {
  const link = liWith(page, title).getByRole('link', { name: `#${tag}`, exact: true })
  assert((await link.count()) === 1, `#${tag} links: ${await link.count()}`)
  const url = new URL((await link.getAttribute('href')) ?? '', base)
  assert(url.pathname === V.home && url.searchParams.get('tag') === tag, `href ${url}`)
}
check(
  'G1',
  6,
  'tags are normalized and shown as links',
  'Tags are trimmed and lowercased; empty entries and repeats are dropped … a link #<tag> to the list page with ?tag=<tag>',
  async () => {
    const page = await fresh('G1')
    await add(page, 'Tagged note', ' Work, home,, work ')
    await tagHref(page, 'Tagged note', 'work')
    await tagHref(page, 'Tagged note', 'home')
    assert((await liWith(page, 'Tagged note').getByRole('link').count()) === 2, 'link count')
  },
  20,
)
check(
  'G2',
  6,
  'the tag filter in the URL, without JS',
  'the list shows only the notes with that tag … Tagged <tag> and a link All notes … Notes: <count> still shows the total',
  async () => {
    const js = await fresh('G2')
    await add(js, 'Office', 'work')
    await add(js, 'Garden', 'home')
    await click(js, liWith(js, 'Office').getByRole('link', { name: '#work', exact: true }))
    assert(new URL(js.url()).searchParams.get('tag') === 'work', `url ${js.url()}`)
    const page = await newPage(false)
    await signIn(page, user('G2'))
    await go(page, `${V.home}?tag=work`)
    const list = await items(page)
    assert(list.length === 1 && list[0].includes('Office'), `list ${list}`)
    assert((await text(page)).includes('Tagged work'), 'Tagged text')
    assert((await count(page)) === '2', `count ${await count(page)}`)
    await click(page, page.getByRole('link', { name: 'All notes', exact: true }))
    assert((await items(page)).length === 2, 'All notes')
  },
  20,
)
check(
  'G3',
  6,
  'the server rejects an invalid tag',
  'The server rejects a note with any other tag, showing Tags use letters, digits and -',
  async () => {
    const page = await fresh('G3', false)
    await add(page, 'Bad tags', 'work, bad tag')
    assert(await hasAlert(page, 'Tags use letters, digits and -'), `alert ${await alerts(page)}`)
    assert((await count(page)) === '0', `count ${await count(page)}`)
  },
  20,
)

check(
  'A1',
  7,
  'archive and restore with JS',
  'An archived note leaves the list … /archive … Restore moves the note back … keeps its title, pin',
  async () => {
    const page = await fresh('A1')
    await twoPinned(page)
    await click(page, liButton(page, 'Alpha', 'Archive'))
    assert(!(await has(page, 'Alpha')) && (await count(page)) === '1', `list ${await items(page)}`)
    await click(page, page.getByRole('link', { name: 'Archived notes', exact: true }))
    assert(path(page) === '/archive', `path ${path(page)}`)
    assert(norm(await page.locator('h1').innerText()) === 'Archive', 'h1')
    const li = liWith(page, 'Alpha')
    assert((await li.getByRole('button').count()) === 1, 'buttons besides Restore')
    assert(
      (await li.locator('input:not([type=hidden]), textarea, select').count()) === 0,
      'inputs in archived note',
    )
    await click(page, liButton(page, 'Alpha', 'Restore'))
    await go(page, V.home)
    const list = await items(page)
    assert(list[0]?.includes('Alpha') && list[0].includes('pinned'), `list ${list}`)
    assert((await count(page)) === '2', `count ${await count(page)}`)
  },
)
check(
  'A2',
  7,
  '/archive: redirect when signed out, empty text',
  'redirected to /login … No archived notes',
  async () => {
    assert(isRedirectTo(await fetch(`${base}/archive`, { redirect: 'manual' }), '/login'), 'no redirect')
    const page = await fresh('A2')
    await go(page, '/archive')
    assert((await text(page)).includes('No archived notes'), 'empty text')
  },
)
check(
  'A3',
  7,
  'archived notes are read-only on the server and still duplicates',
  'the server refuses those actions for an archived note … still a duplicate',
  async () => {
    const page = await fresh('A3', false)
    await add(page, 'Alpha')
    await add(page, 'Beta')
    const stale = await page.context().newPage()
    await go(stale, V.home)
    await click(page, liButton(page, 'Alpha', 'Archive'))
    await click(stale, liButton(stale, 'Alpha', 'Delete'))
    await go(page, '/archive')
    assert(await liWith(page, 'Alpha').count(), 'archived note deleted')
    await go(page, V.home)
    await add(page, 'alpha')
    assert(await hasAlert(page, V.dup), `alert ${await alerts(page)}`)
    assert((await count(page)) === '1', `count ${await count(page)}`)
  },
)
check(
  'A4',
  7,
  'archive and restore without JS',
  'Archiving and restoring also work with JavaScript disabled.',
  async () => {
    const page = await fresh('A4', false)
    await add(page, 'Alpha')
    await click(page, liButton(page, 'Alpha', 'Archive'))
    await go(page, '/archive')
    await click(page, liButton(page, 'Alpha', 'Restore'))
    await go(page, V.home)
    assert(await has(page, 'Alpha'), 'restored')
  },
)

check(
  'S1',
  8,
  'search from the URL and the Search button, without JS',
  'Loading the list page with ?q=milk renders the list already filtered … A submit button Search',
  async () => {
    const page = await fresh('S1', false)
    await add(page, 'Buy milk')
    await add(page, 'Call Bob')
    await go(page, `${V.home}?q=milk`)
    let list = await items(page)
    assert(list.length === 1 && list[0].includes('Buy milk'), `list ${list}`)
    assert((await page.getByLabel('Search', { exact: true }).inputValue()) === 'milk', 'input value')
    await page.getByLabel('Search', { exact: true }).fill('BOB')
    await click(page, page.getByRole('button', { name: 'Search', exact: true }))
    list = await items(page)
    assert(list.length === 1 && list[0].includes('Call Bob'), `list ${list}`)
    assert(new URL(page.url()).searchParams.get('q') === 'BOB', `url ${page.url()}`)
    assert((await count(page)) === '2', `count ${await count(page)}`)
    await go(page, `${V.home}?q=zzz`)
    assert((await text(page)).includes('No notes match'), 'no match')
  },
)
check(
  'S2',
  8,
  '?q= and ?tag= combine',
  '?q= and ?tag= combine: both filters apply.',
  async () => {
    const page = await fresh('S2')
    await add(page, 'Work call', 'work')
    await add(page, 'Work mail', 'work')
    await add(page, 'Home call', 'home')
    await go(page, `${V.home}?tag=work&q=call`)
    const list = await items(page)
    assert(list.length === 1 && list[0].includes('Work call'), `list ${list}`)
  },
  20,
)

check(
  'M1',
  9,
  '/ redirects to /notes or /login',
  '/ now only redirects: to /notes when a user is signed in, to /login otherwise',
  async () => {
    assert(isRedirectTo(await fetch(`${base}/`, { redirect: 'manual' }), '/login'), 'signed out')
    const page = await fresh('M1')
    assert(isRedirectTo(await fetchAs(page, '/'), '/notes'), 'signed in')
  },
)
check(
  'M2',
  9,
  'forms lead to /notes (no JS)',
  'Every link and form that led to / now leads to /notes',
  async () => {
    const page = await fresh('M2', false)
    await add(page, 'Alpha')
    assert(path(page) === '/notes', `after add ${path(page)}`)
    await click(page, liButton(page, 'Alpha', 'Delete'))
    assert(path(page) === '/notes', `after delete ${path(page)}`)
  },
)

const statusOf = async (page) => (await statuses(page)).find((s) => s.includes('Deleted')) ?? ''
check(
  'U1',
  10,
  'undo restores place, pin and date, also after a reload',
  'Undo puts the note back exactly as it was … The message stays (also across a reload)',
  async () => {
    const page = await fresh('U1')
    await add(page, 'Alpha')
    await add(page, 'Beta')
    await add(page, 'Gamma')
    await click(page, liButton(page, 'Alpha', 'Pin'))
    const dt = await datetimeOf(page, 'Gamma')
    await click(page, liButton(page, 'Gamma', 'Delete'))
    assert((await statusOf(page)).includes('Deleted "Gamma"'), `status ${await statuses(page)}`)
    await go(page, V.home)
    assert((await statusOf(page)).includes('Deleted "Gamma"'), 'status lost on reload')
    await click(page, page.locator('[role="status"]').getByRole('button', { name: 'Undo', exact: true }))
    const list = await items(page)
    assert(
      list.length === 3 && list[0].includes('Alpha') && list[1].includes('Gamma') && list[2].includes('Beta'),
      `list ${list}`,
    )
    assert((await datetimeOf(page, 'Gamma')) === dt, 'date changed')
    assert(!(await statusOf(page)), 'message still shown')
  },
)
check(
  'U2',
  10,
  'only the most recent delete, cleared by the next change',
  'Only the most recent delete can be undone … until the user’s notes change again',
  async () => {
    const page = await fresh('U2')
    await add(page, 'Alpha')
    await add(page, 'Beta')
    await add(page, 'Gamma')
    await click(page, liButton(page, 'Alpha', 'Delete'))
    await click(page, liButton(page, 'Beta', 'Delete'))
    assert((await statusOf(page)).includes('Deleted "Beta"'), `status ${await statuses(page)}`)
    await click(page, page.locator('[role="status"]').getByRole('button', { name: 'Undo', exact: true }))
    assert((await has(page, 'Beta')) && !(await has(page, 'Alpha')), `list ${await items(page)}`)
    await click(page, liButton(page, 'Gamma', 'Delete'))
    await add(page, 'Delta')
    assert(!(await statusOf(page)), 'message after add')
  },
)
check('U3', 10, 'undo without JS', 'Undo also works with JavaScript disabled.', async () => {
  const page = await fresh('U3', false)
  await add(page, 'Alpha')
  await click(page, liButton(page, 'Alpha', 'Delete'))
  await click(page, page.locator('[role="status"]').getByRole('button', { name: 'Undo', exact: true }))
  await go(page, V.home)
  assert(await has(page, 'Alpha'), 'not restored')
})

const loadMore = (page) => control(page, 'Load more')
const addMany = async (page, n, prefix) => {
  for (let i = 1; i <= n; i++) await add(page, `${prefix} ${'abcdefghij'[i - 1]}`)
}
check(
  'Pg1',
  11,
  'five at a time, Showing n of m, Load more',
  'at most 5 notes at first … Showing <n> of <m> … Load more lists the next 5 … When all are listed, Load more is not shown.',
  async () => {
    const page = await fresh('PgA')
    assert((await text(page)).includes('Showing 0 of 0'), 'Showing 0 of 0')
    await addMany(page, 7, 'Item')
    await go(page, V.home)
    let list = await items(page)
    assert(list.length === 5 && list[0].includes('Item g') && list[4].includes('Item c'), `list ${list}`)
    assert((await text(page)).includes('Showing 5 of 7'), 'Showing 5 of 7')
    assert((await count(page)) === '7', `count ${await count(page)}`)
    await click(page, loadMore(page))
    list = await items(page)
    assert(list.length === 7 && list[6].includes('Item a'), `list ${list}`)
    assert((await text(page)).includes('Showing 7 of 7'), 'Showing 7 of 7')
    assert((await loadMore(page).count()) === 0, 'Load more still shown')
  },
)
check(
  'Pg2',
  11,
  'pinned first across pages; filters count',
  'in the usual order (pinned first …) … <m> is the number of notes the URL filters select',
  async () => {
    const page = await fresh('PgB')
    await addMany(page, 6, 'Item')
    await click(page, loadMore(page))
    await click(page, liButton(page, 'Item a', 'Pin'))
    await go(page, V.home)
    assert((await items(page))[0]?.includes('Item a'), `list ${await items(page)}`)
    await go(page, `${V.home}?q=item`)
    assert((await text(page)).includes('Showing 5 of 6'), 'filtered Showing')
    await go(page, `${V.home}?q=item%20b`)
    assert((await text(page)).includes('Showing 1 of 1'), 'narrow Showing')
  },
)
check('Pg3', 11, 'Load more without JS', 'Load more also works with JavaScript disabled.', async () => {
  const page = await fresh('PgC', false)
  await addMany(page, 6, 'Item')
  await go(page, V.home)
  assert((await items(page)).length === 5, 'first page')
  await click(page, loadMore(page))
  assert((await items(page)).length === 6, `after Load more ${(await items(page)).length}`)
})

const delayWrites = async (page, ms) =>
  page.route('**/*', async (route) => {
    if (route.request().method() !== 'GET') await sleep(ms)
    await route.continue().catch(() => {})
  })
check(
  'O1',
  12,
  'the note appears at once, marked saving',
  'the new note appears first in the list at once, before the server has answered … saving until the server has accepted it',
  async () => {
    const page = await fresh('O1')
    await add(page, 'Seed')
    await delayWrites(page, 2500)
    await page.getByLabel(V.addLabel, { exact: true }).fill('Quick')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await sleep(600)
    const pending = await page.locator('li').allInnerTexts()
    assert(
      norm(pending[0] ?? '').includes('Quick') && norm(pending[0]).includes('saving'),
      `pending ${pending.map(norm)}`,
    )
    await sleep(2500)
    await page.waitForLoadState('networkidle')
    await settle(page, 1000)
    const list = await items(page)
    assert(list[0]?.includes('Quick') && !list[0].includes('saving'), `list ${list}`)
    assert((await count(page)) === '2', `count ${await count(page)}`)
  },
)
check(
  'O2',
  12,
  'a rejected note disappears again with the alert',
  'If the server rejects the note … the note disappears from the list again and the page shows the server’s message',
  async () => {
    const page = await fresh('O2')
    await add(page, 'Seed')
    await delayWrites(page, 2000)
    await page.getByLabel(V.addLabel, { exact: true }).fill('seed')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await sleep(500)
    const pending = (await page.locator('li').allInnerTexts()).map(norm)
    assert(
      pending.some((t) => t.includes('saving')),
      `nothing pending: ${pending}`,
    )
    await sleep(2000)
    await page.waitForLoadState('networkidle')
    await settle(page, 1000)
    const all = (await page.locator('li').allInnerTexts()).map(norm)
    assert(!all.some((t) => t.includes('saving')), `still pending ${all}`)
    assert((await items(page)).length === 1, `list ${await items(page)}`)
    assert(await hasAlert(page, V.dup), `alert ${await alerts(page)}`)
  },
)

check(
  'B1',
  13,
  'bulk delete with JS, Selected counter, clears undo',
  'Delete selected deletes them … Selected: <n> … A bulk delete cannot be undone; it clears any Undo message.',
  async () => {
    const page = await fresh('B1')
    for (const t of ['Alpha', 'Beta', 'Gamma', 'Delta']) await add(page, t)
    await click(page, liButton(page, 'Delta', 'Delete'))
    await page.getByLabel('Select Alpha', { exact: true }).check()
    await page.getByLabel('Select Gamma', { exact: true }).check()
    await settle(page, 300)
    assert((await text(page)).includes('Selected: 2'), 'Selected: 2')
    await click(page, page.getByRole('button', { name: 'Delete selected', exact: true }))
    const list = await items(page)
    assert(list.length === 1 && list[0].includes('Beta'), `list ${list}`)
    assert(!(await statusOf(page)), 'undo message kept')
    await go(page, V.home)
    assert((await items(page)).length === 1, 'not deleted on server')
  },
)
check(
  'B2',
  13,
  'bulk archive with JS; nothing checked does nothing',
  'Archive selected archives them. With no note checked they do nothing.',
  async () => {
    const page = await fresh('B2')
    for (const t of ['Alpha', 'Beta', 'Gamma']) await add(page, t)
    await click(page, page.getByRole('button', { name: 'Delete selected', exact: true }))
    assert((await items(page)).length === 3, 'deleted with nothing checked')
    await page.getByLabel('Select Alpha', { exact: true }).check()
    await page.getByLabel('Select Beta', { exact: true }).check()
    await click(page, page.getByRole('button', { name: 'Archive selected', exact: true }))
    assert((await items(page)).length === 1, `list ${await items(page)}`)
    await go(page, '/archive')
    assert((await items(page, 'Restore')).length === 2, 'archive list')
  },
)
check(
  'B3',
  13,
  'bulk delete and archive without JS',
  'Delete selected and Archive selected also work with JavaScript disabled.',
  async () => {
    const page = await fresh('B3', false)
    for (const t of ['Alpha', 'Beta', 'Gamma']) await add(page, t)
    await page.getByLabel('Select Alpha', { exact: true }).check()
    await click(page, page.getByRole('button', { name: 'Delete selected', exact: true }))
    await go(page, V.home)
    assert((await items(page)).length === 2 && !(await has(page, 'Alpha')), `list ${await items(page)}`)
    await page.getByLabel('Select Beta', { exact: true }).check()
    await click(page, page.getByRole('button', { name: 'Archive selected', exact: true }))
    await go(page, V.home)
    assert((await items(page)).length === 1 && (await has(page, 'Gamma')), `list ${await items(page)}`)
  },
)

check(
  'RL1',
  14,
  'the 11th add within a minute is refused; rejected adds do not count',
  'at most 10 notes within any 60 seconds … Only notes that were actually added count',
  async () => {
    const page = await fresh('RL')
    await add(page, 'Rate a')
    await add(page, 'rate A')
    assert(await hasAlert(page, V.dup), 'duplicate')
    for (const c of 'bcdefghij') await add(page, `Rate ${c}`)
    await go(page, V.home)
    assert((await count(page)) === '10', `count ${await count(page)}`)
    await add(page, 'Rate k')
    assert(await hasAlert(page, 'Too many notes, try again in a minute'), `alert ${await alerts(page)}`)
    await go(page, V.home)
    assert((await count(page)) === '10', `count after limit ${await count(page)}`)
    const other = await fresh('RL', true, 'x')
    await add(other, 'Other user')
    assert((await count(other)) === '1', 'limit not per user')
  },
)

const share = async (page, title, who) => {
  await liWith(page, title).getByLabel('Share with', { exact: true }).fill(who)
  await click(page, liButton(page, title, 'Share'))
}
check(
  'SH1',
  15,
  'share: owner sees it, recipient sees it read-only, HTML isolation',
  'Shared with me … from <owner>, and no buttons or inputs … not in Notes: <count> … The HTML sent to a user contains only their own notes and the notes shared with them.',
  async () => {
    const owner = await fresh('SHA')
    const to = `${user('SHA')}r`
    await add(owner, 'Private plan')
    await add(owner, 'Shared plan')
    await share(owner, 'Shared plan', to)
    const li = liWith(owner, 'Shared plan')
    assert((await li.innerText()).includes(`shared with ${to}`), 'shared with text')
    assert(
      (await li.getByRole('button', { name: `Unshare ${to}`, exact: true }).count()) === 1,
      'Unshare button',
    )
    const rec = await newPage()
    await signIn(rec, to)
    const shared = await sharedItems(rec)
    assert(
      shared.length === 1 && shared[0].includes('Shared plan') && shared[0].includes(`from ${user('SHA')}`),
      `shared ${shared}`,
    )
    const sli = rec.locator('xpath=//h2[normalize-space()="Shared with me"]/following::ul[1]/li')
    assert(
      (await sli.locator('button, input:not([type=hidden]), select, textarea').count()) === 0,
      'controls on a shared note',
    )
    assert((await count(rec)) === '0' && (await items(rec)).length === 0, 'counted as own')
    await add(rec, 'shared plan')
    assert(!(await hasAlert(rec, V.dup)) && (await count(rec)) === '1', 'shared note in duplicate check')
    const html = await (await fetchAs(rec, V.home)).text()
    assert(!html.includes('Private plan'), 'private note in recipient HTML')
  },
)
check(
  'SH2',
  15,
  'shared notes follow title, archive, restore and delete',
  'A shared note always shows its current title. When the owner deletes or archives it, it disappears … restoring it shares it again.',
  async () => {
    const owner = await fresh('SHB')
    const to = `${user('SHB')}r`
    await add(owner, 'Shared plan')
    await share(owner, 'Shared plan', to)
    const rec = await newPage()
    await signIn(rec, to)
    await edit(owner, 'Shared plan', 'Renamed plan')
    await go(rec, V.home)
    assert((await sharedItems(rec))[0]?.includes('Renamed plan'), `after edit ${await sharedItems(rec)}`)
    await click(owner, liButton(owner, 'Renamed plan', 'Archive'))
    await go(rec, V.home)
    assert((await sharedItems(rec)).length === 0, 'visible while archived')
    assert((await rec.locator('h2', { hasText: 'Shared with me' }).count()) === 0, 'heading while empty')
    await go(owner, '/archive')
    await click(owner, liButton(owner, 'Renamed plan', 'Restore'))
    await go(rec, V.home)
    assert((await sharedItems(rec)).length === 1, 'not shared again after restore')
    await go(owner, V.home)
    await click(owner, liButton(owner, 'Renamed plan', 'Delete'))
    await go(rec, V.home)
    assert((await sharedItems(rec)).length === 0, 'visible after delete')
  },
)
check(
  'SH3',
  15,
  'unshare, and sharing with yourself',
  'Unshare <name>, which removes that user’s access … You cannot share with yourself',
  async () => {
    const owner = await fresh('SHC')
    const to = `${user('SHC')}r`
    await add(owner, 'Shared plan')
    await share(owner, 'Shared plan', user('SHC'))
    assert(await hasAlert(owner, 'You cannot share with yourself'), `alert ${await alerts(owner)}`)
    await share(owner, 'Shared plan', to)
    await click(owner, liButton(owner, 'Shared plan', `Unshare ${to}`))
    const rec = await newPage()
    await signIn(rec, to)
    assert((await sharedItems(rec)).length === 0, 'still shared')
  },
)
check(
  'SH4',
  15,
  'share and unshare without JS',
  'Sharing and unsharing also work with JavaScript disabled.',
  async () => {
    const owner = await fresh('SHD', false)
    const to = `${user('SHD')}r`
    await add(owner, 'Shared plan')
    await share(owner, 'Shared plan', to)
    const rec = await newPage(false)
    await signIn(rec, to)
    assert((await sharedItems(rec)).length === 1, 'not shared')
    await go(owner, V.home)
    await click(owner, liButton(owner, 'Shared plan', `Unshare ${to}`))
    await go(rec, V.home)
    assert((await sharedItems(rec)).length === 0, 'still shared')
  },
)

check(
  'AD1',
  16,
  'the admin table lists users and their note counts',
  'one row per user who has signed in or owns notes (the seeded ada and bob included) … archived ones included',
  async () => {
    const page = await fresh('ADA')
    for (const t of ['Alpha', 'Beta', 'Gamma']) await add(page, t)
    await click(page, liButton(page, 'Alpha', 'Archive'))
    const admin = await newPage()
    await signIn(admin, 'admin')
    await click(admin, admin.getByRole('link', { name: 'Admin', exact: true }))
    assert(path(admin) === '/admin', `path ${path(admin)}`)
    assert(norm(await admin.locator('h1').innerText()) === 'Admin', 'h1')
    const rows = await adminRows(admin)
    assert(
      rows.some((r) => r.includes('User') && r.includes('Notes')),
      'header cells',
    )
    const notesOf = (u) => rows.find((r) => r[0] === u)?.[1]
    assert(notesOf(user('ADA')) === '3', `row ${notesOf(user('ADA'))}`)
    assert(notesOf('ada') === '2' && notesOf('bob') === '1', `seed rows ${notesOf('ada')} ${notesOf('bob')}`)
  },
)
check(
  'AD2',
  16,
  'others get 403 and no Admin link',
  'For any other signed-in user, /admin responds with HTTP status 403 … Not allowed … no Admin link. When nobody is signed in, /admin redirects to /login.',
  async () => {
    assert(isRedirectTo(await fetch(`${base}/admin`, { redirect: 'manual' }), '/login'), 'signed out')
    const page = await fresh('ADB')
    assert((await page.getByRole('link', { name: 'Admin', exact: true }).count()) === 0, 'Admin link')
    const res = await fetchAs(page, '/admin')
    assert(res.status === 403, `status ${res.status}`)
    assert((await res.text()).includes('Not allowed'), 'Not allowed')
  },
)

check(
  'DA1',
  17,
  'delete an account: notes, shares, admin row',
  'deletes all of the user’s notes … signs the user out … Account deleted … Notes the user had shared disappear … Notes others shared with the user are not affected … admin table no longer lists the user',
  async () => {
    const who = user('DAA')
    const other = `${user('DAA')}o`
    const page = await fresh('DAA')
    await add(page, 'Mine')
    await add(page, 'Old')
    await click(page, liButton(page, 'Old', 'Archive'))
    await share(page, 'Mine', other)
    const o = await newPage()
    await signIn(o, other)
    await add(o, 'Theirs')
    await share(o, 'Theirs', who)
    await click(page, page.getByRole('link', { name: 'Delete account', exact: true }))
    assert(path(page) === '/account/delete', `path ${path(page)}`)
    assert(norm(await page.locator('h1').innerText()) === 'Delete account', 'h1')
    await click(page, page.getByRole('button', { name: 'Delete my account and notes', exact: true }))
    assert(path(page) === '/login', `after delete ${path(page)}`)
    assert((await text(page)).includes('Account deleted'), 'Account deleted text')
    await go(page, V.home)
    assert(path(page) === '/login', 'still signed in')
    await go(o, V.home)
    assert((await sharedItems(o)).length === 0, 'shared note still visible')
    assert(await has(o, 'Theirs'), 'owner lost the note shared with the deleted user')
    const admin = await newPage()
    await signIn(admin, 'admin')
    await go(admin, '/admin')
    assert(!(await adminRows(admin)).some((r) => r[0] === who), 'admin row kept')
    await signIn(page, who)
    assert((await count(page)) === '0', `count ${await count(page)}`)
    await go(page, '/archive')
    assert((await text(page)).includes('No archived notes'), 'archived notes kept')
  },
)
check(
  'DA2',
  17,
  'delete an account without JS; signed out redirect',
  'Deleting an account also works with JavaScript disabled … redirecting to /login when nobody is signed in',
  async () => {
    assert(
      isRedirectTo(await fetch(`${base}/account/delete`, { redirect: 'manual' }), '/login'),
      'signed out',
    )
    const page = await fresh('DAB', false)
    await add(page, 'Mine')
    await go(page, '/account/delete')
    await click(page, page.getByRole('button', { name: 'Delete my account and notes', exact: true }))
    assert(path(page) === '/login' && (await text(page)).includes('Account deleted'), `after ${path(page)}`)
    await signIn(page, user('DAB'))
    assert((await count(page)) === '0', `count ${await count(page)}`)
  },
)

const lang = (page) => page.locator('html').getAttribute('lang')
const germanFlow = async (page, who) => {
  await go(page, '/login')
  assert((await lang(page))?.startsWith('en'), `lang ${await lang(page)}`)
  await click(page, control(page, 'Deutsch'))
  assert(norm(await page.locator('h1').innerText()) === 'Anmelden', 'h1 Anmelden')
  assert((await lang(page))?.startsWith('de'), `lang ${await lang(page)}`)
  await page.getByLabel('Name', { exact: true }).fill(who)
  await click(page, page.getByRole('button', { name: 'Anmelden', exact: true }))
  assert(path(page).endsWith('/notes') || path(page).endsWith('/'), `path ${path(page)}`)
  assert(norm(await page.locator('h1').innerText()) === 'Notizen', 'h1 Notizen')
  const t = await text(page)
  assert(t.includes(`Angemeldet als ${who}`) && t.includes('Notizen: 0'), 'signed in text')
  await page.getByLabel('Titel', { exact: true }).fill('Milch')
  await click(page, page.getByRole('button', { name: 'Hinzufügen', exact: true }))
  assert((await noteItems(page, 'Löschen').count()) === 1, 'Löschen')
  await page.getByLabel('Titel', { exact: true }).fill('milch')
  await click(page, page.getByRole('button', { name: 'Hinzufügen', exact: true }))
  assert(await hasAlert(page, 'Du hast bereits eine Notiz mit diesem Titel'), `alert ${await alerts(page)}`)
  assert((await page.getByLabel('Suche', { exact: true }).count()) === 1, 'Suche')
  await page.reload({ waitUntil: 'networkidle' })
  assert(norm(await page.locator('h1').innerText()) === 'Notizen', 'lost on reload')
  await click(page, page.getByRole('button', { name: 'Abmelden', exact: true }))
  assert(norm(await page.locator('h1').innerText()) === 'Anmelden', 'lost on sign out')
  await click(page, control(page, 'English'))
  assert(norm(await page.locator('h1').innerText()) === 'Sign in', 'back to English')
  assert((await lang(page))?.startsWith('en'), `lang ${await lang(page)}`)
}
check(
  'DE1',
  18,
  'German with JS: texts, persistence, HttpOnly',
  'at least these texts are exactly … persists in that browser across reloads, signing in and signing out … must be HttpOnly',
  async () => {
    const page = await newPage()
    await germanFlow(page, user('DEA'))
    for (const c of await page.context().cookies()) assert(c.httpOnly, `${c.name} not HttpOnly`)
  },
)
check(
  'DE2',
  18,
  'German without JS',
  'Switching the language also works with JavaScript disabled.',
  async () => {
    await germanFlow(await newPage(false), user('DEB'))
  },
)

check(
  'EX1',
  19,
  'export: keys, order, archived, createdAt, link',
  'returns the signed-in user’s own notes as JSON … archived ones included and shared-with-me ones excluded … exactly these keys',
  async () => {
    const who = user('EXA')
    const page = await fresh('EXA')
    await add(page, 'Alpha', 'work')
    await add(page, 'Beta')
    await add(page, 'Gamma')
    await click(page, liButton(page, 'Alpha', 'Pin'))
    const alphaAt = await datetimeOf(page, 'Alpha')
    await click(page, liButton(page, 'Gamma', 'Archive'))
    const o = await fresh('EXA', true, 'o')
    await add(o, 'Foreign')
    await share(o, 'Foreign', who)
    const href = await page.getByRole('link', { name: 'Export', exact: true }).getAttribute('href')
    assert(new URL(href ?? '', base).pathname === '/api/export', `href ${href}`)
    const res = await fetchAs(page, '/api/export')
    assert(res.status === 200, `status ${res.status}`)
    assert((res.headers.get('content-type') ?? '').includes('application/json'), 'content-type')
    const body = await res.json()
    assert(body.user === who, `user ${body.user}`)
    const titles = body.notes.map((n) => n.title)
    assert(JSON.stringify(titles) === JSON.stringify(['Alpha', 'Gamma', 'Beta']), `order ${titles}`)
    for (const n of body.notes)
      assert(JSON.stringify(Object.keys(n).sort()) === JSON.stringify(V.exportKeys), `keys ${Object.keys(n)}`)
    const [alpha, gamma, beta] = body.notes
    assert(alpha.pinned === true && gamma.archived === true && beta.archived === false, 'flags')
    assert(Date.parse(alpha.createdAt) === Date.parse(alphaAt ?? ''), `createdAt ${alpha.createdAt}`)
    if (V.tags)
      assert(JSON.stringify(alpha.tags) === '["work"]' && JSON.stringify(beta.tags) === '[]', 'tags')
  },
)
check(
  'EX2',
  19,
  'export: seeded ada, 401 signed out',
  'When nobody is signed in it returns status 401.',
  async () => {
    assert((await fetch(`${base}/api/export`)).status === 401, 'signed out status')
    const page = await newPage()
    await signIn(page, 'ada')
    const body = await (await fetchAs(page, '/api/export')).json()
    assert(body.user === 'ada' && body.notes.length === 2, `body ${JSON.stringify(body).slice(0, 120)}`)
    assert(
      body.notes[0].title === 'Buy milk' &&
        Date.parse(body.notes[0].createdAt) === Date.parse('2026-01-15T09:00:00.000Z'),
      'first note',
    )
  },
)

check(
  'TG1',
  20,
  'tags are gone',
  'The Tags input, the #<tag> links, the Tagged <tag> text and the All notes link are removed. ?tag= in the URL is ignored',
  async () => {
    const page = await fresh('TG')
    assert((await page.getByLabel('Tags', { exact: true }).count()) === 0, 'Tags input')
    await add(page, 'Alpha')
    await add(page, 'Beta')
    assert((await liWith(page, 'Alpha').getByRole('link', { name: /^#/ }).count()) === 0, 'tag links')
    await go(page, `${V.home}?tag=work`)
    assert((await items(page)).length === 2, `list ${await items(page)}`)
    const t = await text(page)
    assert(!t.includes('Tagged work'), 'Tagged text')
    assert((await page.getByRole('link', { name: 'All notes', exact: true }).count()) === 0, 'All notes link')
  },
)

check('N15', 0, 'no console errors', 'the app runs without errors', async () => {
  assert(errors.length === 0, errors.slice(0, 5).join(' | '))
})

const scriptBytes = async (p, who) => {
  let cookies = []
  if (who) {
    const login = await newPage()
    await signIn(login, who)
    cookies = await login.context().cookies()
  }
  const page = await newPage()
  await page.context().addCookies(cookies)
  const sizes = []
  page.on('response', async (r) => {
    if (r.request().resourceType() !== 'script') return
    try {
      sizes.push((await r.body()).length)
    } catch {}
  })
  await go(page, p)
  await settle(page, 500)
  return sizes.reduce((a, b) => a + b, 0)
}

const transform = existsSync(join(cwd, 'node_modules/@hozu/transform'))
  ? ['--import', '@hozu/transform/register']
  : []
const server = spawn(process.execPath, [...transform, entry], {
  cwd,
  env: { ...process.env, PORT: port, HOST: '127.0.0.1', NITRO_HOST: '127.0.0.1', NODE_ENV: 'production' },
})
let serverLog = ''
server.stderr.on('data', (d) => {
  serverLog += d
})
let up = false
for (let i = 0; i < 150 && !up; i++) {
  try {
    await fetch(`${base}/login`)
    up = true
  } catch {
    await sleep(100)
  }
}
const active = checks.filter(
  (c) => c.since <= step && step < c.until && (!only || only.split(',').includes(c.id)),
)
const results = []
let js = null
let crashes = 0
if (!up) {
  for (const c of active) results.push({ ...c, status: 'FAIL: server did not start' })
} else {
  const launch = async () => {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH })
  }
  await launch()
  for (const c of active) {
    for (let attempt = 1; ; attempt++) {
      const started = Date.now()
      let status = 'pass'
      try {
        await c.run()
      } catch (e) {
        status = `FAIL: ${String(e.message).split('\n')[0].slice(0, 200)}`
      }
      if (!browser.isConnected()) {
        crashes++
        await launch()
        if (attempt < 3) continue
      }
      results.push({ ...c, status, ms: Date.now() - started, attempt })
      break
    }
    for (const ctx of browser.contexts()) await ctx.close().catch(() => {})
  }
  if (!only) {
    try {
      js = { login: await scriptBytes('/login'), list: await scriptBytes(V.home, user('JS')) }
    } catch (e) {
      js = { error: String(e.message).slice(0, 120) }
    }
  }
  await browser.close()
}
server.kill()
const tally = (rs) => ({ passed: rs.filter((r) => r.status === 'pass').length, total: rs.length })
const fresh_ = results.filter((r) => r.since === step)
const regression = results.filter((r) => r.since !== step)
console.log(
  JSON.stringify(
    {
      name,
      step,
      ...tally(results),
      new: tally(fresh_),
      regression: tally(regression),
      failures: results
        .filter((r) => r.status !== 'pass')
        .map((r) => ({
          id: r.id,
          kind: r.since === step ? 'new' : 'regression',
          what: r.what,
          error: r.status,
        })),
      results: results.map((r) => [r.id, r.since, r.status, r.ms]),
      retired: checks.filter((c) => c.until <= step).map((c) => c.id),
      js,
      browserCrashes: crashes,
      serverErrors: serverLog.slice(-2000),
    },
    null,
    1,
  ),
)
process.exit(0)
