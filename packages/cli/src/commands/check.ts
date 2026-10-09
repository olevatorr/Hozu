import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'
import type { CheckOutput, TypeIssue } from '../contract.ts'
import { HozuCliError } from '../errors.ts'
import type { Loaded } from '../load.ts'
import { relativize } from '../output.ts'
import { checkPreviews, loadPreviews } from '../previews.ts'
import { remoteDiagnostics, remoteGroups } from '../remote.ts'

import { projectStyles } from '../styles.ts'
import { componentUses, overridesOf } from '../uses.ts'
import { cliVersion, compareVersion, installCommand, installedCore } from '../versions.ts'
import { applyAccepted } from './accept.ts'
import { inspectApp } from './app.ts'
import { envFilesIgnored } from './env-ignore.ts'
import { kitConfigDiagnostics, themeDiagnostics } from './kits.ts'
import { runValidate } from './validate.ts'

function typescriptBin(from: string): string | null {
  try {
    const require = createRequire(from)
    const manifest = require.resolve('typescript/package.json')
    const bin = (JSON.parse(readFileSync(manifest, 'utf8')) as { bin?: Record<string, string> }).bin?.tsc
    return bin ? join(dirname(manifest), bin) : null
  } catch {
    return null
  }
}

export function typeErrors(output: string, root: string): TypeIssue[] {
  const errors: TypeIssue[] = []
  for (const line of output.split('\n')) {
    const m = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/.exec(line.trim())
    if (m)
      errors.push({
        file: relative(root, join(root, m[1]!)),
        line: Number(m[2]),
        column: Number(m[3]),
        code: m[4]!,
        message: m[5]!,
      })
  }
  return errors
}

const LINK_SEARCH_HINT =
  'Hozu: omit the third argument of ui.link; omitted means every search default, and a search lists only the fields that differ'

export function withHints(errors: TypeIssue[], root: string): TypeIssue[] {
  const lines = new Map<string, string[]>()
  return errors.map((e) => {
    if (e.code !== 'TS2345') return e
    const file = join(root, e.file)
    if (!lines.has(file)) lines.set(file, existsSync(file) ? readFileSync(file, 'utf8').split('\n') : [])
    const line = lines.get(file)![e.line - 1] ?? ''
    const before = line.slice(0, e.column - 1)
    const arg = line.slice(e.column - 1)
    return /\blink\((?:[^()]|\([^()]*\))*,\s*$/.test(before) && /^(null\b|\{\s*\})/.test(arg)
      ? { ...e, message: `${e.message} ${LINK_SEARCH_HINT}` }
      : e
  })
}

export interface TypeRun {
  types: CheckOutput['types']
  ms: number
}

/**
 * Starts the type check in a child process, so it runs while the project loads and validates (ADR 0050 D).
 * `--incremental` keeps its state in `.hozu/check/`: a run with no change since the last is fast.
 */
export function startTypes(config: string): Promise<TypeRun> {
  const root = dirname(config)
  const tsc = typescriptBin(config)
  const started = performance.now()
  if (!tsc) return Promise.resolve({ types: { ok: false, skipped: true, errors: [] }, ms: 0 })
  const info = join(root, '.hozu/check/tsconfig.tsbuildinfo')
  const args = [tsc, '--noEmit', '--pretty', 'false', '--incremental', '--tsBuildInfoFile', info, '-p', root]
  return new Promise((done) => {
    const child = spawn(process.execPath, args, { cwd: root })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('close', (status) => {
      const errors = withHints(typeErrors(`${stdout}\n${stderr}`, root), root)
      const fallback = { file: '', line: 0, column: 0, code: 'tsc', message: (stderr || stdout).trim() }
      done({
        types: {
          ok: status === 0,
          skipped: false,
          errors: status === 0 || errors.length ? errors : [fallback],
        },
        ms: performance.now() - started,
      })
    })
  })
}

const previewDiagnostics = async (loaded: Loaded, build: Parameters<typeof checkPreviews>[1]) => {
  const { set, problems } = await loadPreviews(loaded)
  return [...problems, ...checkPreviews(loaded, build, set)]
}

export const mismatched = (v: CheckOutput['versions']): boolean =>
  v.core !== null && compareVersion(v.core, v.cli) !== 0

/**
 * A check whose CLI and packages differ stops before loading the app: every diagnostic would come from the difference
 * (ADR 0077 A2). The fix follows the state (A3).
 */
export function versionStop(config: string): HozuCliError | null {
  const v = { cli: cliVersion(), core: installedCore(config) }
  if (!mismatched(v)) return null
  const pkg = join(dirname(config), 'package.json')
  const deps = existsSync(pkg)
    ? (JSON.parse(readFileSync(pkg, 'utf8')) as Record<string, Record<string, string> | undefined>)
    : {}
  const range = deps.dependencies?.['@hozu/core'] ?? deps.devDependencies?.['@hozu/core']
  const fix =
    compareVersion(v.core!, v.cli) > 0
      ? `npx -p @hozu/cli@${v.core} hozu check   # this CLI is older than the app`
      : range !== undefined && range.replace(/^[\^~=]/, '') === v.cli
        ? `${installCommand(dirname(config))}   # package.json names this version; node_modules still has the old one`
        : `npx -p @hozu/cli@${v.cli} hozu migrate   # raises every @hozu/* to this CLI, then install`
  return new HozuCliError(
    'config',
    `hozu ${v.cli} cannot check an app on @hozu/core ${v.core}: its diagnostics would come from that difference alone`,
    [fix],
  )
}

export async function runCheck(
  loaded: Loaded,
  cwd: string,
  updateLock: boolean,
  typeRun: Promise<TypeRun> = startTypes(loaded.path),
  loadMs = 0,
): Promise<CheckOutput> {
  const root = dirname(loaded.path)
  const validating = performance.now()
  const versions = { cli: cliVersion(), core: installedCore(loaded.path) }
  const validate = await runValidate(loaded, undefined, cwd, updateLock && !mismatched(versions))
  const traced = loaded.build(true)
  const { module, diagnostics: app } = await inspectApp(loaded, traced)
  const remotes = module
    ? remoteDiagnostics(loaded, await remoteGroups(loaded, traced, module.options.resolvers), module.path)
    : []
  const tokens = Object.keys(traced.ir.kits).length
    ? ((await projectStyles(loaded.path, traced))?.tokens ?? null)
    : null
  const entry = [
    ...app,
    ...remotes,
    ...(await kitConfigDiagnostics(traced, root, loaded.path, tokens)),
    ...(await themeDiagnostics(traced, root)),
    ...envFilesIgnored(loaded, traced.ir.env?.files ?? []),
    ...(await previewDiagnostics(loaded, traced)),
  ]
  validate.diagnostics.push(...relativize(entry, cwd))
  const counted = applyAccepted(validate, traced.ir.accept, loaded.path)
  Object.assign(validate, counted, { ok: validate.ok && counted.summary.errors === 0 })
  const overrides = overridesOf(componentUses(traced.ir, traced.sources, cwd))
  const validateMs = performance.now() - validating
  const { types, ms } = await typeRun
  return {
    ok: types.ok && validate.ok && !mismatched(versions),
    types,
    validate,
    overrides,
    versions,
    timings: { types: Math.round(ms), load: Math.round(loadMs), validate: Math.round(validateMs) },
  }
}
