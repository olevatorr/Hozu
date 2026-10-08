import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { feature, mutation, project, query } from '@hozu/core'
import { buildProject, remoteContract } from '@hozu/core/ir'
import { zodAdapter } from '@hozu/schema-zod'
import { Ajv } from 'ajv'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { goContract, goNotes } from '../src/gen/go.ts'
import { main } from '../src/main.ts'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const example = `${root}examples/notes-go`
const contract = 'service/hozu/contract.go'
const hasGo = spawnSync('go', ['version']).status === 0

async function run(args: string[], cwd: string) {
  let stdout = ''
  const code = await main(args, cwd, (s) => {
    stdout += s
  })
  return { code, stdout }
}

const copy = (edit?: (dir: string) => void) => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'hozu-remote-')))
  cpSync(example, dir, {
    recursive: true,
    filter: (src) => !/node_modules|\.hozu|tsconfig\.json/.test(src.slice(example.length)),
  })
  symlinkSync(`${example}/node_modules`, join(dir, 'node_modules'))
  edit?.(dir)
  return dir
}

const hz093 = async (dir: string) => {
  const { stdout } = await run(['check', '--no-types', '--json'], dir)
  const out = JSON.parse(stdout) as { validate?: { diagnostics: { code: string; message: string }[] } }
  expect(out.validate, JSON.stringify(out).slice(0, 600)).toBeDefined()
  return out.validate!.diagnostics.filter((d) => d.code === 'HZ093').map((d) => d.message)
}

describe('hozu gen and HZ093 (ADR 0068)', () => {
  it('the committed contract of examples/notes-go is what hozu gen writes', async () => {
    const dir = copy()
    const { code, stdout } = await run(['gen', '--json'], dir)
    const out = JSON.parse(stdout)
    const schema = JSON.parse(readFileSync(`${root}packages/cli/schema/gen.schema.json`, 'utf8'))
    const ajv = new Ajv({ strict: false })
    expect(ajv.validate(schema, out), JSON.stringify(ajv.errors)).toBe(true)
    expect(code).toBe(0)
    expect(out.contracts).toMatchObject([
      { file: contract, package: 'hozu', written: false, problems: [], notes: [] },
    ])
    expect(out.contracts[0].effects).toHaveLength(11)
    expect(out.contracts[0].effects[0]).toEqual({
      ref: 'account.accounts',
      fingerprint: expect.stringMatching(/^[0-9a-f]{16}$/),
    })
    expect(await hz093(dir)).toEqual([])
    rmSync(dir, { recursive: true })
  })

  it('a changed declaration makes the contract stale until hozu gen rewrites it', async () => {
    const dir = copy((d) => {
      const model = join(d, 'features/notes/model.ts')
      writeFileSync(
        model,
        readFileSync(model, 'utf8').replace(
          'errors: { Duplicate: z.object({ text: z.string() }) },',
          'errors: { Duplicate: z.object({ text: z.string(), id: z.string() }) },',
        ),
      )
    })
    expect(await hz093(dir)).toEqual([
      'The remote contract service/hozu/contract.go is stale: notes.addNote changed',
    ])
    const { stdout } = await run(['gen'], dir)
    expect(stdout).toMatch(/^wrote service\/hozu\/contract.go/)
    expect(readFileSync(join(dir, contract), 'utf8')).toContain(
      'type NotesAddNoteDuplicate struct {\n\tText string `json:"text"`\n\tId   string `json:"id"`\n}',
    )
    expect(await hz093(dir)).toEqual([])
    if (hasGo) expect(spawnSync('gofmt', ['-l', contract], { cwd: dir, encoding: 'utf8' }).stdout).toBe('')
    rmSync(dir, { recursive: true })
  })

  it('a missing contract is HZ093, and an app without remote() has nothing to generate', async () => {
    const dir = copy((d) => rmSync(join(d, contract)))
    expect(await hz093(dir)).toEqual(['The remote contract service/hozu/contract.go does not exist'])
    rmSync(dir, { recursive: true })
    const { code, stdout } = await run(['gen', '--json'], `${root}examples/notes`)
    expect(code).not.toBe(0)
    expect(JSON.parse(stdout).error.message).toBe(
      'app.ts lists no remote() resolvers, so there is no contract to write',
    )
  })

  it('a contract from before 0.23 (one fingerprint for the whole contract) is named as such, not as missing effects', async () => {
    const dir = copy((d) => {
      const file = join(d, contract)
      writeFileSync(
        file,
        readFileSync(file, 'utf8').replace(
          /^\/\/ Fingerprint is[\s\S]*?^}\n/m,
          '// Fingerprint is the contract this file was generated from; every call carries it.\nconst Fingerprint = "0123456789abcdef"\n',
        ),
      )
    })
    expect(readFileSync(join(dir, contract), 'utf8')).toContain('const Fingerprint = "0123456789abcdef"')
    expect(await hz093(dir)).toEqual([
      'The remote contract service/hozu/contract.go was written by an older hozu gen (one fingerprint for the whole contract); run hozu gen and rebuild the service',
    ])
    await run(['gen'], dir)
    expect(await hz093(dir)).toEqual([])
    rmSync(dir, { recursive: true })
  })

  it.skipIf(!hasGo)(
    'the example service builds, is gofmt-clean and passes its tests',
    () => {
      const go = (args: string[]) => spawnSync('go', args, { cwd: `${example}/service`, encoding: 'utf8' })
      expect(spawnSync('gofmt', ['-l', '.'], { cwd: `${example}/service`, encoding: 'utf8' }).stdout).toBe('')
      const vet = go(['vet', './...'])
      expect(vet.status, vet.stderr).toBe(0)
      const test = go(['test', './...'])
      expect(test.status, test.stdout + test.stderr).toBe(0)
    },
    120_000,
  )
})

describe('the Go contract (ADR 0070 C4, C6)', () => {
  const Status = z.enum(['pending', 'paid', 'in-transit']).meta({ title: 'OrderStatus' })
  const Order = z
    .object({ id: z.number(), status: Status, tone: z.enum(['calm', 'loud']), totalCents: z.number() })
    .meta({ title: 'Order' })
  const list = query({
    input: z.object({ status: Status.optional() }),
    output: z.object({ rows: z.array(Order), count: z.number(), share: z.number(), lines: z.int() }),
    scope: 'public',
    freshness: 'request',
    runs: 'server',
  })
  const ship = mutation({
    input: z.object({ orderId: z.number(), qty: z.int() }),
    output: Order,
    runs: 'server',
    access: 'anyone',
  })
  const ir = buildProject(
    project({
      schema: zodAdapter,
      routes: {},
      pages: [],
      features: [feature({ id: 'shop', intent: { summary: 'orders' }, declarations: [{ list, ship }] })],
    }),
  ).ir
  const contract = remoteContract(ir, ['shop.list', 'shop.ship'])

  it('a string enum is a named type with one constant per member', () => {
    const go = goContract(contract, 'hozu')
    expect(go).toContain(
      'type OrderStatus string\n\nconst (\n\tOrderStatusPending   OrderStatus = "pending"\n\tOrderStatusPaid      OrderStatus = "paid"\n\tOrderStatusInTransit OrderStatus = "in-transit"\n)',
    )
    expect(go).toContain('type OrderTone string')
    expect(go).toContain('\tStatus     OrderStatus `json:"status"`')
    expect(go).toContain('\tStatus *OrderStatus `json:"status,omitempty"`')
    expect(go.match(/type OrderStatus string/g)).toHaveLength(1)
    expect(goContract(contract, 'hozu')).toBe(go)
    if (hasGo) {
      const dir = realpathSync(mkdtempSync(join(tmpdir(), 'hozu-go-')))
      writeFileSync(join(dir, 'contract.go'), go)
      const fmt = spawnSync('gofmt', ['-l', '-e', 'contract.go'], { cwd: dir, encoding: 'utf8' })
      expect(fmt.stdout + fmt.stderr).toBe('')
      rmSync(dir, { recursive: true })
    }
  })

  it('names number fields that look like ids or counts, as notes', () => {
    expect(goNotes(contract)).toEqual([
      'shop.list: output.rows[].id is a number (float64 in Go); if it holds whole numbers, declare it z.int() (int64)',
      'shop.list: output.rows[].totalCents is a number (float64 in Go); if it holds whole numbers, declare it z.int() (int64)',
      'shop.list: output.count is a number (float64 in Go); if it holds whole numbers, declare it z.int() (int64)',
      'shop.ship: input.orderId is a number (float64 in Go); if it holds whole numbers, declare it z.int() (int64)',
      'shop.ship: output.id is a number (float64 in Go); if it holds whole numbers, declare it z.int() (int64)',
      'shop.ship: output.totalCents is a number (float64 in Go); if it holds whole numbers, declare it z.int() (int64)',
    ])
  })
})

describe('hozu gen notes enums without a title (0.24)', () => {
  const effect = (output: z.ZodType) =>
    query({ input: z.object({}), output, scope: 'public', freshness: 'request', runs: 'server' })
  const contractOf = (declarations: Record<string, unknown>) =>
    remoteContract(
      buildProject(
        project({
          schema: zodAdapter,
          routes: {},
          pages: [],
          features: [feature({ id: 'mood', intent: { summary: 'tones' }, declarations: [declarations] })],
        }),
      ).ir,
      Object.keys(declarations).map((k) => `mood.${k}`),
    )

  it('one members list in several fields and Go types is a note naming the most common field; a title is none', () => {
    const tone = () => z.enum(['calm', 'loud'])
    const contract = contractOf({
      a: effect(z.object({ tone: tone(), other: z.enum(['x', 'y']) })),
      b: effect(z.object({ tone: tone(), rows: z.array(z.object({ tone: tone(), voice: tone() })) })),
    })
    expect(goNotes(contract)).toEqual([
      'Tone-like enum ["calm","loud"] appears in 4 fields as 4 Go types; give the schema .meta({ title: \'Tone\' }) to make it one',
    ])
    expect(goContract(contract, 'hozu').match(/^type \w+ string$/gm)).toHaveLength(5)
    const Tone = z.enum(['calm', 'loud']).meta({ title: 'Tone' })
    const titled = contractOf({
      a: effect(z.object({ tone: Tone })),
      b: effect(z.object({ tone: Tone, rows: z.array(z.object({ voice: Tone })) })),
    })
    expect(goNotes(titled)).toEqual([])
    expect(goContract(titled, 'hozu').match(/^type \w+ string$/gm)).toEqual(['type Tone string'])
  })
})
