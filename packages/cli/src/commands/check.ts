import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'
import type { CheckOutput, TypeIssue } from '../contract.ts'
import type { Loaded } from '../load.ts'
import { relativize } from '../output.ts'
import { componentUses, overridesOf } from '../uses.ts'
import { inspectApp } from './app.ts'
import { kitConfigDiagnostics } from './kits.ts'
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

export async function runCheck(loaded: Loaded, cwd: string, updateLock: boolean): Promise<CheckOutput> {
  const root = dirname(loaded.path)
  const tsc = typescriptBin(loaded.path)
  let types: CheckOutput['types']
  if (!tsc) types = { ok: false, skipped: true, errors: [] }
  else {
    const run = spawnSync(process.execPath, [tsc, '--noEmit', '--pretty', 'false', '-p', root], {
      cwd: root,
      encoding: 'utf8',
    })
    const errors = withHints(typeErrors(`${run.stdout}\n${run.stderr}`, root), root)
    types = {
      ok: run.status === 0,
      skipped: false,
      errors:
        run.status === 0 || errors.length
          ? errors
          : [
              {
                file: '',
                line: 0,
                column: 0,
                code: 'tsc',
                message: (run.stderr || run.stdout).trim(),
              },
            ],
    }
  }
  const validate = await runValidate(loaded, undefined, cwd, updateLock)
  const traced = loaded.build(true)
  const { diagnostics: app } = await inspectApp(loaded, traced)
  const entry = [...app, ...(await kitConfigDiagnostics(traced, root, loaded.path))]
  validate.diagnostics.push(...relativize(entry, cwd))
  for (const d of entry) validate.summary[d.severity === 'error' ? 'errors' : 'warnings']++
  if (entry.some((d) => d.severity === 'error')) validate.ok = false
  const overrides = overridesOf(componentUses(traced.ir, traced.sources, cwd))
  return { ok: types.ok && validate.ok, types, validate, overrides }
}
