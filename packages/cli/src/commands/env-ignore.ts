import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { codes, type Diagnostic } from '@hozu/core/ir'
import type { Loaded } from '../load.ts'

/**
 * HZ086 (ADR 0052): an env file `project({ env: { files } })` lists that exists and git would commit. Outside a git
 * repository, or without git, nothing is reported.
 */
export function envFilesIgnored(loaded: Loaded, files: string[]): Diagnostic[] {
  const root = dirname(loaded.path)
  const inside = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root, encoding: 'utf8' })
  if (inside.status !== 0) return []
  return files
    .filter((file) => existsSync(join(root, file)))
    .filter((file) => spawnSync('git', ['check-ignore', '-q', file], { cwd: root }).status === 1)
    .map((file) => ({
      code: 'HZ086',
      severity: codes.HZ086.severity,
      message: `${file} is listed in env.files and git does not ignore it`,
      location: { feature: null, pointer: '/env/files', source: { file: loaded.path, line: 1, column: 1 } },
      cause:
        'Env files hold secrets (tokens, database URLs); a file git does not ignore ends up in a commit.',
      fix: {
        summary: `Add ${file} to .gitignore; commit .env.example (npx hozu env --example) instead`,
        snippet: file,
        patch: null,
      },
    }))
}
