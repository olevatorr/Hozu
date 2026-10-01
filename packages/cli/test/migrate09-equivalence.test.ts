import { execFile, execFileSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sources } from '../src/commands/migrate.ts'
import {
  adoptRenderHashes,
  type Counts,
  differences,
  normalize08,
} from '../src/commands/migrate-normalize.ts'
import { applyStyleFindings, patchIr, styleRunIsolated } from '../src/commands/migrate-styles.ts'
import { rewriteSources09 } from '../src/commands/migrate09.ts'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const baseline = join(root, 'bench/ui/baseline-0.8')
const expectedPath = fileURLToPath(new URL('./__snapshots__/migrate09-equivalence.json', import.meta.url))
const COMMIT_08 = '7b594dd'
const APPS = ['examples/showcase', 'examples/stations', 'site', 'examples/notes', 'examples/blog']
const run = promisify(execFile)

interface Row {
  mappings: Counts
  rewrites: Record<string, number>
  behaviour: number
}

const work = mkdtempSync(join(tmpdir(), 'hozu-migrate09-eq-'))
const results = new Map<string, { row: Row; differences: string[]; diagnostics: string[] }>()
const nameOf = (app: string) => app.replace('/', '-')

function place(app: string): string {
  const dir = join(work, 'apps', nameOf(app))
  cpSync(join(work, 'v08', app), dir, { recursive: true, filter: (f) => !/\/node_modules(\/|$)/.test(f) })
  const modules = join(root, app, 'node_modules')
  mkdirSync(join(dir, 'node_modules'))
  for (const e of readdirSync(modules))
    if (e !== '.cache') symlinkSync(join(modules, e), join(dir, 'node_modules', e))
  return dir
}

async function migrateAndCompare(app: string) {
  const dir = place(app)
  const config = join(dir, 'hozu.config.ts')
  const ir08 = JSON.parse(readFileSync(join(baseline, `${nameOf(app)}.ir.json`), 'utf8'))
  const before = sources(dir)
  const { files, notes } = rewriteSources09(before)
  for (const [f, code] of files) if (before.get(f) !== code) writeFileSync(f, code)
  const styles = styleRunIsolated(config)
  expect(styles.skipped).toBeNull()
  const current = sources(dir)
  const patched = applyStyleFindings(current, styles.findings)
  for (const [f, code] of patched.files) if (current.get(f) !== code) writeFileSync(f, code)
  const { stdout } = await run(
    process.execPath,
    [
      '--no-warnings',
      '--import',
      '@hozu/transform/register',
      fileURLToPath(new URL('./migrate-build.ts', import.meta.url)),
      config,
    ],
    { cwd: dir, maxBuffer: 1 << 28 },
  )
  const built = JSON.parse(stdout) as { ir: unknown; diagnostics: string[] }
  const mappings: Counts = {}
  const expected = adoptRenderHashes(
    patchIr(normalize08(ir08, mappings), patched.patches),
    built.ir,
    mappings,
  )
  if (patched.patches.length) mappings.stylePatch = patched.patches.length
  const rewrites: Record<string, number> = {}
  for (const n of [...notes, ...patched.notes]) rewrites[n.rule] = (rewrites[n.rule] ?? 0) + 1
  results.set(nameOf(app), {
    row: {
      mappings: Object.fromEntries(Object.entries(mappings).sort()),
      rewrites: Object.fromEntries(Object.entries(rewrites).sort()),
      behaviour: [...notes, ...patched.notes].filter((n) => n.behaviour).length,
    },
    differences: differences(expected, built.ir),
    diagnostics: built.diagnostics,
  })
}

beforeAll(async () => {
  mkdirSync(join(work, 'v08'))
  execFileSync('sh', [
    '-c',
    `git -C "${root}" archive ${COMMIT_08} ${APPS.join(' ')} | tar -x -C "${work}/v08"`,
  ])
  await Promise.all(APPS.map(migrateAndCompare))
}, 600_000)

afterAll(() => rmSync(work, { recursive: true, force: true }))

describe('hozu migrate 0.9 against the committed 0.8 IR (ADR 0045 L, acceptance 3)', () => {
  it('builds each migrated 0.8 app with 0.9 to normalize08(0.8 IR) plus its style patches, without diagnostics', () => {
    expect(results.size).toBe(APPS.length)
    const failing = [...results].filter(([, r]) => r.differences.length || r.diagnostics.length)
    expect(Object.fromEntries(failing.map(([n, r]) => [n, [...r.diagnostics, ...r.differences]]))).toEqual({})
  })

  it('applies only the allowed differences listed per app', () => {
    const table = Object.fromEntries(
      [...results].map(([n, r]) => [n, r.row] as const).sort(([a], [b]) => (a < b ? -1 : 1)),
    )
    if (process.env.UPDATE_MIGRATE_EQUIVALENCE)
      writeFileSync(expectedPath, `${JSON.stringify(table, null, 2)}\n`)
    const expected = JSON.parse(readFileSync(expectedPath, 'utf8')) as Record<string, Row>
    expect(table).toEqual(expected)
  })
})
