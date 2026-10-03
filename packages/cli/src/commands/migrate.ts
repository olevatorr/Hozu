import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { Json } from '@hozu/core/ir'
import type { CheckOutput, MigrateOutput } from '../contract.ts'
import { HozuCliError } from '../errors.ts'
import { load } from '../load.ts'
import { chain, compareMinor, minorOf, OLDEST } from '../migrate/steps.ts'
import { runCheck } from './check.ts'
import { runSkill } from './skill.ts'

const SKIP = /(^|\/)(node_modules|dist|\.[^/]+)(\/|$)/

export interface MigrateOptions {
  config: string | undefined
  dryRun: boolean
  /** Tests: the versions instead of node_modules/@hozu/core and the CLI's package.json. */
  versions?: { installed: string; target: string }
  /** Tests: the IR of the installed version instead of a child process on the app's packages. */
  recordIR?: (config: string) => Json
  /** Tests: skip the type check and validation of the verify phase. */
  check?: boolean
}

const cliVersion = (): string => {
  const pkg = new URL('../../package.json', import.meta.url)
  return (JSON.parse(readFileSync(fileURLToPath(pkg), 'utf8')) as { version: string }).version
}

export function installedCore(config: string): string | null {
  let d = dirname(config)
  for (;;) {
    const pkg = join(d, 'node_modules/@hozu/core/package.json')
    if (existsSync(pkg)) return (JSON.parse(readFileSync(pkg, 'utf8')) as { version: string }).version
    const up = dirname(d)
    if (up === d) return null
    d = up
  }
}

export function sources(dir: string): string[] {
  const out: string[] = []
  const visit = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const path = join(d, name)
      if (SKIP.test(relative(dir, path))) continue
      if (statSync(path).isDirectory()) visit(path)
      else if (extname(name) === '.ts' && !name.endsWith('.d.ts')) out.push(path)
    }
  }
  visit(dir)
  return out
}

/** The IR as the app's installed Hozu builds it, in a child process with the app's own transform hook. */
function recordWithInstalled(config: string): Json {
  const require = createRequire(config)
  let register: string
  try {
    register = require.resolve('@hozu/transform/register')
  } catch {
    throw new HozuCliError(
      'config',
      'hozu migrate needs the app’s installed @hozu/transform to read the old IR',
      ['npm install, then run hozu migrate again'],
    )
  }
  const self = fileURLToPath(import.meta.url)
  const script = join(dirname(self), `../migrate/record-ir${extname(self)}`)
  const child = spawnSync(
    process.execPath,
    ['--no-warnings', '--import', pathToFileURL(register).href, script, config],
    { cwd: dirname(config), maxBuffer: 1 << 28, env: { ...process.env, NODE_OPTIONS: '' } },
  )
  try {
    return JSON.parse(child.stdout.toString()) as Json
  } catch {
    throw new HozuCliError(
      'build',
      `hozu migrate could not build the app with its installed Hozu: ${child.stderr.toString().split('\n').find(Boolean) ?? 'no output'}`,
      ['npx hozu check   # fix the app on its current version first'],
    )
  }
}

/** JSON pointers where two IRs differ, each with both values, at most 50. */
export function differences(before: Json, after: Json, at = ''): string[] {
  const out: string[] = []
  const show = (v: unknown) => {
    const s = v === undefined ? 'absent' : JSON.stringify(v)
    return s.length > 80 ? `${s.slice(0, 77)}…` : s
  }
  const visit = (a: unknown, b: unknown, path: string) => {
    if (out.length >= 50) return
    if (JSON.stringify(a) === JSON.stringify(b)) return
    const objects =
      a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)
    if (!objects) {
      out.push(`${path || '/'}: ${show(a)} → ${show(b)}`)
      return
    }
    const keys = [...new Set([...Object.keys(a as object), ...Object.keys(b as object)])].sort()
    for (const k of keys)
      visit(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
        `${path}/${k.replace(/~/g, '~0').replace(/\//g, '~1')}`,
      )
  }
  visit(before, after, at)
  return out
}

function raisePackages(pkgPath: string, version: string, write: boolean): MigrateOutput['packages'] {
  if (!existsSync(pkgPath)) return []
  const source = readFileSync(pkgPath, 'utf8')
  const pkg = JSON.parse(source) as Record<string, Record<string, string> | undefined>
  const out: MigrateOutput['packages'] = []
  for (const field of ['dependencies', 'devDependencies'] as const)
    for (const [name, range] of Object.entries(pkg[field] ?? {})) {
      if (!name.startsWith('@hozu/') && name !== 'create-hozu') continue
      if (/^(workspace|file|link):/.test(range)) continue
      const next = `^${version}`
      if (range === next) continue
      pkg[field]![name] = next
      out.push({ name, from: range, to: next })
    }
  if (out.length && write) writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
  return out
}

const installCommand = (dir: string): string =>
  existsSync(join(dir, 'pnpm-lock.yaml'))
    ? 'pnpm install'
    : existsSync(join(dir, 'yarn.lock'))
      ? 'yarn install'
      : 'npm install'

export async function runMigrate(cwd: string, options: MigrateOptions): Promise<MigrateOutput> {
  const config = resolve(cwd, options.config ?? 'hozu.config.ts')
  if (!existsSync(config))
    throw new HozuCliError('config', `No config found at ${config}`, [
      'run hozu migrate in the app directory',
    ])
  const dir = dirname(config)
  const rel = (p: string) => relative(cwd, p) || '.'
  const installed = options.versions?.installed ?? installedCore(config)
  if (!installed)
    throw new HozuCliError('config', 'No installed @hozu/core: install the app’s dependencies first', [
      installCommand(dir),
    ])
  const target = options.versions?.target ?? cliVersion()
  const from = minorOf(installed)
  const to = minorOf(target)
  if (compareMinor(from, OLDEST) < 0)
    throw new HozuCliError(
      'usage',
      `hozu migrate starts at ${OLDEST}.0; this app is on ${installed}. Upgrade it to ${OLDEST} by hand with the CHANGELOG first`,
      ['https://github.com/olevatorr/Hozu/blob/main/CHANGELOG.md'],
    )
  if (compareMinor(from, to) > 0)
    throw new HozuCliError('usage', `The app is on ${installed}, newer than this CLI (${target})`, [
      `npx @hozu/cli@${installed} …`,
    ])
  const record = join(dir, `.hozu/migrate-${from}.json`)
  const out: MigrateOutput = {
    ok: true,
    from: installed,
    to: target,
    phase: 'current',
    dryRun: options.dryRun,
    steps: [],
    changed: [],
    notes: [],
    packages: [],
    record: null,
    ir: { compared: false, skipped: null, differences: [] },
    guide: [],
    check: null,
    next: [],
  }

  if (compareMinor(from, to) < 0) {
    const plan = chain(from, to)
    if (!plan) throw new HozuCliError('usage', `No migration path from ${from} to ${to}`, [])
    out.phase = 'rewrite'
    out.steps = plan.map((s) => ({ from: s.from, to: s.to, summary: s.summary }))
    const ir = (options.recordIR ?? recordWithInstalled)(config)
    for (const file of sources(dir)) {
      let code = readFileSync(file, 'utf8')
      const original = code
      let edits = 0
      for (const step of plan) {
        const r = step.rewrite(rel(file), code)
        code = r.code
        edits += r.count
        out.notes.push(...r.notes)
      }
      if (code === original) continue
      out.changed.push({ file: rel(file), edits })
      if (!options.dryRun) writeFileSync(file, code)
    }
    for (const step of plan) out.changed.push(...(step.files?.(dir, !options.dryRun) ?? []))
    out.packages = raisePackages(join(dir, 'package.json'), target, !options.dryRun)
    if (!options.dryRun) {
      mkdirSync(dirname(record), { recursive: true })
      writeFileSync(join(dir, `.hozu/migrate-${to}.json`), JSON.stringify({ from, to, ir }))
    }
    out.record = rel(join(dir, `.hozu/migrate-${to}.json`))
    out.next.push(
      `${installCommand(dir)}   # installs Hozu ${target}`,
      'npx hozu migrate   # again: compares the IR with the old one and runs hozu check',
    )
    return out
  }

  const saved = join(dir, `.hozu/migrate-${to}.json`)
  if (!existsSync(saved)) {
    out.next.push('Nothing to migrate: the app is on this CLI’s version.')
    return out
  }
  out.phase = 'verify'
  out.record = rel(saved)
  const { from: was, ir: before } = JSON.parse(readFileSync(saved, 'utf8')) as { from: string; ir: Json }
  const plan = chain(was, to) ?? []
  out.steps = plan.map((s) => ({ from: s.from, to: s.to, summary: s.summary }))
  const loaded = await load(options.config, cwd)
  const normalized = plan.reduce((ir, step) => step.normalize(ir), before)
  out.ir = {
    compared: true,
    skipped: null,
    differences: differences(normalized, loaded.build(false).ir as unknown as Json),
  }
  if (!options.dryRun) {
    const agents = ['.claude/skills/hozu', '.agents/skills/hozu'].filter((p) => existsSync(join(dir, p)))
    if (agents.length) {
      const written = await runSkill(dir, undefined)
      out.guide = written.written.map((f) => rel(resolve(dir, f)))
      for (const c of written.custom)
        out.notes.push({
          file: rel(resolve(dir, c.guide)),
          line: 1,
          message: `not a Hozu template: replace its Hozu section with this block\n${c.block}`,
          see: null,
        })
    }
  }
  if (options.check !== false) {
    out.check = await runCheck(loaded, cwd, false)
    if (!out.check.ok)
      out.next.push('npx hozu check   # fix each diagnostic; accept intended lock changes with --update-lock')
  }
  out.ok = out.ir.differences.length === 0 && (out.check?.ok ?? true)
  if (out.ir.differences.length)
    out.next.push('Review each IR difference: it is a behaviour change the migration did not declare')
  if (out.ok && !options.dryRun) {
    rmSync(saved)
    out.next.push('Done. Commit the migration; hozu.lock.json was not touched.')
  }
  return out
}

const typesOf = (t: CheckOutput['types']) =>
  t.skipped ? 'skipped (npm install -D typescript)' : t.ok ? 'ok' : `${t.errors.length} errors`

export function describeMigrate(r: MigrateOutput): string {
  const lines: string[] = []
  const title = r.phase === 'rewrite' ? 'rewrite' : r.phase === 'verify' ? 'verify' : 'nothing to do'
  lines.push(`hozu migrate ${r.from} → ${r.to}: ${title}${r.dryRun ? ' (dry run, nothing written)' : ''}`)
  for (const s of r.steps) lines.push(`  ${s.from} → ${s.to}: ${s.summary}`)
  if (r.phase === 'rewrite') {
    lines.push(`  rewrote ${r.changed.length} ${r.changed.length === 1 ? 'file' : 'files'}`)
    for (const c of r.changed) lines.push(`    ${c.file} (${c.edits} ${c.edits === 1 ? 'edit' : 'edits'})`)
    for (const p of r.packages) lines.push(`  ${p.name}: ${p.from} → ${p.to}`)
    if (r.record) lines.push(`  ${r.dryRun ? 'would save' : 'saved'} the old IR to ${r.record}`)
  }
  if (r.notes.length) lines.push('  by hand:')
  for (const n of r.notes)
    lines.push(`    ${n.file}:${n.line}  ${n.message}${n.see ? `  (hozu docs ${n.see})` : ''}`)
  if (r.ir.compared)
    lines.push(
      r.ir.differences.length
        ? `  the IR differs from ${r.from === r.to ? 'the saved one' : r.from} after the declared mapping, at ${r.ir.differences.length} ${r.ir.differences.length === 1 ? 'place' : 'places'}:\n${r.ir.differences.map((d) => `    ! ${d}`).join('\n')}`
        : '  the IR equals the old one after the declared mapping',
    )
  for (const g of r.guide) lines.push(`  updated ${g}`)
  if (r.check)
    lines.push(
      `  hozu check: ${r.check.ok ? 'ok' : 'failed'} · types ${typesOf(r.check.types)} · ${r.check.validate.summary.errors} errors, ${r.check.validate.summary.warnings} warnings`,
    )
  for (const n of r.next) lines.push(`next: ${n}`)
  lines.push('Migrate never writes hozu.lock.json and never deletes a contract.')
  return `${lines.join('\n')}\n`
}
