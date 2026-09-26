import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'
import type { CheckOutput, TypeIssue } from '../contract.ts'
import type { Loaded } from '../load.ts'
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
    const errors = typeErrors(`${run.stdout}\n${run.stderr}`, root)
    types = {
      ok: run.status === 0,
      skipped: false,
      errors:
        run.status === 0 || errors.length
          ? errors
          : [{ file: '', line: 0, column: 0, code: 'tsc', message: (run.stderr || run.stdout).trim() }],
    }
  }
  const validate = await runValidate(loaded, undefined, cwd, updateLock)
  return { ok: types.ok && validate.ok, types, validate }
}
