import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CheckOutput, MigrateOutput } from '../contract.ts'
import { HozuCliError } from '../errors.ts'
import { load } from '../load.ts'
import { runCheck } from './check.ts'
import { installedCore, type MigrateOptions, sources, upgradeCommand } from './migrate.ts'
import { forget, type Note } from './migrate-ast.ts'
import { migrateBundle } from './migrate-bundle.ts'
import { migrateComponents } from './migrate-components.ts'
import { adoptRenderHashes, differences, normalize08 } from './migrate-normalize.ts'
import type { On08 } from './migrate-on08.ts'
import { sharedParts } from './migrate-shared.ts'
import { applyStyleFindings, patchIr, styleRunIsolated } from './migrate-styles.ts'

const RECORD = '.hozu/migrate-0.8.json'

export function checkOn08(config: string): On08 {
  const self = fileURLToPath(import.meta.url)
  const child = spawnSync(
    process.execPath,
    ['--no-warnings', join(dirname(self), `migrate-on08${extname(self)}`), config],
    { cwd: dirname(config), maxBuffer: 1 << 28, env: { ...process.env, NODE_OPTIONS: '' } },
  )
  try {
    return JSON.parse(child.stdout.toString()) as On08
  } catch {
    return {
      core: null,
      irVersion: null,
      skipped: `the stale check failed: ${child.stderr.toString().split('\n').find(Boolean) ?? 'no output'}`,
      stale: [],
      errors: [],
      ir: null,
    }
  }
}

/** The source rewrites of `hozu migrate 0.9` that need no IR, in memory (ADR 0045 L). */
export function rewriteSources09(before: Map<string, string>): { files: Map<string, string>; notes: Note[] } {
  const files = new Map(before)
  forget()
  const components = migrateComponents(files)
  for (const [f, s] of components.files) files.set(f, s)
  const notes: Note[] = [...components.notes]
  for (const [file, source] of files) {
    const r = migrateBundle(source, file)
    files.set(file, r.code)
    notes.push(...r.notes)
  }
  notes.push(...sharedParts(files))
  forget()
  return { files, notes }
}

export async function runMigrate09(
  cwd: string,
  configArg: string | undefined,
  options: MigrateOptions = {},
): Promise<MigrateOutput> {
  const config = resolve(cwd, configArg ?? 'hozu.config.ts')
  if (!existsSync(config))
    throw new HozuCliError('config', `No config found at ${config}`, [
      'Run hozu migrate 0.9 in the app directory',
    ])
  const dir = dirname(config)
  const rel = (f: string) => relative(cwd, f) || '.'
  const on08 = checkOn08(config)
  const record = join(dir, RECORD)
  if (on08.ir) {
    mkdirSync(dirname(record), { recursive: true })
    writeFileSync(record, JSON.stringify(on08.ir))
  }
  const changed: string[] = []
  const write = (file: string, code: string) => {
    if (file.endsWith('hozu.lock.json')) return
    writeFileSync(file, code)
    changed.push(rel(file))
  }
  const before = sources(dir)
  const { files, notes } = rewriteSources09(before)
  for (const [file, code] of files) if (before.get(file) !== code) write(file, code)
  // Phase 5 writes the 0.9 CLAUDE.md / AGENTS.md block here, through migrateGuide (ADR 0045 L).
  const guide: MigrateOutput['guide'] = []
  const next: string[] = []
  let check: CheckOutput | null = null
  const ir: MigrateOutput['ir'] = { compared: false, skipped: null, differences: [] }
  if (on08.irVersion !== 3) {
    next.push(`upgrade every @hozu/* dependency to 0.9: ${upgradeCommand(dir, '0.9')}`)
    next.push(
      'npx hozu migrate 0.9   # again after the upgrade: it applies the HZ079 / HZ074 patches, compares the IR, then runs hozu check',
    )
    if (on08.ir)
      next.push(
        `keep ${RECORD} until that second run: it holds the 0.8 IR it compares with (a reinstall keeps it; delete it afterwards)`,
      )
  } else if (options.runCheck !== false) {
    const styles = styleRunIsolated(config)
    if (styles.skipped)
      notes.push({
        file: config,
        line: 1,
        rule: 'print',
        message: `HZ079 / HZ074 patches skipped: ${styles.skipped}`,
        behaviour: true,
      })
    const current = sources(dir)
    const patched = applyStyleFindings(current, styles.findings)
    for (const [file, code] of patched.files) if (current.get(file) !== code) write(file, code)
    notes.push(...patched.notes)
    const loaded = await load(configArg, cwd)
    if (existsSync(record)) {
      const built = loaded.build(false).ir
      const expected = patchIr(normalize08(JSON.parse(readFileSync(record, 'utf8'))), patched.patches)
      ir.compared = true
      ir.differences = differences(adoptRenderHashes(expected, built), built)
      next.push(`delete ${RECORD}: the IR comparison with 0.8 is done`)
    } else ir.skipped = `${RECORD} is missing: it is written by the run on the 0.8 app, before the upgrade`
    check = await runCheck(loaded, cwd, false)
    if (!check.ok) next.push('npx hozu check   # fix each diagnostic; accept the lock with --update-lock')
  }
  return {
    ok: check?.ok ?? true,
    version: '0.9',
    installed: on08.core ?? installedCore(config),
    stale: { skipped: on08.skipped, entries: on08.stale },
    changed: [...new Set(changed)].sort(),
    removed: [],
    notes: notes.map((n) => ({ ...n, file: rel(n.file) })),
    guide,
    ir,
    next,
    check,
  }
}
