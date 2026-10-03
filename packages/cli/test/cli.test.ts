import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { Ajv } from 'ajv'
import { describe, expect, it } from 'vitest'
import { withHints } from '../src/commands/check.ts'
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
  it('validate --json is clean for the cart and matches its schema', async () => {
    const { code, stdout } = await run(['validate', '--json'])
    const out = JSON.parse(stdout)
    expect(code).toBe(0)
    expect(out).toMatchObject({
      ok: true,
      summary: { errors: 0, warnings: 0 },
      coverage: { cart: expect.objectContaining({ transitions: 15 }) },
      lock: 'current',
    })
    expect(out.diagnostics).toEqual([])
    expectSchema('validate', out)
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

  it('graph --json matches its schema; text mode is Mermaid', async () => {
    const json = JSON.parse((await run(['graph', 'cart', '--json'])).stdout)
    expectSchema('graph', json)
    expect(json.edges).toContainEqual({
      from: 'state:adding',
      to: 'state:error',
      kind: 'failed',
      label: 'failed.OutOfStock',
    })
    const text = (await run(['graph', 'cart'])).stdout
    expect(text).toMatch(/^stateDiagram-v2\n {2}\[\*\] --> idle\n/)
    expect(text).toContain('placed --> [*]')
  })

  it('explain --json matches its schema and lists covering contracts', async () => {
    const { code, stdout } = await run(['explain', 'cart.idle', '--json'])
    const out = JSON.parse(stdout)
    expect(code).toBe(0)
    expectSchema('explain', out)
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
    const text = (await run(['explain', 'cart.adding'])).stdout
    expect(text).toContain(
      'invoke: cart.addItem(context.pending)  runs: server  errors: OutOfStock, Unexpected',
    )
  })

  it('explain suggests the closest state', async () => {
    const { code, stdout } = await run(['explain', 'cart.idel', '--json'])
    expect(code).toBe(2)
    expect(JSON.parse(stdout).error.suggestions).toEqual(['cart.idle'])
  })

  it('impact --json matches its schema', async () => {
    const { code, stdout } = await run(['impact', 'cart.addItem', '--json'])
    const out = JSON.parse(stdout)
    expect(code).toBe(0)
    expectSchema('impact', out)
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
    const text = (await run(['impact', 'cart.getCart'])).stdout
    expect(text).toContain('cart.getCart  (query, runs: server)')
    expect(text).toContain('invalidated by: cart.addItem, cart.checkout, cart.removeItem')
    const unknown = await run(['impact', 'cart.addItm', '--json'])
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
      'validate',
      '--json',
      '--config',
      `${root}packages/cli/test/fixtures/nondeterministic.config.ts`,
    ])
    const out = JSON.parse(stdout)
    expect(code).toBe(1)
    expectSchema('validate', out)
    expect(out.lock).toBe('stale')
    expect(out.diagnostics.map((d: { code: string }) => d.code).sort()).toEqual(['HZ011', 'HZ057'])
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
      'validate',
      '--json',
      '--config',
      `${root}packages/cli/test/fixtures/styles.config.ts`,
    ])
    const out = JSON.parse(stdout)
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
    ])
  })
})

describe('built binary', () => {
  it('maps diagnostics to exact source lines and exits 1', async () => {
    const exec = promisify(execFile)
    const fixture = `${root}packages/cli/test/fixtures/nondeterministic.config.ts`
    const result = await exec('node', [bin, 'validate', '--config', fixture], { cwd: root }).catch((e) => e)
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

  it('runs a query as a session user through the app handler, and reports a declared error without one', async () => {
    const read = await run(['call', 'notes.listNotes', ...ada, '--json'], notes)
    const out = JSON.parse(read.stdout)
    expectSchema('call', out)
    expect(read.code).toBe(0)
    expect(out).toMatchObject({ effect: 'notes.listNotes', kind: 'query', runs: 'server', invalidated: [] })
    expect(out.result.value.map((n: { text: string }) => n.text)).toContain('Buy milk')
    const anonymous = JSON.parse((await run(['call', 'notes.listNotes', '--json'], notes)).stdout)
    expect(anonymous.result).toEqual({ ok: false, error: 'Unauthorized', data: {} })
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
