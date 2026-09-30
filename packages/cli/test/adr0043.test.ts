import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { createApp } from 'create-hozu'
import { afterAll, describe, expect, it } from 'vitest'
import { namesOf, server } from '../src/commands/scaffold.ts'
import { main } from '../src/main.ts'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const created: string[] = []
afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true })
})

async function authApp() {
  const dir = join(root, '.tmp', `adr0043-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dirname(dir), { recursive: true })
  await createApp(dir, {
    name: 'adr0043',
    agent: 'claude',
    version: '0.2.0',
    runner: 'npx',
    skillSource: `${root}.claude/skills/hozu`,
  })
  created.push(dir)
  expect(await main(['add', 'feature', 'notes', '--page', '/', '--with', 'auth'], dir, () => {})).toBe(0)
  return dir
}

const hozu = (args: string[], cwd: string) =>
  promisify(execFile)(process.execPath, [`${root}packages/cli/bin/hozu.js`, ...args, '--json'], { cwd })
    .then((r) => ({ code: 0, out: JSON.parse(r.stdout) }))
    .catch((e: { code: number; stdout: string }) => ({ code: e.code, out: JSON.parse(e.stdout) }))

describe('ADR 0043 B (scaffold)', () => {
  it.fails('ADR 0043 D9d: the query resolvers scaffolded by --with auth never write', () => {
    const n = namesOf('notes')
    const source = stripTypeScriptTypes(
      server(n, { auth: true, detail: true, toggle: true, filter: true, remove: true }),
    )
      .replace(/^import .*$/gm, '')
      .replace('export function', 'function')
    const writes: unknown[] = []
    class Watched<K, V> extends Map<K, V> {
      override set(key: K, value: V) {
        writes.push(key)
        return super.set(key, value)
      }
    }
    const decls = [n.list, n.get, n.add, n.toggle, n.remove]
    const list = new Function('Map', 'implement', ...decls, `${source}\nreturn ${n.resolvers}(implement)`)(
      Watched,
      (decl: string, impl: unknown) => [decl, impl],
      ...decls,
    ) as [string, (input: unknown, ctx: unknown) => unknown][]
    const impl = new Map(list)
    const ctx = { session: { user: 'zed' }, fail: (error: string) => ({ error }) }
    impl.get(n.list)!({}, ctx)
    impl.get(n.get)!({ id: 'n1' }, ctx)
    expect(writes).toEqual([])
  })
})

describe('ADR 0043 D and J (tools)', () => {
  it.fails('ADR 0043 D: hozu check reports a missing resolver as HZ021 with a location', async () => {
    const app = await authApp()
    const file = join(app, 'features/notes/server.ts')
    const text = readFileSync(file, 'utf8')
    const without = text.replace(/ {4}implement\(listNotes,[\s\S]*?\n {4}\),\n/, '')
    expect(without).not.toBe(text)
    writeFileSync(file, without)
    const check = await hozu(['check'], app)
    const d = check.out.validate?.diagnostics?.find((x: { code: string }) => x.code === 'HZ021')
    expect(d?.location?.pointer).toBe('/features/notes/queries/listNotes')
    expect(check.code).toBe(1)
  }, 90_000)

  it.fails('ADR 0043 J: hozu get exits 1 without rendering when the build has errors', async () => {
    const app = await authApp()
    const file = join(app, 'features/notes/model.ts')
    const text = readFileSync(file, 'utf8')
    writeFileSync(file, text.replace("freshness: 'static'", 'freshness: { revalidate: 0 }'))
    const check = await hozu(['check'], app)
    expect(check.out.validate.summary.errors).toBeGreaterThan(0)
    const page = await hozu(['get', '/login'], app)
    expect([page.code, page.out.steps]).toEqual([1, undefined])
  }, 90_000)

  it.fails('ADR 0043 R4: a missing lock in a project with a machine is HZ057, not a skipped review', async () => {
    const app = await authApp()
    rmSync(join(app, 'hozu.lock.json'), { force: true })
    expect(existsSync(join(app, 'hozu.lock.json'))).toBe(false)
    const check = await hozu(['check'], app)
    const codes = (check.out.validate?.diagnostics ?? []).map((d: { code: string }) => d.code)
    expect({ code: check.code, lock: check.out.validate?.lock, codes }).toMatchObject({
      code: 1,
      codes: expect.arrayContaining(['HZ057']),
    })
  }, 90_000)
})
