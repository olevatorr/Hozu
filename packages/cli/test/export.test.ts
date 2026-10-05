import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
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

  it('never empties a folder that holds the app or files it did not write', async () => {
    const parent = join(root, '.tmp', `export-guard-${Date.now()}`)
    outs.push(parent)
    const app = join(parent, 'app')
    cpSync(join(root, 'examples/stars'), app, {
      recursive: true,
      filter: (from) => !/\/(node_modules|\.hozu|dist)(\/|$)/.test(from),
    })
    symlinkSync(join(root, 'examples/stars/node_modules'), join(app, 'node_modules'))
    const tsconfig = join(app, 'tsconfig.json')
    writeFileSync(
      tsconfig,
      readFileSync(tsconfig, 'utf8').replace('../../tsconfig.base.json', join(root, 'tsconfig.base.json')),
    )
    expect(await main(['export', '--out', 'dist'], app, () => {}), 'the copy exports').toBe(0)
    writeFileSync(join(parent, 'sibling.txt'), 'mine')
    mkdirSync(join(parent, 'other'))
    writeFileSync(join(parent, 'other', 'notes.txt'), 'mine')
    for (const out of ['.', '..', 'features', join(parent, 'sibling-dir', '..'), '../other'])
      expect(await main(['export', '--out', out], app, () => {}), out).not.toBe(0)
    expect(readFileSync(join(parent, 'sibling.txt'), 'utf8')).toBe('mine')
    expect(existsSync(join(app, 'hozu.config.ts'))).toBe(true)
    expect(existsSync(join(app, 'features'))).toBe(true)
    expect(readFileSync(join(parent, 'other', 'notes.txt'), 'utf8')).toBe('mine')
  }, 60_000)

  it('exports again into a folder it wrote', async () => {
    const first = await exportOf('stars')
    let text = ''
    const code = await main(
      ['export', '--out', first.out, '--json'],
      join(root, 'examples', 'stars'),
      (s) => {
        text += s
      },
    )
    expect([code, JSON.parse(text).skipped]).toEqual([0, []])
  }, 60_000)
})
