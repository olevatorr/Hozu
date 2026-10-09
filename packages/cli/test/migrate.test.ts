import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Json } from '@hozu/core/ir'
import { Ajv } from 'ajv'
import { afterAll, describe, expect, it } from 'vitest'
import { describeMigrate, differences, runMigrate } from '../src/commands/migrate.ts'
import type { MigrateOutput } from '../src/contract.ts'
import { load } from '../src/load.ts'
import { main } from '../src/main.ts'
import { addRunsServer } from '../src/migrate/step-0.11.ts'
import { renameForbidden } from '../src/migrate/step-0.15.ts'
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
    expect(first.steps).toEqual([
      {
        from: '0.10',
        to: '0.11',
        summary: "runs: 'server' on every query and mutation without runs (0.11 defaults to 'either')",
        changes: ["runs: 'server' on every query and mutation without runs (0.11 defaults to 'either')"],
      },
    ])
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
    expect(
      second.check?.validate.diagnostics.filter((d) => d.code !== 'HZ088').map((d) => d.code),
      'only the access 0.15 asks for remains',
    ).toEqual([])
    expect(existsSync(join(after, '.hozu/migrate-0.11.json')), 'kept until check is clean').toBe(true)
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

describe('hozu migrate to 0.12 (ADR 0050 I)', () => {
  it('takes a 0.10 app through both steps, then verifies an equal IR', async () => {
    const dir = await copyOf('bookmarks')
    const before = await irOf(dir)
    const first = await runMigrate(dir, {
      config: undefined,
      dryRun: false,
      versions: { installed: '0.10.0', target: '0.12.0' },
      recordIR: () => before,
    })
    expect(first.steps.map((s) => s.to)).toEqual(['0.11', '0.12'])
    expect(first.changed).toEqual([
      { file: 'features/bookmarks/model.ts', edits: 4 },
      { file: '.gitignore', edits: 1 },
    ])
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toBe('.hozu/\n')
    const after = join(root, '.tmp', `migrate-0.12-after-${Date.now()}`)
    cpSync(dir, after, { recursive: true, verbatimSymlinks: true })
    made.push(after)
    const second = await runMigrate(after, {
      config: undefined,
      dryRun: false,
      versions: { installed: '0.12.0', target: '0.12.0' },
    })
    expect(second.ir).toEqual({ compared: true, skipped: null, differences: [] })
    expect(second.check?.validate.diagnostics.filter((d) => d.code !== 'HZ088')).toEqual([])
  }, 120_000)

  it('changes no source of a 0.11 app, only its .gitignore', async () => {
    const dir = join(root, '.tmp', `migrate-0.11-${Date.now()}`)
    cpSync(join(root, 'examples/bookmarks'), dir, {
      recursive: true,
      filter: (from) => !/\/(node_modules|\.hozu)(\/|$)/.test(from),
    })
    symlinkSync(join(root, 'examples/bookmarks/node_modules'), join(dir, 'node_modules'))
    made.push(dir)
    const before = await irOf(dir)
    const first = await runMigrate(dir, {
      config: undefined,
      dryRun: false,
      versions: { installed: '0.11.0', target: '0.12.0' },
      recordIR: () => before,
    })
    expect(first.changed).toEqual([{ file: '.gitignore', edits: 1 }])
    const second = await runMigrate(dir, {
      config: undefined,
      dryRun: false,
      versions: { installed: '0.12.0', target: '0.12.0' },
    })
    expect([second.ir.differences, second.ok]).toEqual([[], true])
  }, 120_000)
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
    done: [],
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
      validate: { summary: { errors: 0, warnings: 0, accepted: 0 } },
      overrides: [],
      versions: { cli: '0.11.0', core: '0.11.0' },
    } as unknown as MigrateOutput['check']
    expect(describeMigrate({ ...base, phase: 'verify', record: null, check })).toContain(
      'hozu check: failed · types skipped (npm install -D typescript) · 0 errors, 0 warnings',
    )
  })
})

describe('the migrate plan lists each step as bullets (0.24)', () => {
  it('prints one line per change and keeps summary in --json as the changes joined', () => {
    const step = chain('0.21', '0.22')![0]!
    const steps = [{ from: step.from, to: step.to, summary: step.changes.join('; '), changes: step.changes }]
    const text = describeMigrate({
      ok: true,
      from: '0.21.0',
      to: '0.22.0',
      phase: 'current',
      dryRun: false,
      steps,
      changed: [],
      done: [],
      notes: [],
      packages: [],
      record: null,
      ir: { compared: false, skipped: null, differences: [] },
      guide: [],
      check: null,
      next: [],
    })
    expect(text).toContain('  0.21 → 0.22:\n    - no source change\n    - resolvers may be in Go')
    expect(text.split('\n').filter((l) => l.startsWith('    - '))).toHaveLength(step.changes.length)
    for (const s of chain('0.10', '0.23')!)
      for (const c of s.changes) {
        expect(c).not.toContain('; ')
        expect(c.length, c).toBeLessThan(140)
      }
  })
})

describe('the 0.11 → 0.12 step (ADR 0050 D)', () => {
  it('adds .hozu/ to .gitignore once, keeping what is there', async () => {
    const { ignoreHozu } = await import('../src/migrate/step-0.12.ts')
    const dir = join(root, '.tmp', `migrate-ignore-${process.pid}`)
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    made.push(dir)
    expect(ignoreHozu(dir, false)).toEqual([{ file: '.gitignore', edits: 1 }])
    expect(existsSync(join(dir, '.gitignore'))).toBe(false)
    expect(ignoreHozu(dir, true)).toEqual([{ file: '.gitignore', edits: 1 }])
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toBe('.hozu/\n')
    expect(ignoreHozu(dir, true)).toEqual([])
    writeFileSync(join(dir, '.gitignore'), 'node_modules\ndist')
    ignoreHozu(dir, true)
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toBe('node_modules\ndist\n.hozu/\n')
    writeFileSync(join(dir, '.gitignore'), 'node_modules\n/.hozu\n')
    expect(ignoreHozu(dir, true)).toEqual([])
  })

  it('0.12 → 0.13 adds connect: [] to the old IR', () => {
    const step = chain('0.12', '0.13')![0]!
    expect(
      step.normalize({ features: { a: { id: 'a' } }, env: { server: null, public: null } } as never),
    ).toEqual({
      features: { a: { id: 'a', connect: [] } },
      env: { server: null, public: null, files: [], internal: {} },
    })
  })

  it('chains 0.10 → 0.12 through both steps', () => {
    expect(chain('0.10', '0.12')?.map((s) => s.to)).toEqual(['0.11', '0.12'])
  })
})

describe('the 0.13 → 0.14 step (ADR 0053)', () => {
  it('rewrites hozu validate scripts to hozu check and removes hozu graph scripts', async () => {
    const { rewriteScripts } = await import('../src/migrate/step-0.14.ts')
    const dir = join(root, '.tmp', `migrate-scripts-${process.pid}`)
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    made.push(dir)
    const pkg = {
      name: 'app',
      scripts: {
        validate: 'hozu validate',
        lock: 'hozu validate cart --update-lock',
        graph: 'hozu graph cart',
        start: 'hozu serve',
      },
    }
    writeFileSync(join(dir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`)
    expect(rewriteScripts(dir, false)).toEqual([{ file: 'package.json', edits: 3 }])
    expect(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))).toEqual(pkg)
    rewriteScripts(dir, true)
    expect(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).scripts).toEqual({
      check: 'hozu check',
      lock: 'hozu check --update-lock',
      start: 'hozu serve',
    })
    expect(rewriteScripts(dir, true)).toEqual([])
  })

  it("adds runs: 'either' where runs is omitted, so the IR does not change", () => {
    const step = chain('0.13', '0.14')![0]!
    const r = step.rewrite(
      'm.ts',
      `${head}export const a = query({ input: I, output: O, scope: 'public', freshness: 'static' })\n`,
    )
    expect([r.count, r.code.includes("freshness: 'static', runs: 'either' })")]).toEqual([1, true])
    expect(step.normalize({ features: {} } as never)).toEqual({ features: {}, accept: [] })
  })

  it('takes a 0.10 app through every step to 0.15 with an equal IR and a clean check', async () => {
    const dir = await copyOf('bookmarks')
    const before = await irOf(dir)
    const first = await runMigrate(dir, {
      config: undefined,
      dryRun: false,
      versions: { installed: '0.10.0', target: '0.15.0' },
      recordIR: () => before,
    })
    expect(first.steps.map((s) => s.to)).toEqual(['0.11', '0.12', '0.13', '0.14', '0.15'])
    expect(first.changed).toEqual([
      { file: 'features/bookmarks/model.ts', edits: 6 },
      { file: '.gitignore', edits: 1 },
      { file: 'package.json', edits: 1 },
    ])
    expect(readFileSync(join(dir, 'features/bookmarks/model.ts'), 'utf8')).not.toContain("runs: 'either'")
    expect(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).scripts.check).toBe('hozu check')
    const after = join(root, '.tmp', `migrate-0.14-after-${Date.now()}`)
    cpSync(dir, after, { recursive: true, verbatimSymlinks: true })
    made.push(after)
    const second = await runMigrate(after, {
      config: undefined,
      dryRun: false,
      versions: { installed: '0.15.0', target: '0.15.0' },
    })
    expect(second.ir.differences).toEqual([])
    expect(
      second.check?.validate.diagnostics.map((d) => [d.code, d.message.split(':')[0]]),
      'the lock now reviews access: --update-lock accepts it',
    ).toEqual([['HZ057', 'hozu.lock.json pages are out of date']])
    await main(['check', '--no-types', '--update-lock'], after, () => {})
    const third = await runMigrate(after, {
      config: undefined,
      dryRun: false,
      versions: { installed: '0.15.0', target: '0.15.0' },
    })
    expect([third.check?.validate.summary, third.ok]).toEqual([{ errors: 0, warnings: 0, accepted: 0 }, true])
    expect(existsSync(join(after, '.hozu/migrate-0.15.json'))).toBe(false)
  }, 120_000)

  it('renames Forbidden only where an error is named, keeping shorthand and quotes valid (ADR 0059 C)', () => {
    const source = `const Forbidden = z.object({})
export const q = query({ errors: { Unauthorized, Forbidden }, failed: { 'Forbidden': 403 } })
const text = { Forbidden: 'Forbidden here' }
implement(q, (_, { fail }) => fail('Forbidden', {}))
implement(q, (_, ctx) => ctx.fail("Forbidden", {}))
contract(m, { when: [{ failed: q, error: 'Forbidden' }] })
`
    const r = renameForbidden('model.ts', source)
    expect(r.code).toBe(`const Forbidden = z.object({})
export const q = query({ errors: { Unauthorized, NotAllowed: Forbidden }, failed: { 'NotAllowed': 403 } })
const text = { Forbidden: 'Forbidden here' }
implement(q, (_, { fail }) => fail('NotAllowed', {}))
implement(q, (_, ctx) => ctx.fail("NotAllowed", {}))
contract(m, { when: [{ failed: q, error: 'NotAllowed' }] })
`)
    expect([r.count, r.notes]).toEqual([5, []])
  })

  it('renames an error the app named Forbidden, which 0.15 reserves, and keeps the IR equal (ADR 0059 C)', async () => {
    const dir = await copyOf('notes')
    const before = await irOf(dir)
    await runMigrate(dir, {
      config: undefined,
      dryRun: false,
      versions: { installed: '0.10.0', target: '0.15.0' },
      recordIR: () => before,
    })
    for (const file of ['app.ts', 'hozu.config.ts', 'features/account/views.ts', 'features/account/model.ts'])
      expect(readFileSync(join(dir, file), 'utf8'), file).not.toContain('Forbidden')
    expect(readFileSync(join(dir, 'app.ts'), 'utf8')).toContain("fail('NotAllowed', {})")
    const after = join(root, '.tmp', `migrate-notes-after-${Date.now()}`)
    cpSync(dir, after, { recursive: true, verbatimSymlinks: true })
    made.push(after)
    const second = await runMigrate(after, {
      config: undefined,
      dryRun: false,
      versions: { installed: '0.15.0', target: '0.15.0' },
    })
    expect(second.ir.differences).toEqual([])
    expect(
      second.check?.validate.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code),
    ).not.toContain('HZ014')
  }, 120_000)

  it('takes a 0.13 app to 0.14 with an equal IR and a clean check', async () => {
    const dir = join(root, '.tmp', `migrate-0.13-${Date.now()}`)
    cpSync(join(root, 'examples/bookmarks'), dir, {
      recursive: true,
      filter: (from) => !/\/(node_modules|\.hozu)(\/|$)/.test(from),
    })
    symlinkSync(join(root, 'examples/bookmarks/node_modules'), join(dir, 'node_modules'))
    made.push(dir)
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    delete pkg.scripts.check
    pkg.scripts.validate = 'hozu validate'
    writeFileSync(join(dir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`)
    const before = await irOf(dir)
    const first = await runMigrate(dir, {
      config: undefined,
      dryRun: false,
      versions: { installed: '0.13.0', target: '0.14.0' },
      recordIR: () => before,
    })
    expect(first.changed).toEqual([{ file: 'package.json', edits: 1 }])
    const second = await runMigrate(dir, {
      config: undefined,
      dryRun: false,
      versions: { installed: '0.14.0', target: '0.14.0' },
    })
    expect([second.ir.differences, second.check?.validate.summary, second.ok]).toEqual([
      [],
      { errors: 0, warnings: 0, accepted: 0 },
      true,
    ])
  }, 120_000)
})

describe('the 0.20 → 0.21 step (ADR 0067)', () => {
  it('marks shared view roots and leaves component fingerprints out of the comparison', async () => {
    const { steps } = await import('../src/migrate/steps.ts')
    const step = steps.find((s) => s.from === '0.20')!
    const ir = {
      pages: { a: { views: ['s.Header', 's.Body'] }, b: { views: ['s.Header'] } },
      features: {
        s: {
          views: {
            Header: { root: { kind: 'el', attrs: {} } },
            Body: { root: { kind: 'el', attrs: {} } },
          },
        },
      },
    }
    const out = step.normalize(structuredClone(ir) as never) as typeof ir
    expect(out.features.s.views.Header.root.attrs).toEqual({ 'data-hz-view': { literal: 's.Header' } })
    expect(out.features.s.views.Body.root.attrs).toEqual({})
    expect(step.unpredictable?.test('/features/s/components/Badge/sourceHash')).toBe(true)
    expect(step.unpredictable?.test('/kits/ui/components/Button/sourceHash')).toBe(true)
    expect(step.unpredictable?.test('/features/s/fns/total/sourceHash')).toBe(false)
  })

  it('skips the unpredictable paths before it counts, so a real difference past 50 of them still shows', () => {
    const components = (hash: string) =>
      Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`C${i}`, { sourceHash: `${hash}${i}` }]))
    const unpredictable = chain('0.20', '0.21')![0]!.unpredictable!
    const found = differences(
      { features: { s: { components: components('a') } }, z: 1 } as Json,
      { features: { s: { components: components('b') } }, z: 2 } as Json,
      '',
      (path) => unpredictable.test(path),
    )
    expect(found).toEqual(['/z: 1 → 2'])
  })
})

describe('an upgrade within a minor (ADR 0076 A1, A2)', () => {
  const app = (record?: object) => {
    const dir = join(root, '.tmp', `migrate-patch-${process.pid}-${made.length}`)
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(join(dir, '.hozu'), { recursive: true })
    made.push(dir)
    writeFileSync(join(dir, 'hozu.config.ts'), '')
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        dependencies: { '@hozu/core': '^0.26.1' },
        devDependencies: { '@hozu/cli': '^0.26.1' },
      }),
    )
    if (record) writeFileSync(join(dir, '.hozu/migrate-0.26.json'), JSON.stringify(record))
    return dir
  }

  it('raises the packages and says install, without comparing a record from an earlier migration', async () => {
    const dir = app({ from: '0.25', to: '0.26', ir: {} })
    writeFileSync(join(dir, '.hozu/migrate-0.23.json'), '{}')
    writeFileSync(join(dir, '.hozu/migrate-0.27.json'), '{}')
    mkdirSync(join(dir, '.claude/skills/hozu'), { recursive: true })
    const r = await runMigrate(dir, {
      config: undefined,
      dryRun: false,
      versions: { installed: '0.26.1', target: '0.26.3' },
    })
    expect(ajv.validate(schema, r), JSON.stringify(ajv.errors)).toBe(true)
    expect(r.guide, 'the upgrade writes the guide from this CLI (ADR 0077 A6)').toContain(
      '.claude/skills/hozu',
    )
    expect(r.phase).toBe('upgrade')
    expect(r.ir.compared).toBe(false)
    expect(r.packages).toEqual([
      { name: '@hozu/core', from: '^0.26.1', to: '^0.26.3' },
      { name: '@hozu/cli', from: '^0.26.1', to: '^0.26.3' },
    ])
    expect(readFileSync(join(dir, 'package.json'), 'utf8')).toContain('"@hozu/core": "^0.26.3"')
    expect(existsSync(join(dir, '.hozu/migrate-0.26.json'))).toBe(false)
    expect(r.done).toEqual([
      'removed the stale record .hozu/migrate-0.26.json (written for a version before 0.26.3): its IR is not compared',
      'removed the record of an earlier migration .hozu/migrate-0.23.json',
    ])
    expect(r.notes).toEqual([])
    expect(existsSync(join(dir, '.hozu/migrate-0.23.json'))).toBe(false)
    expect(
      existsSync(join(dir, '.hozu/migrate-0.27.json')),
      'a newer minor’s record waits for its own CLI',
    ).toBe(true)
    expect(r.next).toEqual(['npm install   # installs Hozu 0.26.3', 'npx hozu check'])
    const text = describeMigrate(r)
    expect(text).toContain('hozu migrate 0.26.1 → 0.26.3: upgrade, no source changes')
    expect(text).toContain('  done:\n    removed the stale record')
    expect(text).not.toContain('by hand:')
    expect(text).toContain('@hozu/core: ^0.26.1 → ^0.26.3')
  })

  it('keeps the record a rewrite wrote for this version until it is installed, then compares it', async () => {
    const dir = app({ from: '0.25', to: '0.26', version: '0.26.3', ir: {} })
    const r = await runMigrate(dir, {
      config: undefined,
      dryRun: false,
      versions: { installed: '0.26.1', target: '0.26.3' },
    })
    expect(r.phase).toBe('upgrade')
    expect(existsSync(join(dir, '.hozu/migrate-0.26.json'))).toBe(true)
    expect(r.next[1]).toContain('npx hozu migrate   # again')
  })

  it('compares an unverified record after a newer patch was installed (ADR 0076 review)', async () => {
    const dir = app({ from: '0.25', to: '0.26', version: '0.26.3', ir: {} })
    const r = await runMigrate(dir, {
      config: undefined,
      dryRun: true,
      versions: { installed: '0.26.4', target: '0.26.4' },
      check: false,
    }).catch((e: Error) => e)
    expect(existsSync(join(dir, '.hozu/migrate-0.26.json')), 'kept for the verify').toBe(true)
    expect(r instanceof Error ? r.message : r.phase).not.toBe('current')
  })

  it('removes a record verified on another version and stops a CLI older than the app', async () => {
    const dir = app({ from: '0.25', to: '0.26', version: '0.26.0', verified: '0.26.0', ir: {} })
    const r = await runMigrate(dir, {
      config: undefined,
      dryRun: true,
      versions: { installed: '0.26.3', target: '0.26.3' },
    })
    expect(r.phase).toBe('current')
    expect(r.done[0]).toContain(
      'would remove the stale record .hozu/migrate-0.26.json (verified on 0.26.0, now 0.26.3)',
    )
    expect(existsSync(join(dir, '.hozu/migrate-0.26.json')), 'a dry run writes nothing').toBe(true)
    await expect(
      runMigrate(dir, {
        config: undefined,
        dryRun: true,
        versions: { installed: '0.26.3', target: '0.26.2' },
      }),
    ).rejects.toThrow('newer than this CLI')
  })
})

describe('hozu check stops on a CLI and packages of different versions (ADR 0076 A3, ADR 0077 A2, A3)', () => {
  const appOn = (core: string, range: string) => {
    const dir = join(root, '.tmp', `check-versions-${process.pid}-${made.length}`)
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(join(dir, 'node_modules/@hozu/core'), { recursive: true })
    made.push(dir)
    writeFileSync(join(dir, 'node_modules/@hozu/core/package.json'), JSON.stringify({ version: core }))
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { '@hozu/core': range } }))
    return join(dir, 'hozu.config.ts')
  }

  it('names both versions and the fix for the state the app is in, and passes when they match', async () => {
    const { versionStop } = await import('../src/commands/check.ts')
    const { cliVersion } = await import('../src/versions.ts')
    const cli = cliVersion()
    const older = appOn('0.0.1', '^0.0.1')
    expect(versionStop(older)?.message).toBe(
      `hozu ${cli} cannot check an app on @hozu/core 0.0.1: its diagnostics would come from that difference alone`,
    )
    expect(versionStop(older)?.code).toBe('config')
    expect(versionStop(older)?.suggestions[0]).toContain('npx hozu migrate')
    expect(versionStop(appOn('0.0.1', `^${cli}`))?.suggestions[0]).toContain('npm install')
    expect(versionStop(appOn('0.0.1', `~${cli}`))?.suggestions[0]).toContain('npm install')
    expect(versionStop(appOn('99.0.0', '^99.0.0'))?.suggestions[0]).toBe(
      'npx -p @hozu/cli@99.0.0 hozu check   # this CLI is older than the app',
    )
    expect(versionStop(appOn(cli, `^${cli}`))).toBeNull()
  })

  it('compares pre-releases in order', async () => {
    const { mismatched } = await import('../src/commands/check.ts')
    expect(mismatched({ cli: '0.26.3', core: null })).toBe(false)
    expect(mismatched({ cli: '0.27.0-rc.1', core: '0.27.0-rc.2' })).toBe(true)
    const { compareVersion } = await import('../src/versions.ts')
    expect(['0.27.0', '0.26.10', '0.27.0-rc.10', '0.27.0-rc.2'].sort(compareVersion)).toEqual([
      '0.26.10',
      '0.27.0-rc.2',
      '0.27.0-rc.10',
      '0.27.0',
    ])
  })
})
