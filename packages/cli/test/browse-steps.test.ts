import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Cdp, findBrowser, launch } from '../src/cdp.ts'
import { act, parseStep } from '../src/commands/browse.ts'
import { Tab, type World } from '../src/commands/browse-tab.ts'
import type { BrowseError, BrowseMode } from '../src/contract.ts'

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
<button type="submit" name="action" value="archive" form="bulk">Archive</button>`

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
    await t.start(null, false)
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
  }, 30_000)

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
})

describe('step parsing', () => {
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
