import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Ajv } from 'ajv'
import { describe, expect, it } from 'vitest'
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
    expect(out.contracts).toMatchObject([{ file: contract, package: 'hozu', written: false, problems: [] }])
    expect(out.contracts[0].effects).toHaveLength(11)
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
      expect.stringMatching(/^The remote contract service\/hozu\/contract.go is stale/),
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
