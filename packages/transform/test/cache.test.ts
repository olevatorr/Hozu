import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { initialize, load } from '../src/hook.ts'
import { transform } from '../src/transform.ts'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) return []
    return statSync(path).isDirectory() ? sources(path) : path.endsWith('.ts') ? [path] : []
  })

const through = async (file: string) => {
  const text = readFileSync(file, 'utf8')
  const out = await load(pathToFileURL(file).href, {}, async () => ({
    format: 'module-typescript',
    source: text,
  }))
  return String(out.source)
}

describe('the transform cache (ADR 0050 D)', () => {
  it('returns exactly what the transform returns, cold and warm, for every example source', async () => {
    const cache = mkdtempSync(join(tmpdir(), 'hozu-transform-'))
    initialize({ cache })
    const files = sources(join(root, 'examples'))
    expect(files.length).toBeGreaterThan(50)
    for (const file of files) {
      const expected = transform(readFileSync(file, 'utf8')).code
      expect(await through(file)).toBe(expected)
      expect(await through(file)).toBe(expected)
    }
    const written = readdirSync(cache)
    expect(written.length).toBeGreaterThan(10)
    expect(written.every((f) => f.endsWith('.js'))).toBe(true)
    expect(existsSync(join(cache, written[0]!))).toBe(true)
  })
})
