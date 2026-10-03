import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const IGNORES = new Set(['.hozu', '.hozu/', '/.hozu', '/.hozu/', '.hozu/*', '/.hozu/*'])

/** 0.11 → 0.12 (ADR 0050 D): the app's `.gitignore` lists `.hozu/`, where 0.12 keeps its caches. */
export function ignoreHozu(dir: string, write: boolean): { file: string; edits: number }[] {
  const file = join(dir, '.gitignore')
  const text = existsSync(file) ? readFileSync(file, 'utf8') : ''
  if (text.split(/\r?\n/).some((line) => IGNORES.has(line.trim()))) return []
  if (write) writeFileSync(file, `${text}${text && !text.endsWith('\n') ? '\n' : ''}.hozu/\n`)
  return [{ file: '.gitignore', edits: 1 }]
}
