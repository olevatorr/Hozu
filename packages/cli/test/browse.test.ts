import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Ajv } from 'ajv'
import { afterAll, describe, expect, it } from 'vitest'
import { findBrowser } from '../src/cdp.ts'
import { main } from '../src/main.ts'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const example = (name: string) => `${root}examples/${name}`
const ajv = new Ajv({ allErrors: true, strict: false })
const schema = JSON.parse(readFileSync(`${root}packages/cli/schema/browse.schema.json`, 'utf8'))
const ADA = '{"user":"ada"}'
/** Every browse run in this file, both modes included, finishes within this time when the file runs alone. */
const BUDGET_MS = 20_000
const budgeted = process.env.HOZU_BUDGET === '1'
const runs: number[] = []
afterAll(() => {
  if (!runs.length) return
  const slowest = Math.max(...runs)
  if (process.env.HOZU_BUDGET_REPORT)
    writeFileSync(process.env.HOZU_BUDGET_REPORT, JSON.stringify({ runs, slowest }))
  else if (!budgeted)
    console.info(`hozu browse: ${runs.length} runs, slowest ${slowest} ms (BUDGET_MS with HOZU_BUDGET=1)`)
})

async function browse(args: string[], cwd = example('stations')) {
  let stdout = ''
  const start = Date.now()
  const code = await main(
    ['browse', ...args, ...(args.includes('--js') ? [] : ['--js', 'both']), '--json'],
    cwd,
    (s) => {
      stdout += s
    },
  )
  runs.push(Date.now() - start)
  if (budgeted) expect(runs.at(-1)).toBeLessThan(BUDGET_MS)
  const out = JSON.parse(stdout)
  expect(ajv.validate(schema, out), JSON.stringify(ajv.errors)).toBe(true)
  return { code, out }
}

async function human(args: string[], cwd: string) {
  let stdout = ''
  const code = await main(
    ['browse', ...args, ...(args.includes('--js') ? [] : ['--js', 'both'])],
    cwd,
    (s) => {
      stdout += s
    },
  )
  return { code, stdout }
}

const copies: string[] = []
afterAll(() => {
  for (const dir of copies) rmSync(dir, { recursive: true, force: true })
})

function copyOf(name: string, file: string, edit: (source: string) => string) {
  const copy = `${root}.tmp/browse-${name}-${Date.now()}`
  copies.push(copy)
  mkdirSync(copy, { recursive: true })
  cpSync(example(name), copy, { recursive: true, filter: (f) => !f.includes('node_modules') })
  symlinkSync(`${example(name)}/node_modules`, `${copy}/node_modules`)
  const path = `${copy}/${file}`
  const source = readFileSync(path, 'utf8')
  const edited = edit(source)
  expect(edited).not.toBe(source)
  writeFileSync(path, edited)
  return copy
}

const steps = (...list: string[]) => list.flatMap((step) => ['--do', step])

describe('the testing guide (ADR 0043 J)', () => {
  const guide = readFileSync(`${root}.claude/skills/hozu/topics/testing.md`, 'utf8')
  it('verifies other users, reloads and sign-out in one browse chain, with JS unless the page must work without it', () => {
    expect(guide).toContain('verify any such statement once, in one `browse`\n  chain. `--as <name>`')
    expect(guide).not.toContain('(the default) runs every step with JS and with JS switched off')
    expect(guide).toContain('`--as <name>`')
    expect(guide).not.toMatch(/two commands|hozu post|--next/i)
    expect(guide).toContain('A passing six-step run stays under 1.5 KB')
  })
})

describe.skipIf(!findBrowser())('hozu browse (ADR 0040 D, ADR 0043 J)', () => {
  it('mounts every client component, runs the steps in order and reports the page after them', async () => {
    const { code, out } = await browse([
      '/',
      '--js',
      'on',
      ...steps('fill Search=park', 'click Tech Park'),
      '--select',
      'canvas',
    ])
    expect(code).toBe(0)
    expect(out.status).toBe(200)
    expect(out.hydrated).toBe(true)
    expect(out.errors).toEqual([])
    expect(out.steps.map((s: { ok: boolean }) => s.ok)).toEqual([true, true])
    expect(
      Object.fromEntries(out.components.map((c: { name: string; state: string }) => [c.name, c.state])),
    ).toEqual({
      'stations.Counter': 'mounted',
      'stations.StationMap': 'mounted',
      'stations.FadeIn': 'mounted',
      'stations.DistrictChart': 'mounted',
      'stations.Globe': 'mounted',
    })
    expect(out.text).toContain('Available bikes: 15')
    expect(out.text).toContain('Docks: 24')
    expect(out.elements.map((e: { attrs: Record<string, string> }) => e.attrs['aria-label'])).toContain(
      'Bikes by district',
    )
  }, 60_000)

  it('fails with the names on the page when a step finds nothing, and reports failed requests with url and type', async () => {
    const missing = await browse(['/', ...steps('click Delete everything', 'wait 10')])
    expect(missing.code).toBe(1)
    expect(missing.out.steps[0].ok).toBe(false)
    expect(missing.out.steps[0].note).toContain('No click target named "Delete everything". On the page:')
    expect(missing.out.steps[0].note).toContain('"Start tour"')
    expect(missing.out.steps[1].note).toBe('skipped after a failed step')
    const lost = await browse(['/nowhere'])
    expect(lost.code).toBe(1)
    expect(lost.out.status).toBe(404)
    expect(lost.out.errors).toEqual(
      ['on', 'off'].map((mode) => ({
        kind: 'request',
        text: '404 /nowhere',
        at: '/nowhere',
        url: '/nowhere',
        type: 'Document',
        mode,
      })),
    )
  }, 60_000)

  it('reports a client component whose setup throws, with the error', async () => {
    const copy = copyOf('stations', 'features/stations/map.client.ts', (s) =>
      s.replace('const map = L.map', "throw new Error('boom')\n  const map = L.map"),
    )
    const { code, out } = await browse(['/', '--js', 'on'], copy)
    expect(code).toBe(1)
    expect(out.errors).toEqual([
      expect.objectContaining({ kind: 'console', text: 'Component stations.StationMap failed Error: boom' }),
    ])
    expect(out.components.find((c: { name: string }) => c.name === 'stations.StationMap')).toMatchObject({
      state: 'failed',
      hint: 'its setup threw; see errors',
    })
  }, 60_000)

  it('prints only what each step changed; a passing six-step run in both modes is at most 1.5 KB', async () => {
    const chain = [
      '/',
      '--session',
      ADA,
      ...steps('fill New note=Milk', 'press Enter', 'click Pin in "Milk"', 'click Delete in "Buy milk"'),
      ...steps('goto /', 'click Sign out'),
    ]
    const { code, stdout } = await human(chain, example('notes'))
    expect(code).toBe(0)
    expect(stdout.length).toBeLessThanOrEqual(1536)
    expect(stdout.trimEnd().split('\n')).toHaveLength(10)
    expect(stdout).toContain('  2 press Enter: + Notes: 3 · + Milk · + Pin · + Delete · − Notes: 2\n')
    expect(stdout).toContain('  3 click Pin in "Milk": + pinned · + Unpin · − Pin\n')
    expect(stdout).toContain('  6 click Sign out: → /login: ')
    const { out } = await browse(chain, example('notes'))
    expect(out.modes).toEqual(['on', 'off'])
    expect(
      out.steps.map((s: { modes: { requested: boolean }[] }) => s.modes.map((m) => m.requested)),
    ).toEqual([
      [false, false],
      [true, true],
      [true, true],
      [true, true],
      [true, true],
      [true, true],
    ])
  }, 60_000)

  it('checks form= checkboxes and submits with the clicked button, with and without JS', async () => {
    const { code, out } = await browse(
      [
        '/',
        '--session',
        ADA,
        ...steps(
          'check Select Buy milk',
          'check Select Call Bob',
          'uncheck Select Call Bob',
          'click Pin selected',
        ),
        ...steps('check Select Call Bob', 'click Delete selected'),
      ],
      example('notes'),
    )
    expect(code).toBe(0)
    const [pin, remove] = [out.steps[3], out.steps[5]]
    for (const m of pin.modes)
      expect([m.added, m.removed]).toEqual([
        expect.arrayContaining(['pinned', 'Unpin']),
        expect.arrayContaining(['Pin']),
      ])
    for (const m of remove.modes) expect(m.removed).toEqual(expect.arrayContaining(['Call Bob']))
    expect(out.actors.map((a: { text: string }) => a.text.includes('Call Bob'))).toEqual([false, false])
  }, 60_000)

  it('reports a difference only when both modes made a request and the resulting text differs', async () => {
    const copy = copyOf('notes', 'features/notes/views.ts', (s) =>
      s.replace("ui.send(Add, { text: ui.dom.form('text') })", 'ui.send(Add, { text: ctx.draft })'),
    )
    const { code, out } = await browse(
      ['/', '--session', ADA, ...steps('fill New note=Milk', 'press Enter', 'click Pin in "Call Bob"')],
      copy,
    )
    expect(code).toBe(1)
    expect(out.steps.map((s: { differs?: boolean }) => s.differs ?? false)).toEqual([false, true, false])
    const [on, off] = out.steps[1].modes
    expect(on.added).toContain('Milk')
    expect(off.added).toContain('Write something')
  }, 60_000)

  it('runs simultaneous actors in one world, each in its own browser, with live updates on the others', async () => {
    const { code, out } = await browse(
      [
        '/',
        '--js',
        'on',
        '--as',
        'ada',
        '--as',
        'bob',
        '--as',
        'ada',
        ...steps('click Save in "Hello, Hozu"'),
        '--as',
        'bob',
        ...steps('click Save in "Islands, derived"'),
      ],
      example('blog'),
    )
    expect(code).toBe(0)
    expect(out.steps.map((s: { actor: string; step: string }) => `${s.actor}: ${s.step}`)).toEqual([
      'bob: open /',
      'ada: click Save in "Hello, Hozu"',
      'bob: click Save in "Islands, derived"',
    ])
    expect(out.steps[1].elsewhere).toEqual([
      { actor: 'bob', mode: 'on', added: ['1 post saved'], removed: ['Nothing saved yet'] },
    ])
    expect(out.steps[2].elsewhere).toEqual([
      { actor: 'ada', mode: 'on', added: ['2 posts saved'], removed: ['1 post saved'] },
    ])
    expect(
      out.actors.map((a: { name: string; text: string }) => [a.name, a.text.endsWith('2 posts saved')]),
    ).toEqual([
      ['ada', true],
      ['bob', true],
    ])
  }, 60_000)

  it('remembers a value per mode, substitutes $name, and sends --header on every request (ADR 0056 C)', async () => {
    const { code, out } = await browse(
      [
        '/login',
        '--header',
        'X-Hozu-Test: 1',
        ...steps(
          'remember back from url',
          'remember heading from h1',
          'goto /',
          'goto $back',
          'goto $nothing',
        ),
      ],
      example('notes'),
    )
    expect(code).toBe(1)
    for (const m of out.steps[0].modes) expect(m.note).toBe('back = /login')
    for (const m of out.steps[3].modes) expect(m.url).toBe('/login')
    for (const m of out.steps[4].modes) expect(m.note).toBe('$nothing was not remembered before this step')
  }, 60_000)

  it("a page that answers 403 is the step's status, not an error, so an access check exits 0 (0.15 dogfood)", async () => {
    const { code, out } = await browse(
      ['/', '--session', '{"user":"bob"}', '--do', 'goto /admin'],
      example('notes'),
    )
    expect(out.actors.flatMap((a: { errors: unknown[] }) => a.errors)).toEqual([])
    for (const m of out.steps[0].modes) expect([m.url, m.status]).toEqual(['/admin', 403])
    expect(code).toBe(0)
  }, 60_000)

  it('a 404 inside an iframe is a failed request, not the page answering (0.16 review)', async () => {
    const copy = copyOf('notes', 'features/notes/views.ts', (s) =>
      s.replace(
        "ui.h1({ class: 'text-3xl font-bold' }, ['Notes']),",
        "ui.h1({ class: 'text-3xl font-bold' }, ['Notes']),\n      ui.iframe({ src: '/nowhere', title: 'Frame' }, []),",
      ),
    )
    const { code, out } = await browse(['/login', '--js', 'on', '--session', ADA, '--do', 'goto /'], copy)
    expect(out.errors).toContainEqual(
      expect.objectContaining({ kind: 'request', text: '404 /nowhere', type: 'Document' }),
    )
    expect(code).toBe(1)
  }, 60_000)

  it('prints js-only in the off column for a step with no native effect', async () => {
    const { stdout } = await human(['/', ...steps('click Save in "Hello, Hozu"')], example('blog'))
    expect(stdout).toContain(
      '  1 click Save in "Hello, Hozu"\n      on: + 1 post saved · − Nothing saved yet\n      off: js-only (a type=button button)\n',
    )
  }, 60_000)

  it('keeps speculative loads in the in-process handler and reports CSP violations', async () => {
    const links = await browse(
      ['/', '--session', ADA, ...steps('click Deutsch', 'click English')],
      example('notes'),
    )
    expect([links.code, links.out.errors]).toEqual([0, []])
    const copy = copyOf('notes', 'features/notes/views.ts', (s) =>
      s.replace(
        "ui.h1({ class: 'text-3xl font-bold' }, ['Notes']),",
        "ui.h1({ class: 'text-3xl font-bold' }, ['Notes']),\n      ui.img({ src: 'https://example.com/x.png', alt: '', width: 1, height: 1 }),",
      ),
    )
    const csp = await browse(['/', '--js', 'on', '--session', ADA], copy)
    expect(csp.out.errors).toEqual([
      expect.objectContaining({ kind: 'console', type: 'security', url: '/', mode: 'on' }),
    ])
    expect(csp.out.errors[0].text).toContain('violates the following Content Security Policy directive')
  }, 60_000)

  it('opens at the --viewport size and points a screenshot step at --screenshot (ADR 0060 E)', async () => {
    const shot = `${root}.tmp/browse-phone-${Date.now()}.png`
    copies.push(shot)
    const phone = await browse(['/', '--js', 'on', '--viewport', '390x844', '--screenshot', shot])
    expect(phone.code).toBe(0)
    const png = readFileSync(shot)
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([390, 844])
    const step = await browse(['/', '--js', 'on', '--do', 'screenshot phone.png'])
    expect(step.code).not.toBe(0)
    expect(JSON.stringify(step.out)).toContain('add --screenshot <file>')
    let text = ''
    expect(
      await main(['browse', '/', '--viewport', 'phone'], example('stations'), (s) => (text += s)),
    ).not.toBe(0)
  }, 60_000)

  it('says what each step did to the document, and holds an effect to show its pending state (ADR 0063 C3)', async () => {
    const notes = example('notes')
    const held = await browse(
      [
        '/',
        '--js',
        'on',
        '--session',
        ADA,
        '--do',
        'hold notes.addNote',
        '--do',
        'fill New note=Held note; press Enter',
        '--do',
        'release',
        '--do',
        'goto /',
      ],
      notes,
    )
    expect(held.code).toBe(0)
    const [hold, fill, press, release, again] = held.out.steps
    expect(hold.modes[0].note).toContain('holding notes.addNote')
    expect(fill.modes[0].document).toBe('in place')
    expect(press.modes[0].added.join(' ')).toContain('Adding Held note…')
    expect(release.modes[0].note).toBe('released 1 held answer')
    expect(release.modes[0].added.join(' ')).toContain('Held note')
    expect(again.modes[0].document).toBe('navigated')
    const browserRun = await browse(
      ['/', '--js', 'on', '--do', 'hold watchlist.addSymbol; fill Symbol=AAPL; press Enter; release'],
      example('watchlist'),
    )
    const [, , pressed, released] = browserRun.out.steps
    expect(pressed.modes[0].added).not.toContain('AAPL')
    expect(released.modes[0].note).toBe('released 1 held answer')
    expect(released.modes[0].added).toContain('AAPL')
    const afterGoto = await browse(
      ['/', '--js', 'on', '--do', 'hold watchlist.addSymbol; goto /; fill Symbol=MSFT; press Enter; release'],
      example('watchlist'),
    )
    expect(afterGoto.out.steps[3].modes[0].added).not.toContain('MSFT')
    expect(afterGoto.out.steps[4].modes[0].note).toBe('released 1 held answer')
    const unknown = await browse(['/', '--js', 'on', '--do', 'hold watchlist.quotes'], example('watchlist'))
    expect(unknown.out.steps[0].modes[0].note).toBe('hold: watchlist.quotes is not a mutation of this app')
    const off = await browse(
      ['/', '--js', 'off', '--session', ADA, '--do', 'fill New note=Posted; press Enter'],
      notes,
    )
    expect(off.out.steps[1].modes[0].document).toBe('reloaded')
    const full = await human(
      ['/', '--js', 'on', '--session', ADA, '--full', '--do', 'click Pin in "Buy milk"'],
      notes,
    )
    expect(full.stdout).toMatch(/click Pin in "Buy milk": \d+ elements? replaced/)
  }, 60_000)

  it('clicks a button by its accessible name, without the glyph it hides (ADR 0063 E1)', async () => {
    const copy = copyOf('stations', 'features/stations/views.ts', (s) =>
      s.replace(
        "ui.h1({ class: 'text-3xl font-bold' }, ['City bikes']),",
        "ui.h1({ class: 'text-3xl font-bold' }, ['City bikes']),\n      ui.button({ type: 'button' }, [ui.span({ 'aria-hidden': 'true' }, ['❚❚']), ' Pause']),",
      ),
    )
    const { code, out } = await browse(['/', '--js', 'on', '--do', 'click Pause'], copy)
    expect([code, out.steps[0].modes[0].ok]).toEqual([0, true])
  }, 60_000)

  it('matches a name without its symbols when nothing matches exactly (ADR 0065 C)', async () => {
    const copy = copyOf('stations', 'features/stations/views.ts', (s) =>
      s.replace(
        "ui.h1({ class: 'text-3xl font-bold' }, ['City bikes']),",
        "ui.h1({ class: 'text-3xl font-bold' }, ['City bikes']),\n      ui.button({ type: 'button' }, ['❚❚ 暫停']),\n      ui.button({ type: 'button' }, ['▶️ 播放']),",
      ),
    )
    const { code, out } = await browse(['/', '--js', 'on', '--do', 'click 暫停; click 播放'], copy)
    expect([code, out.steps[0].modes[0].ok, out.steps[1].modes[0].ok]).toEqual([0, true, true])
  }, 60_000)

  it('runs the steps with JS by default (ADR 0064 B)', async () => {
    let stdout = ''
    const code = await main(
      ['browse', '/', '--do', 'fill Symbol=AAPL', '--json'],
      example('watchlist'),
      (t) => {
        stdout += t
      },
    )
    expect(code).toBe(0)
    expect(JSON.parse(stdout).steps[0].modes.map((m: { mode: string }) => m.mode)).toEqual(['on'])
  }, 60_000)

  it('reports a flash and a layout shift no input explains, and nothing for a calm step (ADR 0067 C2)', async () => {
    const watchlist = example('watchlist')
    const { code, out } = await browse(
      [
        '/',
        '--js',
        'on',
        '--do',
        'fill Symbol=AAPL; press Enter; click Pause; fill Symbol=MSFT; press Enter; hold watchlist.addSymbol; fill Symbol=AAPL; press Enter; wait 700; release; click Refresh now',
      ],
      watchlist,
    )
    expect(code).toBe(0)
    const modes = out.steps.map((s: { modes: Record<string, unknown>[] }) => s.modes[0])
    expect(modes[1].flashes).toBeUndefined()
    expect(modes[4].flashes.count).toBe(1)
    expect(modes[4].flashes.elements).toHaveLength(1)
    expect(modes[9].shift).toBeGreaterThan(0)
    expect([modes[10].flashes, modes[10].shift]).toEqual([undefined, undefined])
    const text = await human(
      [
        '/',
        '--js',
        'on',
        '--do',
        'fill Symbol=AAPL; press Enter; click Pause; fill Symbol=MSFT; press Enter',
      ],
      watchlist,
    )
    expect(text.stdout).toContain(`1 element rebuilt unchanged (a flash: ${modes[4].flashes.elements[0]})`)
  }, 60_000)

  it('replace writes the address in place, so a reload keeps the search (ADR 0067 G)', async () => {
    const { code, out } = await browse(
      ['/', '--js', 'on', '--do', 'fill Search=park', '--do', 'goto /?q=park'],
      example('stations'),
    )
    expect(code).toBe(0)
    const [typed, reloaded] = out.steps.map((s: { modes: Record<string, unknown>[] }) => s.modes[0])
    expect([typed.url, typed.document]).toEqual(['/?q=park', 'in place'])
    expect(typed.removed).toContain('Central Station')
    expect(reloaded.added).not.toContain('Central Station')
  }, 60_000)

  it('a machine the next page shows too keeps its state across the page change (ADR 0067 C4)', async () => {
    const { code, out } = await browse(
      ['/', '--js', 'on', '--do', 'click Pause; goto /'],
      example('watchlist'),
    )
    expect(code).toBe(0)
    expect(out.text).toContain('Resume')
    expect(out.text).not.toContain('Pause')
  }, 60_000)

  it('Pause, Resume and Refresh now through refresh on a transition (ADR 0064 A)', async () => {
    const { code, out } = await browse(
      [
        '/',
        '--js',
        'on',
        '--do',
        'fill Symbol=AAPL; press Enter; click Pause; click Refresh now; click Resume',
      ],
      example('watchlist'),
    )
    expect(code).toBe(0)
    const [, added, paused, refreshed, resumed] = out.steps
    expect(added.modes[0].added).toContain('AAPL')
    expect(paused.modes[0].added).toContain('Resume')
    expect(refreshed.modes[0].added.some((l: string) => l.startsWith('$'))).toBe(true)
    expect(resumed.modes[0].added).toContain('Pause')
    expect(resumed.modes[0].added.some((l: string) => l.startsWith('$'))).toBe(true)
    expect(out.errors).toEqual([])
  }, 60_000)

  it('reads a { poll } query again on its timer, also when the browser fetched it (ADR 0063 C1)', async () => {
    const copy = copyOf('watchlist', 'features/watchlist/model.ts', (s) =>
      s.replace(
        "freshness: 'request',\n  tags: () => [quotesTag()]",
        'freshness: { poll: 5 },\n  tags: () => [quotesTag()]',
      ),
    )
    const { code, out } = await browse(
      ['/', '--js', 'on', '--do', 'fill Symbol=AAPL; press Enter', '--do', 'wait 6000'],
      copy,
    )
    expect(code).toBe(0)
    const waited = out.steps[2].modes[0]
    expect(waited.added.some((l: string) => l.startsWith('$'))).toBe(true)
    expect(waited.removed.some((l: string) => l.startsWith('$'))).toBe(true)
  }, 60_000)
})
