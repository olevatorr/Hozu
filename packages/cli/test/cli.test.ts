import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { Ajv } from 'ajv'
import { describe, expect, it } from 'vitest'
import { main } from '../src/main.ts'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const cart = `${root}examples/cart`
const bin = `${root}packages/cli/bin/tenon.js`
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

describe('A5 CLI contract', () => {
  it('validate --json is clean for the cart and matches its schema', async () => {
    const { code, stdout } = await run(['validate', '--json'])
    const out = JSON.parse(stdout)
    expect(code).toBe(0)
    expect(out).toMatchObject({
      ok: true,
      summary: { errors: 0, warnings: 0 },
      coverage: { cart: { covered: 15, total: 15 } },
      lock: 'checked',
      diagnostics: [],
    })
    expectSchema('validate', out)
  })

  it('inspect --json matches its schema and reports hydration', async () => {
    const cartOut = JSON.parse((await run(['inspect', 'cart', '--json'])).stdout)
    const catalogOut = JSON.parse((await run(['inspect', 'catalog', '--json'])).stdout)
    expectSchema('inspect', cartOut)
    expectSchema('inspect', catalogOut)
    expect(cartOut.summary).toMatchObject({ states: 6, events: 5, hydrates: true, imports: ['catalog'] })
    expect(catalogOut.summary).toMatchObject({ states: 0, hydrates: false })
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
    expect(text).toContain('invoke: cart.addItem(context.pending)  errors: OutOfStock, Unexpected')
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
    })
    expect(out.uses.map((u: { via: string }) => u.via)).toEqual([
      '"adding" invokes cart.addItem',
      'cart.CartPanel/1 reads cart.getCart',
    ])
    const text = (await run(['impact', 'cart.getCart'])).stdout
    expect(text).toContain('invalidated by: cart.addItem, cart.checkout, cart.removeItem')
    const unknown = await run(['impact', 'cart.addItm', '--json'])
    expect(unknown.code).toBe(2)
    expect(JSON.parse(unknown.stdout).error.suggestions).toEqual(['cart.addItem'])
  })

  it('plan --json matches its schema; machine-less pages ship no JS', async () => {
    const home = JSON.parse((await run(['plan', 'home', '--json'])).stdout)
    expectSchema('plan', home)
    expect(home).toMatchObject({ route: 'home', path: '/', js: true, cacheable: false })
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

  it('reports TN011 when a recorder is nondeterministic', async () => {
    const { code, stdout } = await run([
      'validate',
      '--json',
      '--config',
      `${root}packages/cli/test/fixtures/nondeterministic.config.ts`,
    ])
    const out = JSON.parse(stdout)
    expect(code).toBe(1)
    expectSchema('validate', out)
    expect(out.lock).toBe('missing')
    expect(out.diagnostics).toHaveLength(1)
    expect(out.diagnostics[0]).toMatchObject({
      code: 'TN011',
      location: {
        feature: 'dice',
        pointer: '/features/dice/machine/states/idle/on/dice.Roll/0/guard/right/literal',
      },
    })
  })
})

describe('built binary', () => {
  it('maps diagnostics to exact source lines and exits 1', async () => {
    const exec = promisify(execFile)
    const fixture = `${root}packages/cli/test/fixtures/nondeterministic.config.ts`
    const result = await exec('node', [bin, 'validate', '--config', fixture], { cwd: root }).catch((e) => e)
    expect(result.code).toBe(1)
    expect(result.stdout).toContain(
      'packages/cli/test/fixtures/nondeterministic.config.ts:14:9  error  TN011',
    )
  })
})
