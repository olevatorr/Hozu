import { execFile, execFileSync } from 'node:child_process'
import {
  cpSync,
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
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { rewriteSources, sources } from '../src/commands/migrate.ts'
import { type Counts, differences, normalize07 } from '../src/commands/migrate-normalize.ts'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const baseline = join(root, 'bench/trial/longrun/baseline-0.7')
const expectedPath = fileURLToPath(new URL('./__snapshots__/migrate-equivalence.json', import.meta.url))
const COMMIT_07 = '5d4a198'
const trial = join(homedir(), 'hozu-trial-0020')
const run = promisify(execFile)

interface Snapshot {
  name: string
  dir: string
  modules: string
}

interface Row {
  mappings: Counts
  rewrites: Record<string, number>
  behaviour: number
}

const work = mkdtempSync(join(tmpdir(), 'hozu-migrate-eq-'))
const snapshots: Snapshot[] = []
const results = new Map<string, { row: Row; differences: string[]; diagnostics: string[] }>()

function shim(from: string, to: string) {
  mkdirSync(to, { recursive: true })
  for (const e of readdirSync(from)) if (e !== '.cache') symlinkSync(join(from, e), join(to, e))
}

function place(name: string, src: string, modules: string) {
  const dir = join(work, 'apps', name)
  cpSync(src, dir, { recursive: true, filter: (f) => !/\/node_modules(\/|$)/.test(f) })
  shim(modules, join(dir, 'node_modules'))
  snapshots.push({ name, dir, modules })
}

function reconstruct() {
  const v07 = join(work, 'v07')
  mkdirSync(v07)
  execFileSync('sh', [
    '-c',
    `git -C "${root}" archive ${COMMIT_07} examples site bench/trial/longrun/reference | tar -x -C "${v07}"`,
  ])
  for (const app of readdirSync(join(v07, 'examples')).sort())
    if (existsSync(join(v07, 'examples', app, 'hozu.config.ts')))
      place(`examples-${app}`, join(v07, 'examples', app), join(root, 'examples', app, 'node_modules'))
  place('site', join(v07, 'site'), join(root, 'site/node_modules'))
  const notes = join(root, 'examples/notes/node_modules')
  const reference = join(v07, 'bench/trial/longrun/reference')
  const replay = join(work, 'replay')
  cpSync(join(reference, 'hozu'), replay, { recursive: true, filter: (f) => !/\/node_modules(\/|$)/.test(f) })
  place('reference-hozu-base', replay, notes)
  for (const patch of readdirSync(join(reference, 'hozu-steps'))
    .filter((f) => /^\d\d\.patch$/.test(f))
    .sort()) {
    execFileSync('git', ['apply', '--whitespace=nowarn', join(reference, 'hozu-steps', patch)], {
      cwd: replay,
      env: { ...process.env, GIT_CEILING_DIRECTORIES: work },
    })
    place(`reference-hozu-s${patch.slice(0, 2)}`, replay, notes)
  }
  for (const r of ['hozu-run1', 'hozu-run2']) {
    const app = join(trial, r, 'app')
    if (!existsSync(join(app, '.git'))) continue
    const dir = join(work, r)
    mkdirSync(dir)
    execFileSync('sh', ['-c', `git -C "${app}" archive s12 | tar -x -C "${dir}"`])
    place(`trial0020-${r}-s12`, dir, notes)
  }
}

const routesOf = (ir: any) =>
  new Map<string, Record<string, unknown>>(
    Object.values(ir.routes as Record<string, any>).map((r) => [
      r.path,
      Object.fromEntries(
        Object.entries(r.search?.properties ?? {})
          .filter(([, v]: [string, any]) => 'default' in v)
          .map(([k, v]: [string, any]) => [k, v.default]),
      ),
    ]),
  )

async function migrateAndCompare(s: Snapshot) {
  const ir07 = JSON.parse(readFileSync(join(baseline, `${s.name}.ir.json`), 'utf8'))
  const config = join(s.dir, 'hozu.config.ts')
  const before = sources(s.dir)
  const { files, notes, app } = rewriteSources(s.dir, config, before, routesOf(ir07))
  for (const [f, code] of files) if (before.get(f) !== code) writeFileSync(f, code)
  for (const f of app.remove) rmSync(f)
  const { stdout } = await run(
    process.execPath,
    [
      '--no-warnings',
      '--import',
      '@hozu/transform/register',
      fileURLToPath(new URL('./migrate-build.ts', import.meta.url)),
      config,
    ],
    { cwd: s.dir, maxBuffer: 1 << 28 },
  )
  const built = JSON.parse(stdout) as { ir: unknown; diagnostics: string[] }
  const mappings: Counts = {}
  const expected = normalize07(ir07, mappings)
  const rewrites: Record<string, number> = {}
  for (const n of notes) rewrites[n.rule] = (rewrites[n.rule] ?? 0) + 1
  results.set(s.name, {
    row: {
      mappings: Object.fromEntries(Object.entries(mappings).sort()),
      rewrites: Object.fromEntries(Object.entries(rewrites).sort()),
      behaviour: notes.filter((n) => n.behaviour).length,
    },
    differences: differences(expected, built.ir),
    diagnostics: built.diagnostics,
  })
}

beforeAll(async () => {
  reconstruct()
  const queue = [...snapshots]
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let s = queue.shift(); s; s = queue.shift()) await migrateAndCompare(s)
    }),
  )
}, 900_000)

afterAll(() => rmSync(work, { recursive: true, force: true }))

describe('hozu migrate 0.8 against the committed 0.7 snapshots (ADR 0043 Migration)', () => {
  it('reconstructs every snapshot the manifest lists (the trial fixtures when ~/hozu-trial-0020 exists)', () => {
    const manifest = JSON.parse(readFileSync(join(baseline, 'manifest.json'), 'utf8')) as {
      snapshots: { name: string }[]
    }
    const names = manifest.snapshots.map((s) => s.name)
    const available = names.filter(
      (n) => !n.startsWith('trial0020-') || existsSync(join(trial, 'hozu-run1/app/.git')),
    )
    expect(snapshots.map((s) => s.name).sort()).toEqual(available.sort())
    expect(available.length).toBeGreaterThanOrEqual(31)
  })

  it('builds each migrated app with 0.8 to exactly normalize07(0.7 IR), without diagnostics', () => {
    const failing = [...results].filter(([, r]) => r.differences.length || r.diagnostics.length)
    expect(Object.fromEntries(failing.map(([n, r]) => [n, [...r.diagnostics, ...r.differences]]))).toEqual({})
  })

  it('applies only the allowed differences listed per snapshot', () => {
    const table = Object.fromEntries(
      [...results].map(([n, r]) => [n, r.row] as const).sort(([a], [b]) => (a < b ? -1 : 1)),
    )
    if (process.env.UPDATE_MIGRATE_EQUIVALENCE)
      writeFileSync(expectedPath, `${JSON.stringify(table, null, 2)}\n`)
    const expected = JSON.parse(readFileSync(expectedPath, 'utf8')) as Record<string, Row>
    for (const [name, row] of Object.entries(table))
      expect({ [name]: row }).toEqual({ [name]: expected[name] })
  })
})
