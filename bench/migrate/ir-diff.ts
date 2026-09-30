import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const [before, after] = process.argv.slice(2)
const diff = (a: unknown, b: unknown, path: string, out: string[]) => {
  if (JSON.stringify(a) === JSON.stringify(b)) return
  if (
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    a === null ||
    b === null ||
    Array.isArray(a) !== Array.isArray(b)
  ) {
    out.push(
      `${path}\n    was ${JSON.stringify(a)?.slice(0, 300)}\n    now ${JSON.stringify(b)?.slice(0, 300)}`,
    )
    return
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  const x = a as Record<string, unknown>
  const y = b as Record<string, unknown>
  for (const k of keys) diff(x[k], y[k], `${path}/${k}`, out)
}
for (const file of readdirSync(before!)) {
  const out: string[] = []
  diff(
    JSON.parse(readFileSync(join(before!, file), 'utf8')),
    JSON.parse(readFileSync(join(after!, file), 'utf8')),
    '',
    out,
  )
  if (out.length) console.log(`## ${file} (${out.length})\n  ${out.join('\n  ')}`)
}
