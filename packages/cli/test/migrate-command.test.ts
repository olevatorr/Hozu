import { execFile, execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Ajv } from 'ajv'
import { describe, expect, it } from 'vitest'
import { sources } from '../src/commands/migrate.ts'
import type { MigrateOutput } from '../src/contract.ts'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const run2 = join(homedir(), 'hozu-trial-0020/hozu-run2/app')
const modules08 = join(root, 'examples/notes/node_modules')

const bin = join(root, 'packages/cli/bin/hozu.js')
const ajv = new Ajv({ allErrors: true, strict: false })
const migrateSchema = JSON.parse(readFileSync(join(root, 'packages/cli/schema/migrate.schema.json'), 'utf8'))
const parsed = (stdout: string): MigrateOutput => {
  const out = JSON.parse(stdout)
  ajv.validate(migrateSchema, out)
  expect(ajv.errors ?? []).toEqual([])
  return out
}

const cli = (args: string[], cwd: string) =>
  new Promise<{ code: number; stdout: string }>((resolve) =>
    execFile(process.execPath, [bin, ...args], { cwd, maxBuffer: 1 << 26 }, (error, stdout) =>
      resolve({ code: error ? Number(error.code ?? 1) : 0, stdout }),
    ),
  )

function shim(from: string, to: string) {
  mkdirSync(to, { recursive: true })
  for (const e of readdirSync(from)) if (e !== '.cache') symlinkSync(join(from, e), join(to, e))
}

const contracts = (dir: string) =>
  [...sources(dir).values()]
    .flatMap((s) => [...s.matchAll(/\bcontract\(\s*['"]([^'"]+)/g)].map((m) => m[1]))
    .sort()

describe('hozu migrate 0.8, end to end', () => {
  it.skipIf(!existsSync(join(run2, '.git')))(
    'on trial 0020 run 2 s12: stale under 0.7, rewrite, upgrade, compare the IR, check',
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'hozu-migrate-run2-'))
      execFileSync('sh', ['-c', `git -C "${run2}" archive s12 | tar -x -C "${dir}"`])
      shim(join(run2, 'node_modules'), join(dir, 'node_modules'))
      const lock = readFileSync(join(dir, 'hozu.lock.json'), 'utf8')
      const before = contracts(dir)

      const first = await cli(['migrate', '0.8', '--json'], dir)
      const r1 = parsed(first.stdout)
      expect(first.code).toBe(0)
      expect(r1.stale.skipped).toBeNull()
      const kinds: Record<string, number> = {}
      for (const e of r1.stale.entries) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1
      expect(kinds).toEqual({ behavior: 2, contracts: 4, missing: 4 })
      expect(r1.removed).toEqual(['serve.ts', 'server.ts'])
      expect(existsSync(join(dir, 'app.ts'))).toBe(true)
      expect(r1.guide).toEqual([{ file: 'CLAUDE.md', state: 'marked', block: null }])
      expect(r1.next[0]).toMatch(
        /^upgrade every @hozu\/\* dependency to 0\.8: npm install @hozu\/adapter-node@\^0\.8\.0/,
      )
      expect(readFileSync(join(dir, 'hozu.lock.json'), 'utf8')).toBe(lock)
      expect(contracts(dir)).toEqual(before)
      expect(existsSync(join(dir, '.hozu/migrate-0.7.json'))).toBe(true)
      expect(r1.next).toContain(
        'keep .hozu/migrate-0.7.json until that second run: it holds the 0.7 IR it compares with (a reinstall keeps it; delete it afterwards)',
      )

      rmSync(join(dir, 'node_modules'), { recursive: true })
      shim(join(run2, 'node_modules'), join(dir, 'node_modules'))
      for (const m of ['@hozu', 'zod']) {
        rmSync(join(dir, 'node_modules', m))
        symlinkSync(join(modules08, m), join(dir, 'node_modules', m))
      }
      const second = await cli(['migrate', '0.8', '--json'], dir)
      const r2 = parsed(second.stdout)
      expect(r2.stale.skipped).toContain('the stale check runs on 0.7, before the upgrade')
      expect(r2.changed).toEqual([])
      expect(r2.ir).toEqual({ compared: true, skipped: null, differences: [] })
      expect(r2.next).toContain('delete .hozu/migrate-0.7.json: the IR comparison with 0.7 is done')
      expect([...new Set(r2.check!.validate.diagnostics.map((d) => d.code))].sort()).toEqual([
        'HZ057',
        'HZ058',
      ])
      expect(second.code).toBe(1)
      expect(readFileSync(join(dir, 'hozu.lock.json'), 'utf8')).toBe(lock)

      expect((await cli(['check', '--update-lock'], dir)).code).toBe(0)
      const third = await cli(['migrate', '0.8', '--json'], dir)
      const r3 = parsed(third.stdout)
      expect(r3.check!.ok).toBe(true)
      expect(third.code).toBe(0)
      expect(contracts(dir)).toEqual(before)
    },
    300_000,
  )

  it('says so when the 0.7 IR record is missing on the run after the upgrade', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hozu-migrate-norecord-'))
    execFileSync('sh', ['-c', `git -C "${root}" archive HEAD examples/bookmarks | tar -x -C "${dir}"`])
    const app = join(dir, 'examples/bookmarks')
    shim(join(root, 'examples/bookmarks/node_modules'), join(app, 'node_modules'))
    const json = parsed((await cli(['migrate', '0.8', '--json'], app)).stdout)
    expect(json.ir).toEqual({
      compared: false,
      skipped:
        '.hozu/migrate-0.7.json is missing: it is written by the run on the 0.7 app, before the upgrade',
      differences: [],
    })
    const text = (await cli(['migrate', '0.8'], app)).stdout
    expect(text).toContain(
      '3. IR comparison with 0.7: skipped (.hozu/migrate-0.7.json is missing: it is written by the run on the 0.7 app, before the upgrade)',
    )
  }, 120_000)

  it('prints the block and exits 1 when CLAUDE.md is not a Hozu template, and rejects other versions', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hozu-migrate-guide-'))
    execFileSync('sh', ['-c', `git -C "${root}" archive 5d4a198 examples/bookmarks | tar -x -C "${dir}"`])
    const app = join(dir, 'examples/bookmarks')
    shim(join(root, 'examples/bookmarks/node_modules'), join(app, 'node_modules'))
    mkdirSync(join(app, '.claude/skills/hozu'), { recursive: true })
    writeFileSync(join(app, 'CLAUDE.md'), '# Bookmarks\n\nOur own rules.\n')
    const r = await cli(['migrate', '0.8'], app)
    expect(r.code).toBe(1)
    expect(r.stdout).toContain('CLAUDE.md is not a Hozu template: replace its Hozu section with this block')
    expect(r.stdout).toContain('<!-- hozu: generated by hozu skill;')
    expect(readFileSync(join(app, 'CLAUDE.md'), 'utf8')).toBe('# Bookmarks\n\nOur own rules.\n')
    expect(existsSync(join(app, '.claude/skills/hozu/SKILL.md'))).toBe(true)
    const wrong = await cli(['migrate', '0.9', '--json'], app)
    expect(wrong.code).toBe(2)
    expect(JSON.parse(wrong.stdout).error.message).toContain('hozu migrate 0.8')
  }, 120_000)
})
