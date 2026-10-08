import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Ajv } from 'ajv'
import { afterAll, describe, expect, it } from 'vitest'
import { findBrowser } from '../src/cdp.ts'
import { main } from '../src/main.ts'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const ajv = new Ajv({ allErrors: true, strict: false })
const schema = (name: string) =>
  JSON.parse(readFileSync(`${root}packages/cli/schema/${name}.schema.json`, 'utf8'))
const copies: string[] = []
afterAll(() => {
  for (const dir of copies) rmSync(dir, { recursive: true, force: true })
})

function throwingBookmarks() {
  const copy = `${root}.tmp/server-errors-${Date.now()}-${Math.random().toString(36).slice(2)}`
  copies.push(copy)
  mkdirSync(copy, { recursive: true })
  cpSync(`${root}examples/bookmarks`, copy, { recursive: true, filter: (f) => !f.includes('node_modules') })
  symlinkSync(`${root}examples/bookmarks/node_modules`, `${copy}/node_modules`)
  const entry = `${copy}/app.ts`
  const source = readFileSync(entry, 'utf8')
  const edited = source
    .replace(
      'implement(listBookmarks, () => demoBookmarks.map((b) => ({ ...b }))),',
      "implement(listBookmarks, () => {\n      throw new Error('the database is down')\n    }),",
    )
    .replace(
      'implement(getBookmark, ({ id }, { fail }) => {',
      "$&\n      if (id === 'b1') throw new Error('the row is locked')",
    )
  expect(edited).not.toBe(source)
  writeFileSync(entry, edited)
  return copy
}

async function run(args: string[], cwd: string) {
  let stdout = ''
  const code = await main(args, cwd, (s) => {
    stdout += s
  })
  return { code, stdout }
}

const production = '(a production server shows "Internal error" here; onError keeps the message)'
const times = (text: string, part: string) => text.split(part).length - 1

const expected = { message: 'the database is down', effect: 'bookmarks.listBookmarks' }

describe('server errors per step (ADR 0069 A2)', () => {
  it('hozu get lists what onError received for each request', async () => {
    const app = throwingBookmarks()
    const { stdout } = await run(['get', '/', '--json'], app)
    const out = JSON.parse(stdout)
    expect(ajv.validate(schema('request'), out), JSON.stringify(ajv.errors)).toBe(true)
    expect(out.steps[0].serverErrors).toEqual([expect.objectContaining(expected)])
    const human = await run(['get', '/'], app)
    expect(human.stdout).toContain(
      `  server error: the database is down (bookmarks.listBookmarks)\n  ${production}\n`,
    )
    const twice = await run(['get', '/', '/bookmarks/b1'], app)
    expect(times(twice.stdout, 'server error:')).toBe(2)
    expect(times(twice.stdout, production)).toBe(1)
    expect(JSON.stringify(out)).not.toContain('production server')
    const calm = await run(['get', '/', '--json'], `${root}examples/bookmarks`)
    expect(JSON.parse(calm.stdout).steps[0].serverErrors).toEqual([])
    expect((await run(['get', '/'], `${root}examples/bookmarks`)).stdout).not.toContain(production)
  }, 60_000)

  it.skipIf(!findBrowser())(
    'hozu browse lists them on the step that caused them, and as errors when the page opened with them',
    async () => {
      const app = throwingBookmarks()
      const args = ['browse', '/', '--js', 'on', '--do', 'goto /bookmarks/b2', '--do', 'goto /bookmarks/b1']
      const { stdout, code } = await run([...args, '--json'], app)
      const out = JSON.parse(stdout)
      expect(ajv.validate(schema('browse'), out), JSON.stringify(ajv.errors)).toBe(true)
      expect(code).toBe(1)
      expect(out.steps[0].modes[0].serverErrors).toBeUndefined()
      expect(out.steps[1].modes[0].serverErrors).toContainEqual(
        expect.objectContaining({ message: 'the row is locked', effect: 'bookmarks.getBookmark' }),
      )
      expect(out.errors.filter((e: { kind: string }) => e.kind === 'server')).toEqual([
        expect.objectContaining({ kind: 'server', text: 'the database is down (bookmarks.listBookmarks)' }),
      ])
      const human = await run(args, app)
      expect(human.stdout).toContain('      server error: the row is locked (bookmarks.getBookmark)')
      expect(human.stdout).toContain('  error (server): the database is down (bookmarks.listBookmarks)')
      expect(human.stdout).toContain(
        `      server error: the row is locked (bookmarks.getBookmark)\n      ${production}\n`,
      )
      expect(times(human.stdout, production)).toBe(1)
      expect(stdout).not.toContain('production server')
    },
    60_000,
  )
})
