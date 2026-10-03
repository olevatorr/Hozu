import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const VALIDATE = /\bhozu validate(?:\s+(?!-)[\w.-]+)?/g
const GRAPH = /\bhozu graph\b/

/** 0.13 → 0.14 (ADR 0053 B, F): package.json scripts call `hozu check`; `hozu graph` scripts are removed. */
export function rewriteScripts(dir: string, write: boolean): { file: string; edits: number }[] {
  const file = join(dir, 'package.json')
  if (!existsSync(file)) return []
  const text = readFileSync(file, 'utf8')
  const pkg = JSON.parse(text) as { scripts?: Record<string, string> }
  if (!pkg.scripts) return []
  let edits = 0
  const scripts: Record<string, string> = {}
  for (const [name, command] of Object.entries(pkg.scripts)) {
    if (GRAPH.test(command)) {
      edits++
      continue
    }
    const next = command.replace(VALIDATE, 'hozu check')
    const key = name === 'validate' && next === 'hozu check' && !('check' in pkg.scripts) ? 'check' : name
    if (key === name && next === command) scripts[name] = command
    else if (!(key in scripts)) {
      edits++
      scripts[key] = next
    } else edits++
  }
  if (!edits) return []
  if (write) {
    const indent = /^[ \t]+(?=")/m.exec(text)?.[0] ?? '  '
    writeFileSync(file, `${JSON.stringify({ ...pkg, scripts }, null, indent)}\n`)
  }
  return [{ file: 'package.json', edits }]
}
