import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Ajv } from 'ajv'
import { afterAll, describe, expect, it } from 'vitest'
import { main } from '../src/main.ts'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const schema = JSON.parse(readFileSync(`${root}packages/cli/schema/export.schema.json`, 'utf8'))
const outs: string[] = []
afterAll(() => {
  for (const dir of outs) rmSync(dir, { recursive: true, force: true })
})

async function exportOf(example: string) {
  const out = join(root, '.tmp', `export-${example}-${Date.now()}`)
  outs.push(out)
  let text = ''
  const code = await main(['export', '--out', out, '--json'], join(root, 'examples', example), (s) => {
    text += s
  })
  return { code, out, result: JSON.parse(text) }
}

describe('hozu export (ADR 0059 H)', () => {
  it('writes a browser-only app for a static host, with .nojekyll for GitHub Pages', async () => {
    const { code, out, result } = await exportOf('stars')
    expect(new Ajv({ strict: false }).validate(schema, result)).toBe(true)
    expect([code, result.skipped, result.needsServer]).toEqual([0, [], []])
    expect(existsSync(join(out, 'index.html'))).toBe(true)
    expect(existsSync(join(out, '.nojekyll'))).toBe(true)
    expect(result.written.some((f: string) => f.endsWith('sitemap.xml'))).toBe(true)
  }, 60_000)

  it('fails and names the pages a static host cannot serve', async () => {
    const { code, result } = await exportOf('cart')
    expect(code).toBe(1)
    expect(result.skipped).toContainEqual({ route: 'home', reason: 'per-request regions: cart.getCart' })
  }, 60_000)

  it('refuses to empty the app directory', async () => {
    const lines: string[] = []
    const code = await main(['export', '--out', '.'], join(root, 'examples', 'cart'), (s) => lines.push(s))
    expect(code).not.toBe(0)
    expect(existsSync(join(root, 'examples/cart/hozu.config.ts'))).toBe(true)
  })
})
