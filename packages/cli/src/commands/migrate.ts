import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runnerOf, writeAgentFiles } from 'create-hozu'
import type { CheckOutput, MigrateOutput } from '../contract.ts'
import { HozuCliError } from '../errors.ts'
import { load } from '../load.ts'
import { runCheck } from './check.ts'
import { migrateGuide, skillTargets } from './migrate-agent.ts'
import { type AppRewrite, migrateApp, migratePackage } from './migrate-app.ts'
import { forget, lineOf, type Note, type Rewrite } from './migrate-ast.ts'
import { migrateForms } from './migrate-forms.ts'
import { migrateFreshness } from './migrate-freshness.ts'
import { migrateHead } from './migrate-head.ts'
import { migrateLinks, type SearchDefaults } from './migrate-links.ts'
import { migrateLists } from './migrate-lists.ts'
import { differences, normalize07 } from './migrate-normalize.ts'
import { migrateOps } from './migrate-ops.ts'
import { migrateParts } from './migrate-parts.ts'
import type { Stale07 } from './migrate-stale.ts'

const SKIP = /(^|\/)(node_modules|dist|\.[^/]+)(\/|$)/

export function sources(dir: string): Map<string, string> {
  const out = new Map<string, string>()
  const visit = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const path = join(d, name)
      if (SKIP.test(relative(dir, path))) continue
      if (statSync(path).isDirectory()) visit(path)
      else if (extname(name) === '.ts' && !name.endsWith('.d.ts')) out.set(path, readFileSync(path, 'utf8'))
    }
  }
  visit(dir)
  return out
}

export function checkOn07(config: string): Stale07 {
  const self = fileURLToPath(import.meta.url)
  const child = spawnSync(
    process.execPath,
    ['--no-warnings', join(dirname(self), `migrate-stale${extname(self)}`), config],
    { cwd: dirname(config), maxBuffer: 1 << 28, env: { ...process.env, NODE_OPTIONS: '' } },
  )
  try {
    return JSON.parse(child.stdout.toString()) as Stale07
  } catch {
    return {
      core: null,
      irVersion: null,
      skipped: `the stale check failed: ${child.stderr.toString().split('\n').find(Boolean) ?? 'no output'}`,
      stale: [],
      routes: {},
      errors: [],
      ir: null,
    }
  }
}

type Where = 'any' | 'resolvers'
const PRINTS: [Where, RegExp, string, string][] = [
  [
    'any',
    /AsyncLocalStorage/,
    'request state in AsyncLocalStorage (hand-made i18n?): the URL holds the language (site.locales)',
    'i18n',
  ],
  [
    'any',
    /accept-language/i,
    'hand-made language negotiation: the URL holds the language (site.locales), no Accept-Language redirect',
    'i18n',
  ],
  [
    'any',
    /Session\s*=\s*z\.object\(\{[^}]*\b(?:lang|locale|language)\s*:/,
    'a language in the session: the URL holds the language (site.locales), not the session',
    'i18n',
  ],
  [
    'resolvers',
    /<html\b[^>]*\blang\b|text\/html|<!doctype/i,
    'HTML from a resolver is HZ053: make it a ui.page with head.failed',
    'pages',
  ],
  [
    'resolvers',
    /new Response\(null,\s*\{\s*status:\s*30[1237]/,
    "a redirect Response: declare output: 'redirect' and return redirect(ui.link(…))",
    'pages',
  ],
]

/** What migrate cannot rewrite and check cannot see (ADR 0043 Migration). */
export function printed(file: string, source: string): Note[] {
  const out: Note[] = []
  const resolvers = /\bimplement\s*\(/.test(source)
  for (const [where, re, message, see] of PRINTS) {
    if (where === 'resolvers' && !resolvers) continue
    const m = re.exec(source)
    if (m) out.push({ file, line: lineOf(source, m.index), rule: 'print', message, see, behaviour: true })
  }
  return out
}

/** Every source rewrite of `hozu migrate 0.8`, in memory: removed files are absent from `files`. */
export function rewriteSources(
  dir: string,
  config: string,
  before: Map<string, string>,
  routes: SearchDefaults,
): { files: Map<string, string>; notes: Note[]; app: AppRewrite } {
  const files = new Map(before)
  const notes: Note[] = []
  const passes: ((s: string, f: string) => Rewrite)[] = [
    migrateOps,
    migrateHead,
    migrateFreshness,
    (s, f) => migrateLinks(s, f, routes),
    migrateForms,
    migrateLists,
  ]
  for (const pass of passes)
    for (const [file, source] of files) {
      forget()
      const r = pass(source, file)
      files.set(file, r.code)
      notes.push(...r.notes)
    }
  for (let round = 0; round < 5; round++) {
    forget()
    const parts = migrateParts(files)
    for (const [f, s] of parts.files) files.set(f, s)
    notes.push(...parts.notes.filter((n) => !notes.some((m) => m.file === n.file && m.message === n.message)))
    if (!parts.files.size) break
  }
  forget()
  const app = migrateApp(dir, config, files)
  for (const [f, s] of app.write) files.set(f, s)
  notes.push(...app.notes)
  for (const f of app.remove) files.delete(f)
  for (const [file, source] of files) notes.push(...printed(file, source))
  forget()
  return { files, notes, app }
}

export interface MigrateOptions {
  runCheck?: boolean
}

export async function runMigrate(
  cwd: string,
  configArg: string | undefined,
  version: string | undefined,
  options: MigrateOptions = {},
): Promise<MigrateOutput> {
  if (version !== '0.8')
    throw new HozuCliError('usage', 'hozu migrate upgrades a 0.7 app: hozu migrate 0.8', ['hozu migrate 0.8'])
  const config = resolve(cwd, configArg ?? 'hozu.config.ts')
  if (!existsSync(config))
    throw new HozuCliError('config', `No config found at ${config}`, [
      'Run hozu migrate 0.8 in the app directory',
    ])
  const dir = dirname(config)
  const rel = (f: string) => relative(cwd, f) || '.'
  const on07 = checkOn07(config)
  const cache = join(dir, 'node_modules/.cache/hozu/migrate-0.7.ir.json')
  if (on07.ir) {
    mkdirSync(dirname(cache), { recursive: true })
    writeFileSync(cache, JSON.stringify(on07.ir))
  }

  const before = sources(dir)
  const { files, notes, app } = rewriteSources(dir, config, before, new Map(Object.entries(on07.routes)))
  const changed: string[] = []
  const write = (file: string, code: string) => {
    if (file.endsWith('hozu.lock.json')) return
    writeFileSync(file, code)
    changed.push(rel(file))
  }
  for (const [file, code] of files) if (before.get(file) !== code) write(file, code)
  for (const file of app.remove) rmSync(file, { force: true })

  const pkgPath = join(dir, 'package.json')
  if (existsSync(pkgPath)) {
    const source = readFileSync(pkgPath, 'utf8')
    const pkg = migratePackage(source, app.entry)
    if (pkg.code !== source) write(pkgPath, pkg.code)
    notes.push(...pkg.notes.map((n) => ({ ...n, file: pkgPath })))
  }

  const guide: MigrateOutput['guide'] = []
  const targets = skillTargets(dir)
  if (targets.length) {
    const runner = runnerOf(process.env.npm_config_user_agent)
    const agent = targets.length === 2 ? 'both' : targets[0]!.guide === 'CLAUDE.md' ? 'claude' : 'agents'
    const existing = new Map(
      targets.map((t) => [
        t.guide,
        existsSync(join(dir, t.guide)) ? readFileSync(join(dir, t.guide), 'utf8') : null,
      ]),
    )
    const skills = new Map(targets.map((t) => [t.skill, contentOf(join(dir, t.skill))]))
    await writeAgentFiles(dir, agent, { name: dir.split('/').pop()!, runner })
    for (const t of targets) {
      if (contentOf(join(dir, t.skill)) !== skills.get(t.skill)) changed.push(rel(join(dir, t.skill)))
      const file = join(dir, t.guide)
      const r = migrateGuide(existing.get(t.guide) ?? null, t, dir, runner)
      if (r.kind === 'custom') {
        guide.push({ file: rel(file), state: 'custom', block: r.block })
      } else {
        if (r.kind !== 'current') write(file, r.code)
        guide.push({ file: rel(file), state: r.kind, block: null })
      }
    }
  }

  const installed = on07.core ?? installedCore(config)
  const next: string[] = []
  let check: CheckOutput | null = null
  const ir: MigrateOutput['ir'] = { compared: false, differences: [] }
  if (on07.irVersion !== 2) {
    next.push(`upgrade every @hozu/* dependency to 0.8: ${upgradeCommand(dir)}`)
    next.push('npx hozu migrate 0.8   # again after the upgrade: nothing to rewrite, then it runs hozu check')
  } else if (options.runCheck !== false) {
    const loaded = await load(configArg, cwd)
    if (existsSync(cache)) {
      const before = normalize07(JSON.parse(readFileSync(cache, 'utf8')))
      ir.compared = true
      ir.differences = differences(before, loaded.build(false).ir)
    }
    check = await runCheck(loaded, cwd, false)
    if (!check.ok) next.push('npx hozu check   # fix each diagnostic; accept the lock with --update-lock')
  }
  const ok = !guide.some((g) => g.state === 'custom') && (check?.ok ?? true)
  return {
    ok,
    installed,
    stale: { skipped: on07.skipped, entries: on07.stale },
    changed: [...new Set(changed)].sort(),
    removed: app.remove.map(rel).sort(),
    notes: notes.map((n) => ({ ...n, file: rel(n.file) })),
    guide,
    ir,
    next,
    check,
  }
}

function contentOf(dir: string): string {
  const out: string[] = []
  const visit = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const path = join(d, name)
      if (statSync(path).isDirectory()) visit(path)
      else out.push(`${relative(dir, path)}\n${readFileSync(path, 'utf8')}`)
    }
  }
  if (existsSync(dir)) visit(dir)
  return out.join('\u0000')
}

function installedCore(config: string): string | null {
  let d = dirname(config)
  for (;;) {
    const pkg = join(d, 'node_modules/@hozu/core/package.json')
    if (existsSync(pkg)) return JSON.parse(readFileSync(pkg, 'utf8')).version as string
    const up = dirname(d)
    if (up === d) return null
    d = up
  }
}

function upgradeCommand(dir: string): string {
  const pkg = existsSync(join(dir, 'package.json'))
    ? JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    : {}
  const names = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]
    .filter((n) => n.startsWith('@hozu/'))
    .sort()
  const tool = existsSync(join(dir, 'pnpm-lock.yaml'))
    ? 'pnpm add'
    : existsSync(join(dir, 'yarn.lock'))
      ? 'yarn add'
      : 'npm install'
  return `${tool} ${names.map((n) => `${n}@^0.8.0`).join(' ')}`
}

export function describeMigrate(r: MigrateOutput): string {
  const lines: string[] = []
  lines.push(
    r.stale.skipped
      ? `1. stale under 0.7: skipped (${r.stale.skipped})`
      : `1. stale under 0.7: ${r.stale.entries.length} lock ${r.stale.entries.length === 1 ? 'entry' : 'entries'}${r.stale.entries.length ? ' (review each before --update-lock):' : ''}`,
  )
  for (const e of r.stale.entries)
    lines.push(
      `   ${e.feature} ${e.id} [${e.kind}]${e.was ? `\n     was: ${e.was}` : ''}${e.now ? `\n     now: ${e.now}` : ''}`,
    )
  lines.push(
    `2. rewrote ${r.changed.length} ${r.changed.length === 1 ? 'path' : 'paths'}${r.removed.length ? `, removed ${r.removed.join(', ')}` : ''}`,
  )
  const behaviour = r.notes.filter((n) => n.behaviour)
  const rest = r.notes.filter((n) => !n.behaviour)
  for (const n of rest)
    lines.push(`   ${n.file}:${n.line}  ${n.message}${n.see ? `  (hozu docs ${n.see})` : ''}`)
  if (behaviour.length) {
    lines.push('   Behaviour changes and code to move by hand:')
    for (const n of behaviour)
      lines.push(`   ! ${n.file}:${n.line}  ${n.message}${n.see ? `  (hozu docs ${n.see})` : ''}`)
  }
  for (const g of r.guide)
    lines.push(
      g.state === 'custom'
        ? `   ${g.file} is not a Hozu template: replace its Hozu section with this block (the markers keep it current):\n\n${g.block}`
        : `   ${g.file}: Hozu block ${g.state}`,
    )
  let step = 3
  if (r.ir.compared)
    lines.push(
      r.ir.differences.length
        ? `${step++}. the IR differs from 0.7 (after the mapping every rewrite allows) at ${r.ir.differences.length} ${r.ir.differences.length === 1 ? 'place' : 'places'}; each is a behaviour change to review:\n${r.ir.differences.map((d) => `   ! ${d}`).join('\n')}`
        : `${step++}. the IR equals the 0.7 IR apart from the mapping every rewrite allows (ADR 0043 Migration)`,
    )
  if (r.check)
    lines.push(
      `${step++}. hozu check: ${r.check.ok ? 'ok' : 'failed'} · ${r.check.validate.summary.errors} errors, ${r.check.validate.summary.warnings} warnings · lock ${r.check.validate.lock}`,
    )
  for (const n of r.next) lines.push(`${step++}. ${n}`)
  lines.push('Migrate never writes hozu.lock.json and never deletes a contract.')
  return `${lines.join('\n')}\n`
}
