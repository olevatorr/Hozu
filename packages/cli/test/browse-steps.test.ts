import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Cdp, findBrowser, launch } from '../src/cdp.ts'
import { act, describeBrowse, differences, parseStep, stepsOf } from '../src/commands/browse.ts'
import { Tab, type World } from '../src/commands/browse-tab.ts'
import type { BrowseError, BrowseMode, BrowseOutput } from '../src/contract.ts'

const PAGE = `<!doctype html><title>Steps</title>
<ul><li>Groceries: Milk, Bread
  <ul>
    <li>Milk <form method="post" action="/done"><input type="hidden" name="id" value="n1"><button>Delete</button></form></li>
    <li>Bread <form method="post" action="/done"><input type="hidden" name="id" value="n2"><button>Delete</button></form></li>
  </ul>
</li></ul>
<form method="post" action="/echo" id="bulk" aria-label="Bulk">
  <label>Tag <input name="tag"></label><label>Tag <input name="tag"></label>
  <label><input type="checkbox" name="ids" value="n1"> Apples</label>
  <textarea name="body" aria-label="Body"></textarea>
  <button type="submit" name="action" value="delete">Delete selected</button>
  <button type="button" onclick="document.title = 'clicked'">Toggle</button>
</form>
<label><input type="checkbox" name="ids" value="n3" form="bulk"> Pears</label>
<button type="submit" name="action" value="archive" form="bulk">Archive</button>
<button type="button" commandfor="sheet" command="show-modal">Open sheet</button>
<dialog id="sheet"><p>Sheet body</p><button type="button" commandfor="sheet" command="close">Close sheet</button></dialog>`

const decode = (body: Uint8Array | null) => new TextDecoder().decode(body ?? new Uint8Array())

const seen: Record<string, string>[] = []
const world = {
  fetch: async (r: {
    url: string
    method: string
    headers: Record<string, string>
    body: Uint8Array | null
  }) => (
    seen.push(r.headers),
    {
      id: 0,
      status: 200,
      stream: false,
      headers: [['content-type', 'text/html']] as [string, string][],
      body: new TextEncoder().encode(
        r.method === 'POST'
          ? `<title>Posted</title><p>${new URL(r.url).pathname} ${decode(r.body)}</p>`
          : PAGE,
      ),
    }
  ),
  cancel: () => {},
} as unknown as World

const browser = findBrowser()

describe.skipIf(!browser)('browse steps with and without JS (ADR 0043 J)', () => {
  let cdp: Cdp
  let profile: string
  const errors: BrowseError[] = []
  beforeAll(async () => {
    profile = await mkdtemp(join(tmpdir(), 'hozu-steps-'))
    cdp = launch(browser!, profile)
  })
  afterAll(async () => {
    await cdp.close()
    await rm(profile, { recursive: true, force: true })
  })

  const tab = async (mode: BrowseMode) => {
    const t = new Tab(cdp, world, mode, null, errors)
    await t.start(null, false, { width: 1280, height: 800 })
    cdp.on((method, params, from) => {
      if (from && t.sessions.has(from)) t.handle(method, params, from)
    })
    await t.open('/')
    return t
  }
  const run = async (t: Tab, step: string) => {
    t.mark()
    const r = await act(t, parseStep(step))
    if (r.ok && !r.jsOnly) await t.settle()
    return r
  }
  const text = async (t: Tab) => (await t.look()).text

  for (const mode of ['on', 'off'] as const)
    it(`${mode}: fill appends for a repeated name, check sets the state, a form= button posts with its value`, async () => {
      const t = await tab(mode)
      expect(await run(t, 'fill Tag=a')).toMatchObject({ ok: true, note: 'filled 1 of 2 named "Tag"' })
      expect(await run(t, 'fill Tag=b')).toMatchObject({ ok: true, note: 'filled 2 of 2 named "Tag"' })
      expect(await run(t, 'check Apples')).toMatchObject({ ok: true })
      expect(await run(t, 'check Apples')).toMatchObject({ ok: true, note: 'already checked' })
      expect(await run(t, 'check Pears')).toMatchObject({ ok: true })
      expect(await run(t, 'uncheck Pears')).toMatchObject({ ok: true })
      expect(await run(t, 'check Pears')).toMatchObject({ ok: true })
      expect(await run(t, 'click Archive')).toMatchObject({ ok: true, jsOnly: null })
      expect(await text(t)).toBe('/echo tag=a&tag=b&ids=n1&body=&ids=n3&action=archive')
    }, 30_000)

  it('in "<text>" scopes a target to the smallest list item, row or form containing the text', async () => {
    const t = await tab('off')
    expect(await run(t, 'click Delete in "Bread"')).toMatchObject({ ok: true })
    expect(await text(t)).toBe('/done id=n2')
    await t.open('/')
    expect(await run(t, 'click Delete in "Butter"')).toEqual({
      ok: false,
      note: 'No list item, table row or form contains "Butter"',
      jsOnly: null,
    })
    expect((await run(t, 'click Delete')).note).toBe('2 matched; used the first')
    await t.open('/')
    expect((await run(t, 'fill Tags=x')).note).toMatch(
      /^No fill target named "Tags"\. Did you mean "Tag"\? On the page: /,
    )
  }, 30_000)

  it('fill turns \\n and \\t into a line break and a tab, and \\\\ into one backslash (ADR 0069 A6)', async () => {
    const t = await tab('off')
    await run(t, 'fill Body=one\\ntwo\\tthree \\\\n \\d')
    await run(t, 'submit "Bulk"')
    expect(await text(t)).toBe('/echo tag=&tag=&body=one%0D%0Atwo%09three+%5Cn+%5Cd&action=delete')
  }, 30_000)

  describe('flashes (ADR 0069 A3)', () => {
    const step = async (t: Tab, change: string) => {
      await t.tagElements()
      await t.evaluate(`(() => { ${change} })()`)
      return t.smoothness()
    }
    const html = (markup: string) => `document.body.innerHTML = ${JSON.stringify(markup)}`

    it('two empty inputs of one class with different names are not a flash', async () => {
      const t = await tab('on')
      await t.evaluate(html('<main><form><input class="f" name="card"></form></main>'))
      const r = await step(
        t,
        `document.querySelector('input').replaceWith(Object.assign(document.createElement('input'), { className: 'f', name: 'code' }))`,
      )
      expect([r.replaced, r.flashes, r.flashed]).toEqual([1, 0, []])
    }, 30_000)

    it('a node built again in another place is not a flash', async () => {
      const t = await tab('on')
      await t.evaluate(html('<main><ul class="todo"><li>Milk</li></ul><ul class="done"></ul></main>'))
      const r = await step(
        t,
        `const li = document.querySelector('.todo li'); li.remove(); document.querySelector('.done').append(li.cloneNode(true))`,
      )
      expect([r.replaced, r.flashes, r.flashed]).toEqual([1, 0, []])
      const moved = await step(
        t,
        `document.querySelector('.todo').append(document.querySelector('.done li'))`,
      )
      expect([moved.replaced, moved.flashes]).toEqual([0, 0])
    }, 30_000)

    it('names a real flash by its path, once for the outermost element', async () => {
      const t = await tab('on')
      await t.evaluate(
        html(
          '<main><form class="pay"><input class="f" name="card"><p class="hint"><b>Card</b> number</p></form></main>',
        ),
      )
      const r = await step(
        t,
        `for (const el of document.querySelectorAll('input, p')) el.replaceWith(el.cloneNode(true))`,
      )
      expect(r.flashes).toBe(3)
      expect(r.flashed).toEqual(['main > form > input[name=card]', 'main > form > p.hint'])
    }, 30_000)
  })

  it('submit "<form>" and press Enter submit natively, with the default button as the submitter', async () => {
    const t = await tab('off')
    expect(await run(t, 'submit "Bulk"')).toMatchObject({ ok: true })
    expect(await text(t)).toBe('/echo tag=&tag=&body=&action=delete')
    await t.open('/')
    await run(t, 'fill Tag=x')
    expect(await run(t, 'press Enter')).toMatchObject({ ok: true, jsOnly: null })
    expect(await text(t)).toBe('/echo tag=x&tag=&body=&action=delete')
  }, 30_000)

  for (const mode of ['on', 'off'] as const)
    it(`${mode}: post sends a native form as the actor, with the actor's headers (ADR 0056 C)`, async () => {
      const t = await tab(mode)
      t.headers = { authorization: 'Bearer b' }
      expect(await run(t, 'post /notes/n1 text=Hi there&done=on')).toMatchObject({
        ok: true,
        note: 'posted 2 fields to /notes/n1',
      })
      expect(await text(t)).toBe('/notes/n1 text=Hi+there&done=on')
      expect(seen.at(-1)).toMatchObject({ authorization: 'Bearer b' })
      await expect(act(t, parseStep('post notes'))).rejects.toThrow('post takes a path')
    }, 30_000)

  it('a step with no native effect is js-only without JS, and runs with JS', async () => {
    const off = await tab('off')
    expect(await run(off, 'click Toggle')).toEqual({ ok: true, note: null, jsOnly: 'a type=button button' })
    await run(off, 'fill Body=hi')
    expect(await run(off, 'press Enter')).toMatchObject({ jsOnly: 'Enter in a textarea adds a line' })
    expect(await run(off, 'press Escape')).toMatchObject({ jsOnly: 'Escape has no native action' })
    expect((await off.look()).title).toBe('Steps')
    const on = await tab('on')
    expect(await run(on, 'click Toggle')).toEqual({ ok: true, note: null, jsOnly: null })
    expect((await on.look()).title).toBe('clicked')
    expect(errors).toEqual([])
  }, 30_000)

  it('a commandfor button is native: without JS the click opens and closes the dialog (ADR 0070 C8)', async () => {
    const off = await tab('off')
    expect(await run(off, 'click Open sheet')).toEqual({ ok: true, note: null, jsOnly: null })
    expect((await off.look()).text).toContain('Sheet body')
    expect(await run(off, 'click Close sheet')).toEqual({ ok: true, note: null, jsOnly: null })
    expect((await off.look()).text).not.toContain('Sheet body')
    expect(errors).toEqual([])
  }, 30_000)
})

describe('--js both differences (ADR 0070 B6)', () => {
  const page = (text: string, url = '/orders') => ({ url, title: 'Orders', text, component: [] })

  it('names the words that differ when each mode wrote its own row', () => {
    const on = page('Orders\nOrder #1307 placed for 2 items\nShip')
    const off = page('Orders\nOrder #1306 placed for 2 items\nShip')
    expect(differences(on, off)).toEqual([{ on: '#1307', off: '#1306' }])
    expect(differences(page('A\nOrder placed'), page('A'))).toEqual([{ on: 'Order placed', off: '' }])
    expect(differences(page('A', '/orders/7'), page('A', '/orders/8'))).toEqual([
      { on: '/orders/7', off: '/orders/8' },
    ])
    const text = describeBrowse({
      path: '/orders',
      url: '/orders',
      status: 200,
      title: 'Orders',
      hydrated: true,
      modes: ['on', 'off'],
      steps: [
        {
          step: 'click Place order',
          ok: true,
          note: null,
          differs: true,
          differences: [
            { on: '#1307', off: '#1306' },
            { on: 'Placed', off: '' },
          ],
          modes: (['on', 'off'] as const).map((mode) => ({
            mode,
            ok: true,
            note: null,
            jsOnly: null,
            requested: true,
            navigated: false,
            url: '/orders',
            added: ['Placed'],
            removed: [],
          })),
        },
      ],
      errors: [],
      components: [],
      text: '',
      truncated: false,
      elements: [],
      screenshot: null,
    } satisfies BrowseOutput)
    expect(text).toContain(
      '1 click Place order: + Placed  ≠ DIFFERS (on vs off): "#1307" vs "#1306"; "Placed" vs (nothing)',
    )
  })
})

describe('step parsing', () => {
  it('takes in "<text>" before or after the value, and several steps in one --do (trial 0024)', () => {
    const want = { verb: 'fill', target: 'Share with', value: 'bob', within: 'Buy milk' }
    expect(parseStep('fill Share with=bob in "Buy milk"')).toEqual(want)
    expect(parseStep('fill Share with in "Buy milk"=bob')).toEqual(want)
    expect(stepsOf('fill Title=Milk; press Enter; fill Body=a; b; click Save')).toEqual([
      'fill Title=Milk',
      'press Enter',
      'fill Body=a; b',
      'click Save',
    ])
    expect(stepsOf('wait 700; release; click Refresh')).toEqual(['wait 700', 'release', 'click Refresh'])
  })

  it('splits steps only outside quotes and before a whole verb, and a value may hold in "…"=', () => {
    expect(stepsOf('click "Save; press Enter"; fill Note=post-it; post-it; wait 10')).toEqual([
      'click "Save; press Enter"',
      'fill Note=post-it; post-it',
      'wait 10',
    ])
    expect(parseStep('fill Body=say in "a"=b')).toEqual({
      verb: 'fill',
      target: 'Body',
      value: 'say in "a"=b',
      within: null,
    })
    expect(stepsOf('fill Size=12"; click Save')).toEqual(['fill Size=12"', 'click Save'])
    expect(parseStep('fill "a=b" in "Row" = x')).toEqual({
      verb: 'fill',
      target: 'a=b',
      value: ' x',
      within: 'Row',
    })
    expect(parseStep('fill "a=b"=x')).toEqual({ verb: 'fill', target: 'a=b', value: 'x', within: null })
  })

  it('post and remember keep their whole target', () => {
    expect(parseStep('post /a x=1&y=2')).toMatchObject({ verb: 'post', target: '/a x=1&y=2' })
    expect(parseStep('remember id from li a @href')).toMatchObject({
      verb: 'remember',
      target: 'id from li a @href',
    })
  })

  it('takes a quoted target like an unquoted one', () => {
    expect(parseStep('click "Save draft"')).toEqual(parseStep('click Save draft'))
    expect(parseStep('fill "Draft"=hello')).toEqual({
      verb: 'fill',
      target: 'Draft',
      value: 'hello',
      within: null,
    })
    expect(parseStep('click "Remove" in "Milk"')).toEqual({
      verb: 'click',
      target: 'Remove',
      value: '',
      within: 'Milk',
    })
  })
})

describe('fill escapes (ADR 0069 A6)', () => {
  it('reads \\n, \\t and \\\\ in fill values only, and keeps any other backslash', () => {
    expect(parseStep('fill Body=a\\nb\\tc').value).toBe('a\nb\tc')
    expect(parseStep('fill Body=C:\\\\new \\d').value).toBe('C:\\new \\d')
    expect(parseStep('fill Body in "Milk"=x\\ny').value).toBe('x\ny')
    expect(parseStep('select Size=a\\nb').value).toBe('a\\nb')
  })
})
