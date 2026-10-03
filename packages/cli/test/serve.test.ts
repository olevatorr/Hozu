import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from 'create-hozu'
import { afterAll, describe, expect, it } from 'vitest'
import { runServe } from '../src/commands/serve.ts'
import { load } from '../src/load.ts'
import { main } from '../src/main.ts'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const created: string[] = []
afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true })
})

const fresh = async () => {
  const dir = join(root, '.tmp', `serve-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await createApp(dir, {
    name: 'serve',
    agent: 'claude',
    version: '0.2.0',
    runner: 'npx',
    skillSource: `${root}.claude/skills/hozu`,
  })
  created.push(dir)
  return dir
}

const check = async (cwd: string) => {
  let text = ''
  const code = await main(['check', '--json'], cwd, (s) => {
    text += s
  })
  return { code, out: JSON.parse(text) }
}

describe('one app module (ADR 0043 E)', () => {
  it('hozu serve runs the app module with adapter-node on PORT', async () => {
    const lines: string[] = []
    process.env.PORT = '4793'
    const server = await runServe(await load(undefined, join(root, 'examples/notes')), (l) => lines.push(l))
    delete process.env.PORT
    try {
      expect(lines).toEqual(['Notes on http://localhost:4793'])
      const signedOut = await fetch('http://localhost:4793/', { redirect: 'manual' })
      expect([signedOut.status, signedOut.headers.get('location')]).toEqual([303, '/login'])
      const login = await fetch('http://localhost:4793/login')
      expect(login.headers.get('content-security-policy')).toContain("default-src 'self'")
      expect(await login.text()).toContain('Sign in')
    } finally {
      await server.close()
    }
  }, 60_000)

  it('hozu serve says the port is in use instead of crashing', async () => {
    const notes = await load(undefined, join(root, 'examples/notes'))
    process.env.PORT = '4794'
    const first = await runServe(notes, () => {})
    try {
      await expect(runServe(notes, () => {})).rejects.toThrow('Port 4794 is in use')
    } finally {
      delete process.env.PORT
      await first.close()
    }
  }, 60_000)

  it('the scaffold starts with hozu serve and checks clean', async () => {
    const app = await fresh()
    const pkg = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'))
    expect(pkg.scripts.start).toBe('hozu serve')
    expect(readFileSync(join(app, 'app.ts'), 'utf8')).toContain('export default app({')
    const { code, out } = await check(app)
    expect([code, out.validate.summary]).toEqual([0, { errors: 0, warnings: 0 }])
  }, 60_000)

  it('HZ045: a default export that is not app(…), or no app module at all, is an error counted by check', async () => {
    const app = await fresh()
    const entry = join(app, 'app.ts')
    writeFileSync(entry, readFileSync(entry, 'utf8').replace('export default app({', 'export default ({'))
    const wrong = await check(app)
    const d = wrong.out.validate.diagnostics.find((x: { code: string }) => x.code === 'HZ045')
    expect([wrong.code, d?.severity, d?.message, wrong.out.validate.summary.errors]).toEqual([
      1,
      'error',
      'The default export of app.ts is not app(…)',
      1,
    ])
    expect(d?.fix?.snippet).toContain('export default app({ resolvers')
    const other = await fresh()
    const config = join(other, 'hozu.config.ts')
    writeFileSync(
      config,
      readFileSync(config, 'utf8').replace("  app: new URL('./app.ts', import.meta.url),\n", ''),
    )
    const none = await check(other)
    expect(none.out.validate.diagnostics.map((x: { message: string }) => x.message)).toContain(
      'project({ app }) names no app module',
    )
    expect(none.code).toBe(1)
  }, 90_000)
})
