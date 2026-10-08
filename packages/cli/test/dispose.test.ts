import { type ChildProcess, execFile, spawn } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { createApp } from 'create-hozu'
import { afterAll, describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const bin = `${root}packages/cli/bin/hozu.js`
const created: string[] = []
afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true })
})

async function appHolding(dispose: string) {
  const dir = join(root, '.tmp', `dispose-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await createApp(dir, {
    name: 'dispose',
    agent: 'claude',
    version: '0.2.0',
    runner: 'npx',
    skillSource: `${root}.claude/skills/hozu`,
  })
  created.push(dir)
  const entry = join(dir, 'app.ts')
  writeFileSync(
    entry,
    readFileSync(entry, 'utf8')
      .replace(
        "import project from './hozu.config.ts'\n",
        "$&import { writeFileSync } from 'node:fs'\n\nsetInterval(() => {}, 1000)\n",
      )
      .replace('export default app({\n', `$&  dispose: ${dispose},\n`),
  )
  return dir
}

const hozu = (args: string[], cwd: string) =>
  promisify(execFile)(process.execPath, [bin, ...args], { cwd, timeout: 20_000 })

describe('one-shot commands exit although the app holds handles (ADR 0069 A1)', () => {
  it('get, call and check exit after printing, and run app({ dispose }) first', async () => {
    const app = await appHolding(`() => writeFileSync(new URL('./disposed', import.meta.url), 'yes')`)
    const marker = join(app, 'disposed')
    const page = await hozu(['get', '/', '--json'], app)
    expect(JSON.parse(page.stdout).steps[0].status).toBe(200)
    expect(readFileSync(marker, 'utf8')).toBe('yes')
    rmSync(marker)
    const check = await hozu(['check', '--no-types'], app)
    expect(check.stdout).toContain('0 errors')
    expect(existsSync(marker)).toBe(true)
  }, 60_000)

  it('a dispose that never settles holds the exit only for the short timeout', async () => {
    const app = await appHolding('() => new Promise(() => {})')
    const start = Date.now()
    const page = await hozu(['get', '/'], app)
    expect(page.stdout).toContain('200')
    expect(page.stderr).toContain('app({ dispose }) did not finish within 2000 ms')
    expect(Date.now() - start).toBeLessThan(15_000)
  }, 60_000)

  it('hozu serve runs dispose on SIGTERM and exits', async () => {
    const app = await appHolding(`() => writeFileSync(new URL('./disposed', import.meta.url), 'yes')`)
    const child: ChildProcess = spawn(process.execPath, [bin, 'serve'], {
      cwd: app,
      env: { ...process.env, PORT: '4796', NODE_ENV: 'development' },
    })
    let output = ''
    await new Promise<void>((ready, fail) => {
      child.stdout!.on('data', (d) => {
        output += String(d)
        if (output.includes('http://localhost:4796')) ready()
      })
      child.once('exit', () => fail(new Error(`serve exited: ${output}`)))
    })
    const exited = new Promise<number | null>((done) => child.once('exit', (code) => done(code)))
    child.kill('SIGTERM')
    expect(await exited).toBe(0)
    expect(readFileSync(join(app, 'disposed'), 'utf8')).toBe('yes')
  }, 60_000)
})
