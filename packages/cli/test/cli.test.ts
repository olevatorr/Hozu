import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { Ajv } from 'ajv'
import { describe, expect, it, vi } from 'vitest'
import { withHints } from '../src/commands/check.ts'
import { shortForm } from '../src/commands/docs.ts'
import { main } from '../src/main.ts'
import { human } from '../src/output.ts'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const cart = `${root}examples/cart`
const bin = `${root}packages/cli/bin/hozu.js`
const schema = (name: string) =>
  JSON.parse(readFileSync(`${root}packages/cli/schema/${name}.schema.json`, 'utf8'))
const ajv = new Ajv({ allErrors: true, strict: false })

async function run(args: string[], cwd = cart) {
  let stdout = ''
  const code = await main(args, cwd, (s) => {
    stdout += s
  })
  return { code, stdout }
}

const expectSchema = (name: string, value: unknown) => {
  const valid = ajv.validate(schema(name), value)
  expect(ajv.errors ?? []).toEqual([])
  expect(valid).toBe(true)
}

describe('hozu skill', () => {
  it('asks where to write the skill, then keeps rewriting the same place', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hozu-skill-'))
    const none = await run(['skill', '--json'], dir)
    expect(none.code).toBe(2)
    expect(JSON.parse(none.stdout).error.suggestions[0]).toContain('--agent claude')
    const first = await run(['skill', '--agent', 'agents', '--json'], dir)
    expect(first.code).toBe(0)
    expectSchema('skill', JSON.parse(first.stdout))
    expect(JSON.parse(first.stdout).written).toEqual(['.agents/skills/hozu', 'AGENTS.md'])
    expect(existsSync(join(dir, '.agents/skills/hozu/example/hozu.config.ts'))).toBe(true)
    const again = await run(['skill', '--json'], dir)
    expect(JSON.parse(again.stdout).written).toEqual(['.agents/skills/hozu'])
    writeFileSync(join(dir, 'AGENTS.md'), '# ours\n\nEvery behaviour change comes with a contract change.\n')
    const custom = await run(['skill'], dir)
    expect(custom.code).toBe(1)
    expect(custom.stdout).toContain('AGENTS.md has its own text and no hozu markers')
    expect(custom.stdout).toContain('<!-- /hozu -->')
  })
})

describe('A5 CLI contract', () => {
  it('check --no-types --json is clean for the cart and matches its schema; validate is gone', async () => {
    const { code, stdout } = await run(['check', '--no-types', '--json'])
    const out = JSON.parse(stdout)
    expect(code).toBe(0)
    expect(out.types).toEqual({ ok: true, skipped: true, errors: [] })
    expect(out.validate).toMatchObject({
      ok: true,
      summary: { errors: 0, warnings: 0, accepted: 0 },
      coverage: { cart: expect.objectContaining({ transitions: 15 }) },
      lock: 'current',
    })
    expect(out.validate.diagnostics).toEqual([])
    expectSchema('check', out)
    const gone = await run(['validate', '--json'])
    expect([gone.code, JSON.parse(gone.stdout).error.message]).toEqual([
      2,
      'hozu validate was replaced by hozu check (ADR 0053 B)',
    ])
  })

  it('inspect --json matches its schema and reports hydration', async () => {
    const cartOut = JSON.parse((await run(['inspect', 'cart', '--json'])).stdout)
    const catalogOut = JSON.parse((await run(['inspect', 'catalog', '--json'])).stdout)
    expectSchema('inspect', cartOut)
    expectSchema('inspect', catalogOut)
    expect(cartOut.summary).toMatchObject({ states: 6, events: 5, hydrates: true, imports: ['catalog'] })
    expect(catalogOut.summary).toMatchObject({ states: 0, hydrates: false })
    expect(cartOut.summary.effects.addItem).toEqual({
      kind: 'mutation',
      runs: 'server',
      implemented: 'resolver',
    })
  })

  it('<command> --help prints that command and its options (ADR 0056 A8)', async () => {
    const add = (await run(['add', 'feature', '--help'])).stdout
    expect(add.startsWith('Usage: hozu add feature [options]')).toBe(true)
    expect(add).toContain('--with <parts>')
    expect(add).not.toContain('--screenshot')
    const browse = (await run(['browse', '--help'])).stdout
    expect(browse).toContain('--do <step>')
    expect(browse).not.toContain('add feature')
  })

  it('plan takes a path as well as a route name (ADR 0056 A6)', async () => {
    const byPath = JSON.parse((await run(['plan', '/products/mug', '--json'])).stdout)
    const byName = JSON.parse((await run(['plan', 'product', '--json'])).stdout)
    expect(byPath).toEqual(byName)
    const none = await run(['plan', '/nowhere', '--json'])
    expect([none.code, JSON.parse(none.stdout).error.message]).toEqual([
      2,
      'No page renders the path "/nowhere"',
    ])
  })

  it('why answers for a state, a declaration and a page, with file:line; graph is gone', async () => {
    const state = JSON.parse((await run(['why', 'cart.adding', '--json'])).stdout)
    expectSchema('why', state)
    expect(state).toMatchObject({ kind: 'state', at: expect.stringMatching(/^features\/cart\/.+\.ts:\d+$/) })
    expect(state.state.outgoing).toContainEqual(
      expect.objectContaining({ trigger: 'failed.OutOfStock', to: 'error' }),
    )
    const decl = JSON.parse((await run(['why', 'cart.addItem', '--json'])).stdout)
    expectSchema('why', decl)
    expect(decl).toMatchObject({ kind: 'declaration', impact: { kind: 'mutation' } })
    expect(decl.at).toMatch(/^features\/cart\/.+\.ts:\d+$/)
    const page = JSON.parse((await run(['why', 'page:home', '--json'])).stdout)
    expect(page).toMatchObject({ kind: 'page', node: { id: 'page:home' } })
    const text = (await run(['why', 'cart.addItem'])).stdout
    expect(text.split('\n')[0]).toMatch(/^cart\.addItem {2}declaration {2}at features\/cart\//)
    const gone = await run(['graph', 'cart', '--json'])
    expect([gone.code, JSON.parse(gone.stdout).error.message]).toEqual([
      2,
      'hozu graph was removed in 0.14 (ADR 0053 F)',
    ])
  })

  it('impact, explain and locate are removed in 0.15 and point at hozu why', async () => {
    for (const command of ['impact', 'explain', 'locate']) {
      const r = await run([command, 'cart.idle', '--json'])
      expect([r.code, JSON.parse(r.stdout).error]).toEqual([
        2,
        {
          code: 'usage',
          message: `hozu ${command} was removed in 0.15: hozu why answers it (ADR 0053 F)`,
          suggestions: ['hozu why cart.idle'],
        },
      ])
    }
  })

  it('why on a state lists its transitions with covering contracts', async () => {
    const { code, stdout } = await run(['why', 'cart.idle', '--json'])
    expect(code).toBe(0)
    expectSchema('why', JSON.parse(stdout))
    const out = JSON.parse(stdout).state
    expect(out).toMatchObject({ feature: 'cart', state: 'idle', initial: true, final: false, invoke: null })
    expect(out.outgoing[0]).toEqual({
      id: 'idle/on/cart.AddItem/0',
      from: 'idle',
      to: 'adding',
      trigger: 'on AddItem',
      guard: 'event.qty <= 10',
      assign: ['context.pending = event'],
      navigate: null,
      coveredBy: ['addFailsUnexpectedly', 'addsItem', 'rejectsOutOfStock'],
    })
    expect(out.sends.map((s: { event: string }) => s.event)).toEqual([
      'cart.RemoveItem',
      'cart.SetQuantity',
      'cart.AddItem',
      'cart.Checkout',
    ])
    const text = (await run(['why', 'cart.adding'])).stdout
    expect(text).toContain(
      'invoke: cart.addItem(context.pending)  runs: server  errors: OutOfStock, Unexpected',
    )
  })

  it('why suggests the closest state', async () => {
    const { code, stdout } = await run(['why', 'cart.idel', '--json'])
    expect(code).toBe(2)
    expect(JSON.parse(stdout).error.suggestions).toEqual(['cart.idle'])
  })

  it('why on a declaration says what it invalidates and who uses it', async () => {
    const { code, stdout } = await run(['why', 'cart.addItem', '--json'])
    expect(code).toBe(0)
    expectSchema('why', JSON.parse(stdout))
    const out = JSON.parse(stdout).impact
    expect(out).toMatchObject({
      target: 'cart.addItem',
      kind: 'mutation',
      tags: ['cart.cartTag'],
      queries: [{ ref: 'cart.getCart', tag: 'cart.cartTag', precision: 'exact' }],
      features: ['cart'],
      runs: 'server',
    })
    expect(out.uses.map((u: { via: string }) => u.via)).toEqual([
      '"adding" invokes cart.addItem',
      'cart.CartPanel/1 reads cart.getCart',
    ])
    const text = (await run(['why', 'cart.getCart'])).stdout
    expect(text).toContain("cart.getCart  (query, runs: server, access: 'signedIn')")
    expect(text).toContain('invalidated by: cart.addItem, cart.checkout, cart.removeItem')
    const unknown = await run(['why', 'cart.addItm', '--json'])
    expect(unknown.code).toBe(2)
    expect(JSON.parse(unknown.stdout).error.suggestions).toEqual(['cart.addItem'])
  })

  it('plan --json matches its schema; machine-less pages ship no JS', async () => {
    const home = JSON.parse((await run(['plan', 'home', '--json'])).stdout)
    expectSchema('plan', home)
    expect(home).toMatchObject({ route: 'home', path: '/', js: 'always', cacheable: false })
    const placed = JSON.parse((await run(['plan', 'orderPlaced', '--json'])).stdout)
    expect(placed).toMatchObject({ js: false, islands: [], cacheable: true, assert: 'cacheable' })
    expect((await run(['plan', 'orderPlacd', '--json'])).stdout).toContain(
      '"suggestions": [\n      "orderPlaced"',
    )
  })

  it('unknown features fail with suggestions', async () => {
    const { code, stdout } = await run(['inspect', 'crt', '--json'])
    expect(code).toBe(2)
    expect(JSON.parse(stdout)).toEqual({
      error: { code: 'unknown-feature', message: 'Unknown feature "crt"', suggestions: ['cart'] },
    })
  })

  it('reports HZ011 when a recorder is nondeterministic', async () => {
    const { code, stdout } = await run([
      'check',
      '--no-types',
      '--json',
      '--config',
      `${root}packages/cli/test/fixtures/nondeterministic.config.ts`,
    ])
    const checked = JSON.parse(stdout)
    expect(code).toBe(1)
    expectSchema('check', checked)
    const out = checked.validate
    expect(out.lock).toBe('stale')
    expect(out.diagnostics.map((d: { code: string }) => d.code).sort()).toEqual(['HZ011', 'HZ045', 'HZ057'])
    expect(out.diagnostics.find((d: { code: string }) => d.code === 'HZ011')).toMatchObject({
      code: 'HZ011',
      location: {
        feature: 'dice',
        pointer: '/features/dice/machine/states/idle/on/dice.Roll/0/guard/right/literal',
      },
    })
  })
})

describe('the CSS stage (ADR 0045 E)', () => {
  it('reads the render classes from the bindings, so HZ073 and HZ075 see inside a component', async () => {
    const { code, stdout } = await run([
      'check',
      '--no-types',
      '--json',
      '--config',
      `${root}packages/cli/test/fixtures/styles.config.ts`,
    ])
    const out = JSON.parse(stdout).validate
    expect(code).toBe(1)
    expect(out.styles).toBe('checked')
    expect(
      out.diagnostics.map((d: { code: string; location: { pointer: string } }) => [
        d.code,
        d.location.pointer,
      ]),
    ).toEqual([
      ['HZ073', '/features/look/components/Card'],
      ['HZ075', '/features/look/views/Home/root/children/0/class'],
      ['HZ045', '/app'],
    ])
  })
})

describe('built binary', () => {
  it('maps diagnostics to exact source lines and exits 1', async () => {
    const exec = promisify(execFile)
    const fixture = `${root}packages/cli/test/fixtures/nondeterministic.config.ts`
    const result = await exec('node', [bin, 'check', '--no-types', '--config', fixture], { cwd: root }).catch(
      (e) => e,
    )
    expect(result.code).toBe(1)
    expect(result.stdout).toContain(
      'packages/cli/test/fixtures/nondeterministic.config.ts:14:9  error  HZ011',
    )
  })
})

describe('ADR 0043 G output', () => {
  it('translates the TS error for ui.link(route, params, null) and {}, and nothing else', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hozu-hint-'))
    writeFileSync(
      join(dir, 'views.ts'),
      [
        'ui.link(home, null, null)',
        'ui.link(home, null, {})',
        'save(null)',
        'ui.link(item, { id: f(x) }, null)',
      ].join('\n'),
    )
    const issue = (line: number, column: number) => ({
      file: 'views.ts',
      line,
      column,
      code: 'TS2345',
      message: 'm',
    })
    const hinted = withHints([issue(1, 21), issue(2, 21), issue(3, 6), issue(4, 29)], dir)
    expect(hinted.map((e) => e.message.includes('omit the third argument of ui.link'))).toEqual([
      true,
      true,
      false,
      true,
    ])
  })

  it('prints at most ten entries of a long cause; --json keeps all of them', () => {
    const cause = ['why', ...Array.from({ length: 14 }, (_, i) => `new entry ${i}`)].join('\n')
    const text = human({
      code: 'HZ057',
      severity: 'error',
      message: 'm',
      location: { feature: 'f', pointer: '/features/f/machine', source: null },
      cause,
      fix: null,
    })
    expect(text).toContain('new entry 9')
    expect(text).not.toContain('new entry 10')
    expect(text).toContain('… 4 more (--json lists all)')
  })
})

describe('hozu call (ADR 0050 F)', () => {
  const notes = `${root}examples/notes`
  const ada = ['--session', '{"user":"ada"}']

  it('runs a query as a session user through the app handler, and answers Forbidden without one', async () => {
    const read = await run(['call', 'notes.listNotes', ...ada, '--json'], notes)
    const out = JSON.parse(read.stdout)
    expectSchema('call', out)
    expect(read.code).toBe(0)
    expect(out).toMatchObject({ effect: 'notes.listNotes', kind: 'query', runs: 'server', invalidated: [] })
    expect(out.result.value.map((n: { text: string }) => n.text)).toContain('Buy milk')
    const anonymous = JSON.parse((await run(['call', 'notes.listNotes', '--json'], notes)).stdout)
    expect(anonymous.result).toEqual({ ok: false, error: 'Forbidden', data: { message: 'Forbidden' } })
  })

  it('needs --write for a mutation, then lists what it invalidated and refreshes', async () => {
    const refused = await run(
      ['call', 'notes.addNote', '--input', '{"text":"Eggs"}', ...ada, '--json'],
      notes,
    )
    expect([refused.code, JSON.parse(refused.stdout).error.message]).toEqual([
      2,
      'notes.addNote is a mutation: it writes real data, so hozu call needs --write',
    ])
    const written = await run(
      ['call', 'notes.addNote', '--input', '{"text":"Eggs"}', ...ada, '--write'],
      notes,
    )
    expect(written.code).toBe(0)
    expect(written.stdout).toContain('notes.addNote  (mutation, runs: server)')
    expect(written.stdout).toContain('invalidated: notes.notesTag\nrefreshes: notes.listNotes')
    const invalid = await run(
      ['call', 'notes.addNote', '--input', '{"text":""}', ...ada, '--write', '--json'],
      notes,
    )
    expect([invalid.code, JSON.parse(invalid.stdout).result.error]).toEqual([1, 'Invalid'])
  })

  it('refuses a browser-run effect, an unknown one and bad JSON', async () => {
    const browser = await run(['call', 'stars.starred', '--json'], `${root}examples/stars`)
    expect(JSON.parse(browser.stdout).error.message).toBe(
      "stars.starred runs in the browser (runs: 'browser'); the server never runs it",
    )
    expect(JSON.parse((await run(['call', 'notes.nope', '--json'], notes)).stdout).error.message).toBe(
      'Unknown query or mutation notes.nope',
    )
    expect(
      JSON.parse((await run(['call', 'notes.listNotes', '--input', '{', '--json'], notes)).stdout).error
        .message,
    ).toBe('--input must be JSON')
  })
})

describe('env files and hozu env (ADR 0052)', () => {
  it('reads the listed files: a later one wins, the shell wins over both', async () => {
    const { loadEnvFiles } = await import('../src/load.ts')
    const dir = mkdtempSync(join(tmpdir(), 'hozu-env-files-'))
    writeFileSync(join(dir, '.env'), 'HZ_TEST_A=env\nHZ_TEST_B=env\nHZ_TEST_C=env\n')
    writeFileSync(join(dir, '.env.local'), 'HZ_TEST_B=local\nHZ_TEST_C=local\n')
    process.env.HZ_TEST_C = 'shell'
    try {
      expect(loadEnvFiles(dir, ['.env', '.env.local', '.env.missing'])).toEqual(['.env', '.env.local'])
      expect([process.env.HZ_TEST_A, process.env.HZ_TEST_B, process.env.HZ_TEST_C]).toEqual([
        'env',
        'local',
        'shell',
      ])
    } finally {
      for (const k of ['HZ_TEST_A', 'HZ_TEST_B', 'HZ_TEST_C']) delete process.env[k]
    }
  })

  it('lists the playground variables with their side and internal mapping', async () => {
    const { code, stdout } = await run(['env', '--json'], `${root}examples/playground`)
    const out = JSON.parse(stdout)
    expect(code).toBe(0)
    expectSchema('env', out)
    expect(out.files).toEqual(['.env', '.env.local'])
    expect(
      out.variables.map((v: { name: string; side: string; internal: string | null }) => [
        v.name,
        v.side,
        v.internal,
      ]),
    ).toEqual([
      ['USERS_API', 'server', null],
      ['POSTS_API_INTERNAL', 'server', 'POSTS_API'],
      ['POSTS_API', 'public', 'POSTS_API_INTERNAL'],
    ])
    expect(out.reserved.map((r: { name: string }) => r.name)).toContain('SESSION_SECRET')
  })
})

describe('required server env (trial 0.13, bug 1)', () => {
  it('check and get read a required server variable from the env files; check does not need it', async () => {
    const { cpSync, rmSync, symlinkSync } = await import('node:fs')
    const dir = join(root, '.tmp', `env-required-${Date.now()}`)
    cpSync(`${root}examples/playground`, dir, {
      recursive: true,
      filter: (from) => !/\/(node_modules|\.hozu)(\/|$)/.test(from) && !from.endsWith('.env.local'),
    })
    symlinkSync(`${root}examples/playground/node_modules`, join(dir, 'node_modules'))
    const config = join(dir, 'hozu.config.ts')
    writeFileSync(
      config,
      readFileSync(config, 'utf8').replace(
        "USERS_API: z.string().default('https://jsonplaceholder.typicode.com')",
        'USERS_API: z.string()',
      ),
    )
    try {
      writeFileSync(join(dir, '.env.local'), 'USERS_API=https://jsonplaceholder.typicode.com\n')
      const set = JSON.parse((await run(['check', '--json'], dir)).stdout)
      expect(set.validate.summary.errors).toBe(0)
      rmSync(join(dir, '.env.local'))
      delete process.env.USERS_API
      const unset = JSON.parse((await run(['check', '--json'], dir)).stdout)
      expect(unset.validate.summary.errors).toBe(0)
      const page = await run(['get', '/', '--json'], dir)
      expect(JSON.parse(page.stdout).error.message).toContain('USERS_API')
    } finally {
      delete process.env.USERS_API
      rmSync(dir, { recursive: true, force: true })
    }
  }, 120_000)
})

describe('short topics (ADR 0053 E)', () => {
  const dir = `${root}.claude/skills/hozu/topics`
  const topics = readdirSync(dir).filter((f) => f.endsWith('.md'))

  it('prints at most half of 0.13’s 72.7 KB by default, and every topic has a short form', () => {
    let shown = 0
    for (const f of topics) {
      const text = readFileSync(join(dir, f), 'utf8')
      expect(text, f).toContain('\n<!-- more -->\n')
      shown += Buffer.byteLength(shortForm(text, f.slice(0, -3), false))
    }
    expect(shown).toBeLessThanOrEqual(36_350)
  })

  it('the views topic agrees with HZ014: only a ?: / && branch may be a list (ADR 0056 A4)', () => {
    const views = readFileSync(join(dir, 'views.md'), 'utf8')
    expect(views).toContain('A query branch or an each item returns one node')
    expect(views).not.toMatch(/also as what a query branch or an each item returns/)
  })

  it('--more prints the whole topic without the marker', async () => {
    const short = (await run(['docs', 'data'])).stdout
    const more = (await run(['docs', 'data', '--more'])).stdout
    expect(short).toContain('More (options, edge cases): hozu docs data --more\n')
    expect(more).not.toContain('<!-- more -->')
    expect(more).not.toContain('hozu docs data --more')
    expect(more.length).toBeGreaterThan(short.length)
    expect(more.startsWith(short.slice(0, short.indexOf('\nMore (')))).toBe(true)
  })
})

describe('hozu docs with an older skill copy (trial 0.13)', () => {
  it('prints the installed guide and says the local copy is older', async () => {
    const { mkdirSync, rmSync } = await import('node:fs')
    const dir = mkdtempSync(join(tmpdir(), 'hozu-docs-stale-'))
    mkdirSync(join(dir, '.claude/skills/hozu/topics'), { recursive: true })
    writeFileSync(join(dir, '.claude/skills/hozu/topics/env.md'), '# Environment\n\nAn older text.\n')
    try {
      const { stdout } = await run(['docs', 'env'], dir)
      expect(stdout).toContain('internal')
      expect(stdout).not.toContain('An older text.')
      expect(stdout).toContain(
        'The skill copy in .claude/skills/hozu is older than this Hozu; run npx hozu skill',
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('HZ086: env files git would commit (ADR 0052)', () => {
  it('warns about an env file git does not ignore, and not once it is ignored', async () => {
    const { cpSync, rmSync, symlinkSync } = await import('node:fs')
    const { execFileSync } = await import('node:child_process')
    const dir = join(root, '.tmp', `env-ignore-${Date.now()}`)
    cpSync(`${root}examples/playground`, dir, {
      recursive: true,
      filter: (from) => !/\/(node_modules|\.hozu)(\/|$)/.test(from),
    })
    symlinkSync(`${root}examples/playground/node_modules`, join(dir, 'node_modules'))
    execFileSync('git', ['init', '-q'], { cwd: dir })
    writeFileSync(join(dir, '.gitignore'), 'node_modules\n.hozu/\n')
    writeFileSync(join(dir, '.env.local'), 'POSTS_API_INTERNAL=http://127.0.0.1:9\n')
    const hz086 = async () =>
      JSON.parse((await run(['check', '--json'], dir)).stdout)
        .validate.diagnostics.filter((d: { code: string }) => d.code === 'HZ086')
        .map((d: { message: string }) => d.message)
    try {
      expect(await hz086()).toEqual(['.env.local is listed in env.files and git does not ignore it'])
      writeFileSync(join(dir, '.gitignore'), 'node_modules\n.hozu/\n.env\n.env.local\n')
      expect(await hz086()).toEqual([])
    } finally {
      delete process.env.POSTS_API_INTERNAL
      rmSync(dir, { recursive: true, force: true })
    }
  }, 120_000)
})

describe('diagnostics from the registry (ADR 0053 D)', () => {
  it('documents every code with a summary, a fix and an existing topic', async () => {
    const { codes } = await import('@hozu/core/ir')
    const { readdirSync } = await import('node:fs')
    const topics = readdirSync(`${root}.claude/skills/hozu/topics`).map((f) => f.replace(/\.md$/, ''))
    for (const [code, c] of Object.entries(codes)) {
      expect(c.summary.trim(), `${code} summary`).not.toBe('')
      expect(c.fix.trim(), `${code} fix`).not.toBe('')
      expect(topics, `${code} topic ${c.topic}`).toContain(c.topic)
    }
  })

  it('prints one code with hozu docs HZ0xx', async () => {
    const { code, stdout } = await run(['docs', 'hz083'])
    expect(code).toBe(0)
    expect(stdout).toContain('HZ083 undeclared-connect (warning)')
    expect(stdout).toContain('read: hozu docs fetch')
    expect(JSON.parse((await run(['docs', 'HZ999', '--json'])).stdout).error.message).toBe(
      'No diagnostic HZ999',
    )
  })
})

describe('accepted warnings (ADR 0053 C)', () => {
  it('keeps an accepted warning out of the count, and reports a stale entry as HZ087', async () => {
    const out = JSON.parse((await run(['check', '--json'], `${root}examples/playground`)).stdout)
    expect(out.validate.summary).toEqual({ errors: 0, warnings: 0, accepted: 1 })
    expect(out.validate.accepted[0]).toMatchObject({ code: 'HZ036', at: 'lab.SaveDraft' })
    const { applyAccepted } = await import('../src/commands/accept.ts')
    const stale = applyAccepted(
      { ...out.validate, accepted: [], diagnostics: [] },
      [{ code: 'HZ036', at: 'lab.Gone', reason: 'old' }],
      'hozu.config.ts',
    )
    expect(stale.diagnostics.map((d: { code: string; message: string }) => [d.code, d.message])).toEqual([
      ['HZ087', 'accept[0] (HZ036 at lab.Gone) matches no warning any more'],
    ])
  })

  it('refuses to accept an error or an entry without a reason (HZ087)', async () => {
    const { project } = await import('@hozu/core')
    const { buildProject } = await import('@hozu/core/ir')
    const { zodAdapter } = await import('@hozu/schema-zod')
    const b = buildProject(
      project({
        schema: zodAdapter,
        routes: {},
        pages: [],
        features: [],
        accept: [
          { code: 'HZ001', at: 'x.y', reason: 'no' },
          { code: 'HZ036', at: 'x.y', reason: ' ' },
        ],
      }),
      { sources: false },
    )
    expect(b.diagnostics.filter((d) => d.code === 'HZ087').map((d) => d.message)).toEqual([
      'accept[0] cannot be used: HZ001 is an error, and errors cannot be accepted',
      'accept[1] cannot be used: it gives no reason',
    ])
    expect(b.ir.accept).toEqual([])
  })
})

describe('browse parity (ADR 0056 A15)', () => {
  it('treats two URLs of one route as the same page, whatever their params', async () => {
    const { routeKey } = await import('../src/commands/browse.ts')
    const { routePattern } = await import('@hozu/core/ir')
    const key = routeKey(['/', '/households/:id'].map((p) => routePattern(p).pattern))
    expect(key('http://127.0.0.1:1/households/h1fa')).toBe(key('http://127.0.0.1:1/households/h1b7'))
    expect(key('http://127.0.0.1:1/households/h1fa')).not.toBe(key('http://127.0.0.1:1/'))
    expect(key('http://127.0.0.1:1/?a=1')).not.toBe(key('http://127.0.0.1:1/?a=2'))
  })
})

describe('browse --header (ADR 0056 C)', () => {
  it('a header before the first --as goes to every actor; one after it goes to that actor', async () => {
    const { parseArgs } = await import('node:util')
    const { browsePlan } = await import('../src/main.ts')
    const { headersOf } = await import('../src/commands/browse.ts')
    const plan = (args: string[]) =>
      browsePlan(
        parseArgs({
          args,
          options: { as: { type: 'string', multiple: true }, header: { type: 'string', multiple: true } },
          tokens: true,
          strict: false,
        }).tokens,
      ).actors.map((a) => [a.name, a.headers])
    expect(plan(['--header', 'X-A: 1'])).toEqual([[null, ['X-A: 1']]])
    expect(
      plan(['--header', 'X-A: 1', '--as', 'ada', '--header', 'Authorization: Bearer a', '--as', 'bob']),
    ).toEqual([
      ['ada', ['X-A: 1', 'Authorization: Bearer a']],
      ['bob', ['X-A: 1']],
    ])
    expect(headersOf(['Authorization: Bearer a:b'])).toEqual({ authorization: 'Bearer a:b' })
    expect(() => headersOf(['nope'])).toThrow('--header takes "Name: value"')
  })
})

describe('hozu call on an endpoint (ADR 0056 C)', () => {
  const app = `${root}packages/cli/test/fixtures/endpoints`

  it('sends the input as a query string and the headers as given', async () => {
    const out = JSON.parse(
      (
        await run(
          ['call', 'api.who', '--input', '{"room":"blue"}', '--header', 'Authorization: Bearer t1', '--json'],
          app,
        )
      ).stdout,
    )
    expect(out).toMatchObject({
      kind: 'endpoint',
      status: 200,
      result: { ok: true, value: { room: 'blue', token: 'Bearer t1' } },
    })
    const without = JSON.parse(
      (await run(['call', 'api.who', '--input', '{"room":"blue"}', '--json'], app)).stdout,
    )
    expect(without).toMatchObject({ status: 401, result: { ok: false, error: 'NoToken' } })
  })

  it('needs --write for a POST endpoint, and refuses a header without a colon', async () => {
    const refused = await run(['call', 'api.book', '--input', '{"room":"blue"}', '--json'], app)
    expect(JSON.parse(refused.stdout).error.message).toBe(
      'api.book is a POST endpoint: it writes real data, so hozu call needs --write',
    )
    const booked = JSON.parse(
      (await run(['call', 'api.book', '--input', '{"room":"blue"}', '--write', '--json'], app)).stdout,
    )
    expect(booked).toMatchObject({ status: 200, result: { ok: true, value: { booked: 'blue' } } })
    const bad = await run(['call', 'api.who', '--header', 'Bearer', '--json'], app)
    expect(JSON.parse(bad.stdout).error.message).toBe('--header takes "Name: value", not "Bearer"')
  })
})
