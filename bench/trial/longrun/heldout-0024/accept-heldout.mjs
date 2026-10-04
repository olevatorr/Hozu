// Held-out checks for change requests 21–28.
// 26 changes the export keys (EX1), 27 makes a bulk delete undoable (B1), 28 removes German (DE1, DE2).
export const retires = { EX1: 26, B1: 27, DE1: 28, DE2: 28 }

export default function register(h) {
  const { check, assert, norm, sleep, base, V } = h
  const READ_ONLY = 'Your account is read-only'

  const button = (page, name) => page.getByRole('button', { name, exact: true })
  const h1 = async (page) => norm(await page.locator('h1').first().innerText())
  const numberOf = async (page, title) =>
    /No\.\s*(\d+)/.exec(norm(await h.liWith(page, title).first().innerText()))?.[1] ?? null
  const titleLink = (page, title) => h.liWith(page, title).getByRole('link', { name: title, exact: true })
  const select = (page, title) => page.getByLabel(`Select ${title}`, { exact: true }).check()
  const undo = (page) => page.locator('[role="status"]').getByRole('button', { name: 'Undo', exact: true })
  const until = async (fn, ms = 6500) => {
    const end = Date.now() + ms
    while (Date.now() < end) {
      if (await fn()) return true
      await sleep(250)
    }
    return fn()
  }
  const tab = async (page, p) => {
    const t = await page.context().newPage()
    t.setDefaultTimeout(10000)
    await h.go(t, p)
    return t
  }
  const titleInput = (page) => page.getByLabel('Title', { exact: true })
  const bodyInput = (page) => page.getByLabel('Body', { exact: true })
  const saveNote = async (page, title, body) => {
    if (title !== undefined) await titleInput(page).fill(title)
    if (body !== undefined) await bodyInput(page).fill(body)
    await h.click(page, button(page, 'Save'))
  }
  const unlimit = (page) =>
    page.evaluate(() => {
      for (const el of document.querySelectorAll('input, textarea')) {
        el.removeAttribute('maxlength')
        el.removeAttribute('required')
      }
    })
  const shownText = (page) =>
    page.evaluate(() => {
      for (const el of document.querySelectorAll('textarea, input, noscript')) el.remove()
      return document.body.innerText
    })
  const exportOf = async (page, q = '') => (await h.fetchAs(page, `/api/export${q}`)).json()
  const deleteAccountOf = async (page) => {
    await h.go(page, '/account/delete')
    await h.click(page, button(page, 'Delete my account and notes'))
  }
  const adminPage = async (js = true) => {
    const page = await h.newPage(js)
    await h.signIn(page, 'admin')
    await h.go(page, '/admin')
    return page
  }
  const accessOf = async (admin, who) => norm((await h.adminRows(admin)).find((r) => r[0] === who)?.[2] ?? '')
  const setAccess = async (who, readOnly, js = true) => {
    const admin = await adminPage(js)
    await h.click(admin, button(admin, `Make ${who} ${readOnly ? 'read-only' : 'writable'}`))
    return admin
  }
  const refused = async (page, what) =>
    assert(await h.hasAlert(page, READ_ONLY), `${what}: alert ${await h.alerts(page)}`)

  // 21 — note numbers
  check(
    'X21a',
    21,
    'seeded notes are numbered by age, per user',
    'Notes that already exist get their numbers now, in the order of their Added moment, oldest first: ada Call Bob 1, Buy milk 2; bob 1',
    async () => {
      const ada = await h.newPage()
      await h.signIn(ada, 'ada')
      assert((await numberOf(ada, 'Call Bob')) === '1', `Call Bob ${await numberOf(ada, 'Call Bob')}`)
      assert((await numberOf(ada, 'Buy milk')) === '2', `Buy milk ${await numberOf(ada, 'Buy milk')}`)
      const bob = await h.newPage(false)
      await h.signIn(bob, 'bob')
      assert((await numberOf(bob, "Bob's secret")) === '1', `bob ${await numberOf(bob, "Bob's secret")}`)
    },
  )
  check(
    'X21b',
    21,
    'numbers are never reused and survive edit, pin, archive, restore and undo',
    'A note added later gets the number after the highest one its owner has ever had … keeps its number when it is edited, pinned, archived, restored or brought back with Undo … per user',
    async () => {
      const page = await h.fresh('X21b')
      for (const t of ['Alpha', 'Beta', 'Gamma']) await h.add(page, t)
      for (const [t, n] of [
        ['Alpha', '1'],
        ['Beta', '2'],
        ['Gamma', '3'],
      ])
        assert((await numberOf(page, t)) === n, `${t} ${await numberOf(page, t)}`)
      await h.click(page, h.liButton(page, 'Gamma', 'Delete'))
      await h.add(page, 'Delta')
      assert((await numberOf(page, 'Delta')) === '4', `Delta ${await numberOf(page, 'Delta')}`)
      await select(page, 'Delta')
      await h.click(page, button(page, 'Delete selected'))
      await h.add(page, 'Epsilon')
      assert((await numberOf(page, 'Epsilon')) === '5', `Epsilon ${await numberOf(page, 'Epsilon')}`)
      await h.edit(page, 'Alpha', 'Omega')
      assert((await numberOf(page, 'Omega')) === '1', `edited ${await numberOf(page, 'Omega')}`)
      await h.click(page, h.liButton(page, 'Beta', 'Pin'))
      assert((await numberOf(page, 'Beta')) === '2', `pinned ${await numberOf(page, 'Beta')}`)
      await h.click(page, h.liButton(page, 'Beta', 'Archive'))
      await h.go(page, '/archive')
      await h.click(page, h.liButton(page, 'Beta', 'Restore'))
      await h.go(page, V.home)
      assert((await numberOf(page, 'Beta')) === '2', `restored ${await numberOf(page, 'Beta')}`)
      await h.click(page, h.liButton(page, 'Omega', 'Delete'))
      await h.click(page, undo(page))
      assert((await numberOf(page, 'Omega')) === '1', `undone ${await numberOf(page, 'Omega')}`)
      await h.go(page, V.home)
      assert((await numberOf(page, 'Epsilon')) === '5', 'not stored on the server')
      const other = await h.fresh('X21b', true, 'o')
      await h.add(other, 'Alpha')
      assert((await numberOf(other, 'Alpha')) === '1', `other user ${await numberOf(other, 'Alpha')}`)
    },
  )
  check(
    'X21c',
    21,
    'numbers without JS; a deleted account starts again at 1',
    'Each note’s <li> shows the text No. <number> … After an account is deleted, the same name starts again at 1 … with and without JavaScript',
    async () => {
      const page = await h.fresh('X21c', false)
      await h.add(page, 'Alpha')
      await h.add(page, 'Beta')
      assert((await h.liWith(page, 'Beta').innerText()).includes('No. 2'), 'No. 2 text')
      assert((await numberOf(page, 'Alpha')) === '1', `Alpha ${await numberOf(page, 'Alpha')}`)
      await deleteAccountOf(page)
      await h.signIn(page, h.user('X21c'))
      await h.add(page, 'Again')
      assert((await numberOf(page, 'Again')) === '1', `after delete ${await numberOf(page, 'Again')}`)
    },
  )

  // 22 — a page for each note
  check(
    'X22a',
    22,
    'with JS: the title links to /notes/<number>, which shows the note',
    'an <h1> with the note’s current title; No. <number>, Added <YYYY-MM-DD> with a <time> element; pinned; a link Back to notes',
    async () => {
      const page = await h.fresh('X22a')
      await h.add(page, 'Alpha')
      await h.add(page, 'Beta')
      await h.click(page, h.liButton(page, 'Alpha', 'Pin'))
      const dt = (await h.datetimeOf(page, 'Alpha')) ?? ''
      await h.click(page, titleLink(page, 'Alpha'))
      assert(h.path(page) === '/notes/1', `path ${h.path(page)}`)
      assert((await h1(page)) === 'Alpha', `h1 ${await h1(page)}`)
      const t = await h.text(page)
      const day = new Date(Date.parse(dt)).toISOString().slice(0, 10)
      assert(t.includes('No. 1') && t.includes(`Added ${day}`), 'number or date text')
      assert(t.includes('pinned') && !t.includes('Archived'), 'pinned / archived text')
      const at = await page.locator('time').first().getAttribute('datetime')
      assert(Date.parse(at ?? '') === Date.parse(dt), `datetime ${at}`)
      await h.click(page, page.getByRole('link', { name: 'Back to notes', exact: true }))
      assert(h.path(page) === '/notes', `back ${h.path(page)}`)
      await h.go(page, '/notes/2')
      assert((await h1(page)) === 'Beta', `h1 ${await h1(page)}`)
      assert(!(await h.text(page)).includes('pinned'), 'Beta shown pinned')
    },
  )
  check(
    'X22b',
    22,
    'without JS: title links on the list and on /archive; an archived note says Archived',
    'On the list page and on /archive, each note’s title is a link to its page … the text Archived when it is archived … also work with JavaScript disabled',
    async () => {
      const page = await h.fresh('X22b', false)
      await h.add(page, 'Alpha')
      await h.add(page, 'Beta')
      await h.click(page, titleLink(page, 'Beta'))
      assert(h.path(page) === '/notes/2' && (await h1(page)) === 'Beta', `path ${h.path(page)}`)
      await h.go(page, V.home)
      await h.click(page, h.liButton(page, 'Alpha', 'Archive'))
      await h.go(page, '/archive')
      await h.click(page, titleLink(page, 'Alpha'))
      assert(h.path(page) === '/notes/1' && (await h1(page)) === 'Alpha', `path ${h.path(page)}`)
      const t = await h.text(page)
      assert(t.includes('Archived') && t.includes('No. 1'), 'Archived text')
    },
  )
  check(
    'X22c',
    22,
    'note pages: redirect, 404 Note not found, no access to shared or foreign notes',
    'redirects to /login … HTTP status 404 and the text Note not found … Notes shared with the user are not reachable … never contain other users’ notes',
    async () => {
      assert(h.isRedirectTo(await fetch(`${base}/notes/1`, { redirect: 'manual' }), '/login'), 'signed out')
      const owner = await h.fresh('X22c', true, 'o')
      await h.add(owner, 'Hidden plan')
      const page = await h.fresh('X22c')
      await h.add(page, 'Alpha')
      await h.add(page, 'Beta')
      await h.click(page, h.liButton(page, 'Beta', 'Delete'))
      for (const p of ['/notes/2', '/notes/99', '/notes/abc']) {
        const res = await h.fetchAs(page, p)
        assert(res.status === 404, `${p} status ${res.status}`)
        assert((await res.text()).includes('Note not found'), `${p} text`)
      }
      const own = await (await h.fetchAs(page, '/notes/1')).text()
      assert(own.includes('Alpha') && !own.includes('Hidden plan'), 'own page')
      const rec = await h.fresh('X22c', true, 'r')
      await h.share(owner, 'Hidden plan', `${h.user('X22c')}r`)
      await h.go(rec, V.home)
      assert((await h.sharedItems(rec)).length === 1, 'not shared')
      const res = await h.fetchAs(rec, '/notes/1')
      assert(res.status === 404, `shared note status ${res.status}`)
      assert(!(await res.text()).includes('Hidden plan'), 'shared note reachable')
    },
  )
  check(
    'X22d',
    22,
    "numbers are per user: bob's /notes/1 is his own note",
    'A user only ever reaches their own notes this way',
    async () => {
      const bob = await h.newPage(false)
      await h.signIn(bob, 'bob')
      await h.go(bob, '/notes/1')
      assert((await h1(bob)) === "Bob's secret", `h1 ${await h1(bob)}`)
      const html = await (await h.fetchAs(bob, '/notes/1')).text()
      assert(!html.includes('Call Bob') && !html.includes('Buy milk'), "ada's notes in bob's HTML")
    },
  )

  // 23 — edit on the note page, with a body
  check(
    'X23a',
    23,
    'with JS: save title and body on the note page',
    'a text input Title … a multi-line field Body … Save … Saved in role=status, the new title in the <h1>, and the body with its line breaks … keeps its number, place, Added date',
    async () => {
      const page = await h.fresh('X23a')
      await h.add(page, 'Alpha')
      await h.add(page, 'Beta')
      const dt = await h.datetimeOf(page, 'Alpha')
      await h.go(page, '/notes/1')
      assert((await titleInput(page).inputValue()) === 'Alpha', 'title value')
      assert((await bodyInput(page).inputValue()) === '', 'body value')
      assert((await titleInput(page).getAttribute('maxlength')) === '60', 'title maxlength')
      assert((await titleInput(page).getAttribute('required')) !== null, 'title required')
      assert((await bodyInput(page).getAttribute('maxlength')) === '1000', 'body maxlength')
      await saveNote(page, 'Gamma', 'First line\nSecond line')
      assert(
        (await h.statuses(page)).some((s) => s.includes('Saved')),
        `status ${await h.statuses(page)}`,
      )
      assert((await h1(page)) === 'Gamma', `h1 ${await h1(page)}`)
      assert((await bodyInput(page).inputValue()) === 'First line\nSecond line', 'body after save')
      assert(
        (await shownText(page)).includes('First line\nSecond line'),
        'body not shown with its line break',
      )
      await h.go(page, V.home)
      const list = await h.items(page)
      assert(list.length === 2 && list[1].includes('Gamma') && list[1].includes('No. 1'), `list ${list}`)
      assert((await h.datetimeOf(page, 'Gamma')) === dt, 'date changed')
    },
  )
  const invalidSave = async (page) => {
    await h.go(page, '/notes/1')
    await unlimit(page)
    const long = 'y'.repeat(1001)
    await saveNote(page, ' beta ', long)
    const al = await h.alerts(page)
    assert(
      al.some((a) => a.includes(V.dup)),
      `no duplicate alert: ${al}`,
    )
    assert(
      al.some((a) => a.includes('Use at most 1000 characters in the body')),
      `no body alert: ${al}`,
    )
    assert(!al.some((a) => a.includes(V.dup) && a.includes('1000')), 'both messages in one alert')
    assert(
      (await titleInput(page).inputValue()) === ' beta ',
      `title kept: "${await titleInput(page).inputValue()}"`,
    )
    assert((await bodyInput(page).inputValue()) === long, 'body kept')
    await h.go(page, '/notes/1')
    assert((await h1(page)) === 'Alpha', 'title saved')
    assert((await bodyInput(page).inputValue()) === '', 'body saved')
  }
  check(
    'X23b',
    23,
    'without JS: every message shows, typed values stay, nothing is saved',
    'Save checks both fields on the server … every message that applies is shown, each in its own role=alert … both fields keep exactly what the user typed … also works with JavaScript disabled',
    async () => {
      const page = await h.fresh('X23b', false)
      await h.add(page, 'Alpha')
      await h.add(page, 'Beta')
      await invalidSave(page)
      await unlimit(page)
      await saveNote(page, '   ', 'ok')
      assert(await h.hasAlert(page, 'Write a title first'), `empty: ${await h.alerts(page)}`)
      assert((await bodyInput(page).inputValue()) === 'ok', 'body kept')
      await unlimit(page)
      await saveNote(page, 'z'.repeat(61), '')
      assert(await h.hasAlert(page, 'Use at most 60 characters'), `long: ${await h.alerts(page)}`)
      await h.go(page, '/notes/1')
      await saveNote(page, 'Alpha two', '  Hello\nthere  ')
      assert(
        (await h.statuses(page)).some((s) => s.includes('Saved')),
        `status ${await h.statuses(page)}`,
      )
      assert((await h1(page)) === 'Alpha two', `h1 ${await h1(page)}`)
      assert(
        (await bodyInput(page).inputValue()) === 'Hello\nthere',
        `body "${await bodyInput(page).inputValue()}"`,
      )
    },
  )
  check(
    'X23c',
    23,
    'with JS: invalid save keeps the typed values and saves nothing',
    'When anything is invalid, nothing is saved, every message that applies is shown … both fields keep exactly what the user typed',
    async () => {
      const page = await h.fresh('X23c')
      await h.add(page, 'Alpha')
      await h.add(page, 'Beta')
      await invalidSave(page)
    },
  )
  check(
    'X23d',
    23,
    'archived note page: body, no form, refused on the server; a save ends Undo',
    'The page of an archived note shows its body but no form, and the server refuses to save an archived note … it ends an Undo message',
    async () => {
      const page = await h.fresh('X23d')
      await h.add(page, 'Alpha')
      await h.add(page, 'Beta')
      await h.click(page, h.liButton(page, 'Beta', 'Delete'))
      assert(await h.statusOf(page), 'no undo message')
      await h.go(page, '/notes/1')
      await saveNote(page, undefined, 'Archived body')
      await h.go(page, V.home)
      assert(!(await h.statusOf(page)), 'undo message after save')
      const stale = await tab(page, '/notes/1')
      await h.click(page, h.liButton(page, 'Alpha', 'Archive'))
      await saveNote(stale, 'Alpha changed')
      const plain = await h.newPage(false)
      await plain.context().addCookies(await page.context().cookies())
      await h.go(plain, '/notes/1')
      assert((await h1(plain)) === 'Alpha', `archived note saved: ${await h1(plain)}`)
      const t = await h.text(plain)
      assert(t.includes('Archived') && t.includes('Archived body'), 'body or Archived text')
      assert(
        (await titleInput(plain).count()) === 0 && (await button(plain, 'Save').count()) === 0,
        'form shown',
      )
    },
  )

  // 24 — read-only accounts
  check(
    'X24a',
    24,
    'without JS the admin makes an account read-only and writable again',
    'a third column Access … Make <name> read-only / Make <name> writable … the admin row has neither button … Read-only account … can still use Load more … survives signing out and in … also works with JavaScript disabled',
    async () => {
      const who = h.user('X24a')
      const target = await h.fresh('X24a')
      await h.add(target, 'Alpha')
      await h.addMany(target, 5, 'Item')
      const admin = await adminPage(false)
      const rows = await h.adminRows(admin)
      assert(
        rows.some((r) => r.includes('User') && r.includes('Notes') && r.includes('Access')),
        `header ${JSON.stringify(rows[0])}`,
      )
      assert((await accessOf(admin, who)).startsWith('writable'), `access ${await accessOf(admin, who)}`)
      assert((await accessOf(admin, 'admin')).startsWith('writable'), 'admin access')
      assert((await admin.getByRole('button', { name: /^Make admin / }).count()) === 0, 'button in admin row')
      await h.click(admin, button(admin, `Make ${who} read-only`))
      assert((await accessOf(admin, who)).startsWith('read-only'), `access ${await accessOf(admin, who)}`)
      assert((await button(admin, `Make ${who} writable`).count()) === 1, 'writable button')
      await h.go(target, V.home)
      assert((await h.text(target)).includes('Read-only account'), 'Read-only account text')
      await h.click(target, h.loadMore(target))
      assert((await h.items(target)).length === 6, `Load more: ${(await h.items(target)).length}`)
      await h.click(target, button(target, 'Sign out'))
      await h.signIn(target, who)
      assert((await h.text(target)).includes('Read-only account'), 'lost on sign in')
      await h.click(admin, button(admin, `Make ${who} writable`))
      assert((await accessOf(admin, who)).startsWith('writable'), 'not writable again')
      await h.go(target, V.home)
      assert(!(await h.text(target)).includes('Read-only account'), 'still read-only text')
      await h.add(target, 'Beta')
      assert(await h.has(target, 'Beta'), 'cannot add after writable')
    },
  )
  check(
    'X24b',
    24,
    'without JS the server refuses add, delete, pin, archive, bulk and restore',
    'The server refuses every other change to their notes … Nothing changes, and the page shows Your account is read-only … can still read and search',
    async () => {
      const who = h.user('X24b')
      const page = await h.fresh('X24b', false)
      for (const t of ['Alpha', 'Beta', 'Gamma']) await h.add(page, t)
      await h.click(page, h.liButton(page, 'Gamma', 'Archive'))
      const tAdd = await tab(page, V.home)
      const tDel = await tab(page, V.home)
      const tPin = await tab(page, V.home)
      const tArc = await tab(page, V.home)
      const tBulkD = await tab(page, V.home)
      const tBulkA = await tab(page, V.home)
      const tRes = await tab(page, '/archive')
      await setAccess(who, true)
      await h.add(tAdd, 'Delta')
      await refused(tAdd, 'add')
      await h.click(tDel, h.liButton(tDel, 'Alpha', 'Delete'))
      await refused(tDel, 'delete')
      await h.click(tPin, h.liButton(tPin, 'Beta', 'Pin'))
      await refused(tPin, 'pin')
      await h.click(tArc, h.liButton(tArc, 'Beta', 'Archive'))
      await refused(tArc, 'archive')
      await select(tBulkD, 'Alpha')
      await h.click(tBulkD, button(tBulkD, 'Delete selected'))
      await refused(tBulkD, 'Delete selected')
      await select(tBulkA, 'Beta')
      await h.click(tBulkA, button(tBulkA, 'Archive selected'))
      await refused(tBulkA, 'Archive selected')
      await h.click(tRes, h.liButton(tRes, 'Gamma', 'Restore'))
      await refused(tRes, 'restore')
      const body = await exportOf(page)
      const titles = body.notes.map((n) => n.title).sort()
      assert(JSON.stringify(titles) === '["Alpha","Beta","Gamma"]', `notes ${titles}`)
      const by = Object.fromEntries(body.notes.map((n) => [n.title, n]))
      assert(by.Gamma.archived && !by.Beta.archived && !by.Alpha.archived, 'archived flags changed')
      assert(!body.notes.some((n) => n.pinned), 'pinned')
      await h.go(page, `${V.home}?q=alp`)
      const list = await h.items(page)
      assert(list.length === 1 && list[0].includes('Alpha'), `search ${list}`)
      assert((await h.text(page)).includes('Read-only account'), 'Read-only account text')
    },
  )
  check(
    'X24c',
    24,
    'with JS the server refuses edit, note-page save, share, unshare and undo; sharing still works for others',
    'editing (on the list page and on the note page) … Undo … sharing and unsharing … notes the user shared stay visible … still sees the notes shared with them … Deleting the account ends it',
    async () => {
      const who = h.user('X24c')
      const friend = `${who}f`
      const page = await h.fresh('X24c')
      for (const t of ['Alpha', 'Beta', 'Gamma']) await h.add(page, t)
      await h.share(page, 'Gamma', friend)
      await h.click(page, h.liButton(page, 'Beta', 'Delete'))
      const tEdit = await tab(page, V.home)
      await h.click(tEdit, h.liButton(tEdit, 'Alpha', 'Edit'))
      const tNote = await tab(page, '/notes/1')
      const tShare = await tab(page, V.home)
      const tUnshare = await tab(page, V.home)
      const tUndo = await tab(page, V.home)
      const other = await h.fresh('X24c', true, 'o')
      await h.add(other, 'From other')
      await h.share(other, 'From other', who)
      await setAccess(who, true)
      await tEdit.getByLabel('Edit title', { exact: true }).fill('Omega')
      await h.click(tEdit, button(tEdit, 'Save'))
      await refused(tEdit, 'edit')
      await saveNote(tNote, 'Omega', 'Body')
      await refused(tNote, 'note page save')
      await h.share(tShare, 'Alpha', `${who}z`)
      await refused(tShare, 'share')
      await h.click(tUnshare, h.liButton(tUnshare, 'Gamma', `Unshare ${friend}`))
      await refused(tUnshare, 'unshare')
      await h.click(tUndo, undo(tUndo))
      await refused(tUndo, 'undo')
      const body = await exportOf(page)
      const titles = body.notes.map((n) => n.title).sort()
      assert(JSON.stringify(titles) === '["Alpha","Gamma"]', `notes ${titles}`)
      const f = await h.newPage()
      await h.signIn(f, friend)
      assert(
        (await h.sharedItems(f)).some((t) => t.includes('Gamma')),
        'shared note gone',
      )
      await h.go(page, V.home)
      assert(
        (await h.sharedItems(page)).some((t) => t.includes('From other')),
        'shared with me gone',
      )
      assert(!(await h.liWith(page, 'Gamma').innerText()).includes(`${who}z`), 'shared anyway')
      await h.go(page, '/notes/1')
      assert((await h1(page)) === 'Alpha', 'note page')
      await deleteAccountOf(page)
      await h.signIn(page, who)
      assert(!(await h.text(page)).includes('Read-only account'), 'read-only after account deletion')
      await h.add(page, 'Fresh')
      assert(await h.has(page, 'Fresh'), 'cannot add after account deletion')
    },
  )
  check(
    'X24d',
    24,
    'a non-admin cannot change access, even with a stale admin form',
    'Only the admin can change this: the server refuses it for anyone else.',
    async () => {
      const target = `${h.user('X24d')}t`
      const t = await h.fresh('X24d', true, 't')
      const stale = await adminPage(false)
      const same = await tab(stale, V.home)
      await h.click(same, button(same, 'Sign out'))
      await h.signIn(same, h.user('X24d'))
      await h.click(stale, button(stale, `Make ${target} read-only`))
      const admin = await adminPage()
      assert(
        (await accessOf(admin, target)).startsWith('writable'),
        `access ${await accessOf(admin, target)}`,
      )
      await h.go(t, V.home)
      assert(!(await h.text(t)).includes('Read-only account'), 'made read-only by a non-admin')
    },
  )

  // 25 — shared notes update live
  const shared = (page) => h.sharedItems(page)
  const heading = (page) => page.locator('h2', { hasText: 'Shared with me' }).count()
  check(
    'X25a',
    25,
    'share, rename and unshare show up without a reload; typing and checks stay',
    'within 5 seconds of a change by the owner it shows the change … heading appears … disappears with the last … Nothing else on the page changes by itself',
    async () => {
      const ownerName = h.user('X25a')
      const recName = `${ownerName}r`
      const owner = await h.fresh('X25a')
      await h.add(owner, 'Live plan')
      const rec = await h.fresh('X25a', true, 'r')
      await h.add(rec, 'Mine')
      await rec.evaluate(() => {
        window.__live = 1
      })
      await rec.getByLabel(V.addLabel, { exact: true }).fill('draft text')
      await select(rec, 'Mine')
      assert((await heading(rec)) === 0, 'heading before sharing')
      await h.share(owner, 'Live plan', recName)
      assert(
        await until(async () =>
          (await shared(rec)).some((t) => t.includes('Live plan') && t.includes(`from ${ownerName}`)),
        ),
        `share not shown: ${await shared(rec)}`,
      )
      assert((await heading(rec)) === 1, 'no heading')
      await h.edit(owner, 'Live plan', 'Live renamed')
      assert(
        await until(async () => (await shared(rec))[0]?.includes('Live renamed')),
        `rename: ${await shared(rec)}`,
      )
      await h.click(owner, h.liButton(owner, 'Live renamed', `Unshare ${recName}`))
      assert(
        await until(async () => (await shared(rec)).length === 0 && (await heading(rec)) === 0),
        `unshare: ${await shared(rec)}`,
      )
      assert((await rec.evaluate(() => window.__live)) === 1, 'the page was reloaded')
      assert(
        (await rec.getByLabel(V.addLabel, { exact: true }).inputValue()) === 'draft text',
        'typed text lost',
      )
      assert(await rec.getByLabel('Select Mine', { exact: true }).isChecked(), 'checkbox lost')
    },
  )
  check(
    'X25b',
    25,
    'note-page rename, archive, restore, delete and account deletion show up live; an open edit stays',
    'renaming it (on the list page or on the note’s page), archiving, restoring or deleting it, and deleting their account … an open edit stays',
    async () => {
      const recName = `${h.user('X25b')}r`
      const owner = await h.fresh('X25b')
      await h.add(owner, 'Plan one')
      await h.add(owner, 'Plan two')
      const rec = await h.fresh('X25b', true, 'r')
      await h.add(rec, 'Mine')
      await h.click(rec, h.liButton(rec, 'Mine', 'Edit'))
      await rec.getByLabel('Edit title', { exact: true }).fill('Mine changed')
      await rec.evaluate(() => {
        window.__live = 1
      })
      await h.share(owner, 'Plan one', recName)
      await h.share(owner, 'Plan two', recName)
      assert(await until(async () => (await shared(rec)).length === 2), `share: ${await shared(rec)}`)
      await h.go(owner, '/notes/1')
      await saveNote(owner, 'Plan renamed')
      assert(
        await until(async () => (await shared(rec)).some((t) => t.includes('Plan renamed'))),
        `rename: ${await shared(rec)}`,
      )
      await h.go(owner, V.home)
      await h.click(owner, h.liButton(owner, 'Plan renamed', 'Archive'))
      assert(await until(async () => (await shared(rec)).length === 1), `archive: ${await shared(rec)}`)
      await h.go(owner, '/archive')
      await h.click(owner, h.liButton(owner, 'Plan renamed', 'Restore'))
      assert(await until(async () => (await shared(rec)).length === 2), `restore: ${await shared(rec)}`)
      await h.go(owner, V.home)
      await h.click(owner, h.liButton(owner, 'Plan two', 'Delete'))
      assert(
        await until(async () => {
          const s = await shared(rec)
          return s.length === 1 && s[0].includes('Plan renamed')
        }),
        `delete: ${await shared(rec)}`,
      )
      await deleteAccountOf(owner)
      assert(
        await until(async () => (await shared(rec)).length === 0 && (await heading(rec)) === 0),
        `account deletion: ${await shared(rec)}`,
      )
      assert((await rec.evaluate(() => window.__live)) === 1, 'the page was reloaded')
      assert(
        (await rec.getByLabel('Edit title', { exact: true }).inputValue()) === 'Mine changed',
        'open edit lost',
      )
    },
  )

  // 26 — export: numbers, bodies and CSV
  const disposition = (res) => norm(res.headers.get('content-disposition') ?? '')
  check(
    'X26a',
    26,
    'JSON export: number and body keys, order, flags, download header',
    'exactly the keys number, title, body, pinned, archived and createdAt … ?format=json gives the same result … Content-Disposition: attachment; filename="notes-<user>.json"',
    async () => {
      const who = h.user('X26a')
      const page = await h.fresh('X26a')
      for (const t of ['Alpha', 'Beta', 'Gamma']) await h.add(page, t)
      await h.click(page, h.liButton(page, 'Alpha', 'Pin'))
      const alphaAt = await h.datetimeOf(page, 'Alpha')
      await h.click(page, h.liButton(page, 'Gamma', 'Archive'))
      await h.go(page, '/notes/2')
      await saveNote(page, undefined, 'Line one\nLine two')
      const o = await h.fresh('X26a', true, 'o')
      await h.add(o, 'Foreign')
      await h.share(o, 'Foreign', who)
      await h.go(page, V.home)
      const href = await page.getByRole('link', { name: 'Export', exact: true }).getAttribute('href')
      assert(new URL(href ?? '', base).pathname === '/api/export', `href ${href}`)
      const res = await h.fetchAs(page, '/api/export')
      assert(res.status === 200, `status ${res.status}`)
      assert((res.headers.get('content-type') ?? '').includes('application/json'), 'content-type')
      assert(
        new RegExp(`^attachment;\\s*filename="notes-${who}\\.json"$`, 'i').test(disposition(res)),
        `disposition ${disposition(res)}`,
      )
      const body = await res.json()
      assert(body.user === who, `user ${body.user}`)
      const keys = '["archived","body","createdAt","number","pinned","title"]'
      for (const n of body.notes)
        assert(JSON.stringify(Object.keys(n).sort()) === keys, `keys ${Object.keys(n)}`)
      const titles = body.notes.map((n) => n.title)
      assert(JSON.stringify(titles) === '["Alpha","Gamma","Beta"]', `order ${titles}`)
      const numbers = body.notes.map((n) => n.number)
      assert(JSON.stringify(numbers) === '[1,3,2]', `numbers ${JSON.stringify(numbers)}`)
      const bodies = body.notes.map((n) => n.body)
      assert(
        JSON.stringify(bodies) === JSON.stringify(['', '', 'Line one\nLine two']),
        `bodies ${JSON.stringify(bodies)}`,
      )
      const [alpha, gamma, beta] = body.notes
      assert(alpha.pinned === true && gamma.archived === true && beta.archived === false, 'flags')
      assert(Date.parse(alpha.createdAt) === Date.parse(alphaAt ?? ''), `createdAt ${alpha.createdAt}`)
      const again = await (await h.fetchAs(page, '/api/export?format=json')).json()
      assert(JSON.stringify(again) === JSON.stringify(body), '?format=json differs')
    },
  )
  check(
    'X26b',
    26,
    'CSV export: exact content, quoting, CRLF, headers and the Export CSV link',
    'the first line is number,title,body,pinned,archived,createdAt … enclosed in double quotes … each double quote inside it is doubled … every line ends with CRLF … Export CSV',
    async () => {
      const who = h.user('X26b')
      const page = await h.fresh('X26b')
      await h.add(page, 'Plain')
      await h.add(page, 'Say "hi", Bob')
      await h.go(page, '/notes/1')
      await saveNote(page, undefined, 'a,b\nc')
      await h.go(page, V.home)
      const href = await page.getByRole('link', { name: 'Export CSV', exact: true }).getAttribute('href')
      const url = new URL(href ?? '', base)
      assert(url.pathname === '/api/export' && url.searchParams.get('format') === 'csv', `href ${href}`)
      const json = await exportOf(page)
      const res = await h.fetchAs(page, '/api/export?format=csv')
      assert(res.status === 200, `status ${res.status}`)
      assert(
        (res.headers.get('content-type') ?? '').includes('text/csv'),
        `type ${res.headers.get('content-type')}`,
      )
      assert(
        new RegExp(`^attachment;\\s*filename="notes-${who}\\.csv"$`, 'i').test(disposition(res)),
        `disposition ${disposition(res)}`,
      )
      const q = (v) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
      const lines = [
        'number,title,body,pinned,archived,createdAt',
        ...json.notes.map((n) =>
          [n.number, n.title, n.body, n.pinned, n.archived, n.createdAt].map((v) => q(String(v))).join(','),
        ),
      ]
      const expected = lines.map((l) => `${l}\r\n`).join('')
      const csv = await res.text()
      assert(
        csv === expected,
        `csv ${JSON.stringify(csv).slice(0, 200)} expected ${JSON.stringify(expected).slice(0, 200)}`,
      )
      assert(csv.includes('"Say ""hi"", Bob"') && csv.includes('"a,b\nc"'), 'quoting')
    },
  )
  check(
    'X26c',
    26,
    'export: 401 signed out in every format, 400 for an unknown format',
    'Any other format gives status 400. When nobody is signed in, every format gives status 401.',
    async () => {
      for (const qs of ['', '?format=json', '?format=csv'])
        assert((await fetch(`${base}/api/export${qs}`)).status === 401, `signed out ${qs}`)
      const page = await h.fresh('X26c')
      const res = await h.fetchAs(page, '/api/export?format=xml')
      assert(res.status === 400, `format=xml status ${res.status}`)
    },
  )

  // 27 — undo for Delete selected
  check(
    'X27a',
    27,
    'with JS: Delete selected can be undone exactly; only the latest delete',
    'Deleted <n> notes … Undo puts every one of those notes back exactly as it was: title, body, number, place, pin, Added date and the users it was shared with … only the most recent delete',
    async () => {
      const who = h.user('X27a')
      const friend = `${who}f`
      const page = await h.fresh('X27a')
      for (const t of ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon']) await h.add(page, t)
      await h.click(page, h.liButton(page, 'Beta', 'Pin'))
      await h.share(page, 'Gamma', friend)
      await h.go(page, '/notes/3')
      await saveNote(page, undefined, 'Kept body')
      await h.go(page, V.home)
      await h.click(page, h.liButton(page, 'Epsilon', 'Delete'))
      const before = await h.items(page)
      const dates = {}
      for (const t of ['Alpha', 'Gamma', 'Delta']) dates[t] = await h.datetimeOf(page, t)
      for (const t of ['Alpha', 'Gamma', 'Delta']) await select(page, t)
      await h.settle(page, 300)
      assert((await h.text(page)).includes('Selected: 3'), 'Selected: 3')
      await h.click(page, button(page, 'Delete selected'))
      const left = await h.items(page)
      assert(left.length === 1 && left[0].includes('Beta'), `after delete ${left}`)
      assert((await h.statusOf(page)).includes('Deleted 3 notes'), `status ${await h.statuses(page)}`)
      await h.go(page, V.home)
      assert((await h.statusOf(page)).includes('Deleted 3 notes'), 'lost on reload')
      await h.click(page, undo(page))
      const after = await h.items(page)
      assert(JSON.stringify(after) === JSON.stringify(before), `after undo ${after} before ${before}`)
      for (const t of ['Alpha', 'Gamma', 'Delta'])
        assert((await h.datetimeOf(page, t)) === dates[t], `${t} date changed`)
      assert((await numberOf(page, 'Gamma')) === '3' && (await numberOf(page, 'Delta')) === '4', 'numbers')
      assert(!(await h.has(page, 'Epsilon')), 'the earlier delete was undone too')
      assert(!(await h.statusOf(page)), 'message still shown')
      const f = await h.newPage()
      await h.signIn(f, friend)
      assert(
        (await h.sharedItems(f)).some((t) => t.includes('Gamma')),
        'not shared again',
      )
      await h.go(page, '/notes/3')
      assert((await bodyInput(page).inputValue()) === 'Kept body', 'body lost')
    },
  )
  check(
    'X27b',
    27,
    'without JS: undo one selected note, and the next change ends the message',
    'Deleted "<title>" when one note was deleted … the message stays (also across a reload) until Undo, until the user’s notes change again … also works with JavaScript disabled',
    async () => {
      const page = await h.fresh('X27b', false)
      for (const t of ['Alpha', 'Beta', 'Gamma']) await h.add(page, t)
      await select(page, 'Alpha')
      await h.click(page, button(page, 'Delete selected'))
      assert((await h.statusOf(page)).includes('Deleted "Alpha"'), `status ${await h.statuses(page)}`)
      await h.go(page, V.home)
      assert((await h.statusOf(page)).includes('Deleted "Alpha"'), 'lost on reload')
      await h.click(page, undo(page))
      await h.go(page, V.home)
      const list = await h.items(page)
      assert(
        list.length === 3 &&
          list[0].includes('Gamma') &&
          list[2].includes('Alpha') &&
          list[2].includes('No. 1'),
        `after undo ${list}`,
      )
      await select(page, 'Alpha')
      await select(page, 'Beta')
      await h.click(page, button(page, 'Delete selected'))
      assert((await h.statusOf(page)).includes('Deleted 2 notes'), `status ${await h.statuses(page)}`)
      await h.add(page, 'Delta')
      assert(!(await h.statusOf(page)), 'message after add')
      assert((await h.items(page)).length === 2, `list ${await h.items(page)}`)
    },
  )
  check(
    'X27c',
    27,
    'signing out ends the bulk undo message',
    'the message stays … until the user signs out',
    async () => {
      const page = await h.fresh('X27c')
      for (const t of ['Alpha', 'Beta']) await h.add(page, t)
      await select(page, 'Alpha')
      await select(page, 'Beta')
      await h.click(page, button(page, 'Delete selected'))
      assert((await h.statusOf(page)).includes('Deleted 2 notes'), `status ${await h.statuses(page)}`)
      await h.click(page, button(page, 'Sign out'))
      await h.signIn(page, h.user('X27c'))
      assert(!(await h.statusOf(page)), 'message after signing in again')
      assert((await h.items(page)).length === 0, 'notes came back')
    },
  )

  // 28 — remove German
  check(
    'X28a',
    28,
    'no language control, lang="en", with and without JS',
    'The Deutsch / English control is removed from /login and the list page … lang="en"',
    async () => {
      for (const js of [true, false]) {
        const page = await h.newPage(js)
        await h.go(page, '/login')
        for (const where of ['login', 'list']) {
          if (where === 'list') await h.signIn(page, h.user(js ? 'X28a' : 'X28b'))
          assert((await h.control(page, 'Deutsch').count()) === 0, `${where}: Deutsch control (js ${js})`)
          assert((await h.control(page, 'English').count()) === 0, `${where}: English control (js ${js})`)
          const lang = await page.locator('html').getAttribute('lang')
          assert(lang === 'en' || lang?.startsWith('en-'), `${where}: lang ${lang}`)
        }
      }
    },
  )
  check(
    'X28b',
    28,
    'a browser asking for German gets English',
    'Every page is in English … whatever language the browser asks for (for example with Accept-Language: de)',
    async () => {
      const de = { 'accept-language': 'de-DE,de;q=0.9' }
      const login = await (await fetch(`${base}/login`, { headers: de })).text()
      assert(/<html[^>]*lang="en/.test(login), 'login lang')
      assert(login.includes('Sign in') && !login.includes('Anmelden'), 'login text')
      const page = await h.fresh('X28c')
      const list = await (
        await fetch(base + V.home, {
          redirect: 'manual',
          headers: { ...de, cookie: await h.cookieHeader(page) },
        })
      ).text()
      assert(/<html[^>]*lang="en/.test(list), 'list lang')
      assert(
        list.includes('Signed in as') && !list.includes('Angemeldet') && !list.includes('Notizen'),
        'list text',
      )
    },
  )
}
