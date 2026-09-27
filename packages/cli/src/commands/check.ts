import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'
import { codes, type Diagnostic, type ProjectIR, usedWidgets } from '@hozu/core/ir'
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

const recorded = /'(?:Expr|Ref|Val)<|'Guard'|'Condition'/

export function hintFor(code: string, message: string): string | null {
  if (!recorded.test(message)) return null
  if (code === 'TS2367')
    return 'References are recorded, not evaluated, so === compares a placeholder. Use op.eq / op.neq: ui.if(op.eq(a, b), […], […]) in views, guard: (e) => op.eq(…) in machines.'
  if (code === 'TS2339')
    return 'References have no methods or properties beyond the schema. Compute the value in a fn() and call it with the reference.'
  if (code === 'TS2362' || code === 'TS2363' || code === 'TS2365')
    return 'References cannot be used in arithmetic. Use op.inc in an assign, or compute the value in a fn().'
  return 'A recorded reference is used as a JavaScript value. Use op.* for logic and fn() for computation.'
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
        hint: hintFor(m[4]!, m[5]!),
      })
  }
  return errors
}

export function serverEntryIssues(root: string, ir: ProjectIR): Diagnostic[] {
  const file = join(root, 'serve.ts')
  if (!existsSync(file)) return []
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')
  const at = lines.findIndex((l) => /create(Server|Handler)\(/.test(l))
  const source = { file: 'serve.ts', line: at + 1, column: 1 }
  const issue = (message: string, cause: string, summary: string, snippet: string): Diagnostic => ({
    code: 'HZ045',
    severity: codes.HZ045.severity,
    message,
    location: { feature: null, pointer: '', source },
    cause,
    fix: { summary, snippet, patch: null },
  })
  const out: Diagnostic[] = []
  const widgets = usedWidgets(ir)
  if (widgets.length && !/bundleWidgets\s*\(|manifest/.test(text))
    out.push(
      issue(
        `serve.ts starts the server without a widget bundle, but views use ${widgets.join(', ')}`,
        'Widget client code is bundled separately; without it the server refuses to start.',
        "npm install @hozu/bundle, then pass widgets: await bundleWidgets(build) to createServer (import { bundleWidgets } from '@hozu/bundle')",
        'widgets: await bundleWidgets(build),',
      ),
    )
  if (ir.session && !/\bsession\s*[:,}]/.test(text))
    out.push(
      issue(
        'The project declares a session, but serve.ts passes none to createServer',
        'Without a session store every request is signed out, so user-scoped queries fail.',
        "Pass session: sessionCookie({ name: 'sid', secret: process.env.SESSION_SECRET }) from @hozu/runtime-server",
        "session: sessionCookie({ name: 'sid', secret: process.env.SESSION_SECRET ?? '' }),",
      ),
    )
  return out
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
          : [
              {
                file: '',
                line: 0,
                column: 0,
                code: 'tsc',
                message: (run.stderr || run.stdout).trim(),
                hint: null,
              },
            ],
    }
  }
  const validate = await runValidate(loaded, undefined, cwd, updateLock)
  const entry = serverEntryIssues(root, loaded.build(false).ir)
  validate.diagnostics.push(...entry)
  validate.summary.warnings += entry.length
  return { ok: types.ok && validate.ok, types, validate }
}
