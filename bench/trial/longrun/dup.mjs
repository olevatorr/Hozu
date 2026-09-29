import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { codeFiles, show } from './code.mjs'

const WINDOW = 5
const keep = (l) => l && !/^[\])}>;,]*$/.test(l) && !/^import\b/.test(l) && !/^(\/\/|\/\*|\*)/.test(l)

export function duplication(cwd, ref = 'HEAD') {
  const files = codeFiles(cwd, ref).map((f) => ({
    f,
    lines: show(cwd, ref, f)
      .split('\n')
      .map((l) => l.trim().replace(/\s+/g, ' '))
      .filter(keep),
  }))
  const seen = new Map()
  for (const { f, lines } of files)
    for (let i = 0; i + WINDOW <= lines.length; i++) {
      const h = createHash('sha1')
        .update(lines.slice(i, i + WINDOW).join('\n'))
        .digest('hex')
      const at = seen.get(h) ?? []
      at.push([f, i])
      seen.set(h, at)
    }
  const dup = new Set()
  let blocks = 0
  for (const at of seen.values()) {
    if (at.length < 2) continue
    blocks++
    for (const [f, i] of at) for (let k = 0; k < WINDOW; k++) dup.add(`${f}:${i + k}`)
  }
  const total = files.reduce((n, x) => n + x.lines.length, 0)
  return {
    lines: total,
    duplicatedLines: dup.size,
    ratio: total ? +(dup.size / total).toFixed(4) : 0,
    blocks,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(JSON.stringify(duplication(process.argv[2], process.argv[3])))
