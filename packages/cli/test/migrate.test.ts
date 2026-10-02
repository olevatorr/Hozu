import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Json } from '@hozu/core/ir'
import { Ajv } from 'ajv'
import { afterAll, describe, expect, it } from 'vitest'
import { describeMigrate, runMigrate } from '../src/commands/migrate.ts'
import type { MigrateOutput } from '../src/contract.ts'
import { load } from '../src/load.ts'
import { addRunsServer } from '../src/migrate/step-0.11.ts'
import { chain } from '../src/migrate/steps.ts'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const schema = JSON.parse(readFileSync(`${root}packages/cli/schema/migrate.schema.json`, 'utf8'))
const ajv = new Ajv({ allErrors: true, strict: false })
const made: string[] = []
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

const head = "import { mutation, query } from '@hozu/core'\nimport { z } from 'zod'\n"

describe('the 0.10 → 0.11 rewrite (ADR 0049 §6)', () => {
  it('adds runs: server in the style of each object', () => {
    const source = `${head}export const a = query({
  input: I,
  output: O,
  scope: 'public',
  freshness: 'static',
})
export const b = mutation({
  input: I,
  output: O
})
export const c = query({ input: I, output: O, scope: 'user', freshness: 'request' })
`
    const r = addRunsServer('m.ts', source)
    expect(r.count).toBe(3)
    expect(r.code).toBe(`${head}export const a = query({
  input: I,
  output: O,
  scope: 'public',
  freshness: 'static',
  runs: 'server',
})
export const b = mutation({
  input: I,
  output: O,
  runs: 'server'
})
export const c = query({ input: I, output: O, scope: 'user', freshness: 'request', runs: 'server' })
`)
  })

  it('keeps the quote style, follows import aliases and leaves declared runs alone', () => {
    const source = `import { query as q } from "@hozu/core"
export const a = q({ input: I, output: O, scope: "public", freshness: "static" })
export const b = q({ input: I, output: O, scope: "public", freshness: "static", runs: "browser" })
`
    const r = addRunsServer('m.ts', source)
    expect(r.code).toContain('freshness: "static", runs: "server" })')
    expect(r.code).toContain('runs: "browser" })')
    expect(r.count).toBe(1)
  })

  it('writes after a type assertion on the last property, not inside it', () => {
    const multi = addRunsServer(
      'm.ts',
      `${head}export const a = query({\n  input: I,\n  freshness: f as 'request',\n})\nexport const b = query({\n  input: I,\n  freshness: f as Freshness\n})\n`,
    )
    expect(multi.code).toContain("  freshness: f as 'request',\n  runs: 'server',\n})")
    expect(multi.code).toContain("  freshness: f as Freshness,\n  runs: 'server'\n})")
    const one = addRunsServer(
      'm.ts',
      `${head}export const c = query({ input: I, freshness: f as 'request' })\n`,
    )
    expect(one.code).toContain("freshness: f as 'request', runs: 'server' })")
  })

  it('prints what it cannot rewrite, and ignores other functions named query', () => {
    const r = addRunsServer(
      'm.ts',
      `${head}const base = { input: I, output: O }\nexport const a = query({ ...base, scope: 'public', freshness: 'static' })\nexport const b = query(config)\n`,
    )
    expect(r.count).toBe(0)
    expect(r.notes.map((n) => [n.line, n.message.slice(0, 22)])).toEqual([
      [4, 'query({ ...spread }): '],
      [5, 'query(…) without an ob'],
    ])
    expect(addRunsServer('db.ts', "import { query } from './db.ts'\nquery({ sql: 'x' })\n").count).toBe(0)
  })

  it('chains steps from 0.10 and has no path from older versions', () => {
    expect(chain('0.10', '0.11')?.map((s) => s.to)).toEqual(['0.11'])
    expect(chain('0.9', '0.11')).toBeNull()
  })
})

async function copyOf(name: string) {
  const dir = join(root, '.tmp', `migrate-${name}-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  cpSync(join(root, 'packages/cli/test/fixtures/migrate-0.10', name), dir, { recursive: true })
  symlinkSync(join(root, 'examples', name, 'node_modules'), join(dir, 'node_modules'))
  made.push(dir)
  return dir
}

const irOf = async (dir: string) => (await load(undefined, dir)).build(false).ir as unknown as Json

describe('hozu migrate on a 0.10 app (ADR 0049 §6)', () => {
  it('rewrites, saves the old IR, then verifies an equal IR and a clean check', async () => {
    const dir = await copyOf('bookmarks')
    const before = await irOf(dir)
    const first = await runMigrate(dir, {
      config: undefined,
      dryRun: false,
      versions: { installed: '0.10.0', target: '0.11.0' },
      recordIR: () => before,
    })
    expect(ajv.validate(schema, first), JSON.stringify(ajv.errors)).toBe(true)
    expect(first.phase).toBe('rewrite')
    expect(first.changed).toEqual([{ file: 'features/bookmarks/model.ts', edits: 4 }])
    expect(readFileSync(join(dir, 'features/bookmarks/model.ts'), 'utf8')).toContain("runs: 'server'")
    expect(existsSync(join(dir, '.hozu/migrate-0.11.json'))).toBe(true)
    expect(first.next[1]).toContain('hozu migrate')

    const after = join(root, '.tmp', `migrate-bookmarks-after-${Date.now()}`)
    cpSync(dir, after, { recursive: true, verbatimSymlinks: true })
    made.push(after)
    const second = await runMigrate(after, {
      config: undefined,
      dryRun: false,
      versions: { installed: '0.11.0', target: '0.11.0' },
    })
    expect(ajv.validate(schema, second), JSON.stringify(ajv.errors)).toBe(true)
    expect(second.phase).toBe('verify')
    expect(second.ir).toEqual({ compared: true, skipped: null, differences: [] })
    expect(second.check?.validate.summary).toEqual({ errors: 0, warnings: 0 })
    expect(second.ok).toBe(true)
    expect(existsSync(join(after, '.hozu/migrate-0.11.json'))).toBe(false)
  }, 120_000)

  it('writes nothing on a dry run, and stops on a version older than 0.10', async () => {
    const dir = await copyOf('notes')
    const model = readFileSync(join(dir, 'features/notes/model.ts'), 'utf8')
    const dry = await runMigrate(dir, {
      config: undefined,
      dryRun: true,
      versions: { installed: '0.10.0', target: '0.11.0' },
      recordIR: () => ({}),
    })
    expect(dry.changed.length).toBeGreaterThan(0)
    expect(readFileSync(join(dir, 'features/notes/model.ts'), 'utf8')).toBe(model)
    expect(existsSync(join(dir, '.hozu'))).toBe(false)
    await expect(
      runMigrate(dir, {
        config: undefined,
        dryRun: true,
        versions: { installed: '0.9.2', target: '0.11.0' },
      }),
    ).rejects.toThrow('hozu migrate starts at 0.10.0; this app is on 0.9.2')
  })
})

describe('the migrate summary', () => {
  const base: MigrateOutput = {
    ok: true,
    from: '0.10.0',
    to: '0.11.0',
    phase: 'rewrite',
    dryRun: true,
    steps: [],
    changed: [],
    notes: [],
    packages: [],
    record: '.hozu/migrate-0.11.json',
    ir: { compared: false, skipped: null, differences: [] },
    guide: [],
    check: null,
    next: [],
  }

  it('says a dry run would save the old IR, and why a check failed', () => {
    expect(describeMigrate(base)).toContain('would save the old IR to .hozu/migrate-0.11.json')
    expect(describeMigrate({ ...base, dryRun: false })).toContain('  saved the old IR to')
    const check = {
      ok: false,
      types: { ok: false, skipped: true, errors: [] },
      validate: { summary: { errors: 0, warnings: 0 } },
      overrides: [],
    } as unknown as MigrateOutput['check']
    expect(describeMigrate({ ...base, phase: 'verify', record: null, check })).toContain(
      'hozu check: failed · types skipped (npm install -D typescript) · 0 errors, 0 warnings',
    )
  })
})
