import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { findBrowser } from '../src/cdp.ts'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const cart = `${root}examples/cart`
const bin = `${root}packages/cli/bin/hozu.js`
const env = { SESSION_SECRET: 'x'.repeat(40), STOCK_LIMIT: '10' }

const build = (target: string, out: string) => {
  const r = spawnSync(process.execPath, [bin, 'build', '--target', target, '--out', out, '--json'], {
    cwd: cart,
    encoding: 'utf8',
  })
  expect(r.status, r.stderr || r.stdout).toBe(0)
  return JSON.parse(r.stdout)
}

describe('hozu build --target (ADR 0073 A)', () => {
  it('workers: one bundled worker.mjs with no node: imports, its assets, and wrangler.jsonc with the KV binding', async () => {
    const out = mkdtempSync(join(tmpdir(), 'hozu-workers-'))
    const result = build('workers', out)
    expect(result.needs).toEqual([
      'SESSION_SECRET (32+ characters): signs the session cookie',
      'server env: STOCK_LIMIT',
      'a KV namespace bound as SESSIONS: npx wrangler kv namespace create SESSIONS, then its id in wrangler.jsonc',
    ])
    const worker = readFileSync(join(out, 'worker.mjs'), 'utf8')
    expect(worker).not.toMatch(/from ["']node:|require\(["']node:/)
    expect(existsSync(join(out, 'assets/_hozu/client.js'))).toBe(true)
    const wrangler = JSON.parse(readFileSync(join(out, 'wrangler.jsonc'), 'utf8'))
    expect(wrangler).toMatchObject({ main: 'worker.mjs', assets: { directory: 'assets' } })
    expect(wrangler.kv_namespaces[0].binding).toBe('SESSIONS')
    const mod = await import(pathToFileURL(join(out, 'worker.mjs')).href)
    const page = await mod.default.fetch(new Request('http://localhost/products/mug'), env)
    expect([page.status, (await page.text()).includes('<title>Mug')]).toEqual([200, true])
  }, 120_000)

  it('vercel: the Build Output API layout with an edge function that answers', async () => {
    const out = mkdtempSync(join(tmpdir(), 'hozu-vercel-'))
    build('vercel', out)
    expect(JSON.parse(readFileSync(join(out, 'config.json'), 'utf8'))).toEqual({
      version: 3,
      routes: [{ handle: 'filesystem' }, { src: '/(.*)', dest: '/index' }],
    })
    expect(JSON.parse(readFileSync(join(out, 'functions/index.func/.vc-config.json'), 'utf8'))).toEqual({
      runtime: 'edge',
      entrypoint: 'index.js',
    })
    expect(existsSync(join(out, 'static/_hozu/client.js'))).toBe(true)
    Object.assign(process.env, env)
    const mod = await import(pathToFileURL(join(out, 'functions/index.func/index.js')).href)
    expect((await mod.default(new Request('http://localhost/'))).status).toBe(200)
  }, 120_000)

  it('rejects an unknown target and points a static host at hozu export', () => {
    const r = spawnSync(process.execPath, [bin, 'build', '--target', 'static'], {
      cwd: cart,
      encoding: 'utf8',
    })
    expect(r.status).not.toBe(0)
    expect(r.stdout + r.stderr).toContain('(a static host: hozu export)')
  })
})

describe.skipIf(!findBrowser())('hozu browse --build (ADR 0073 A3)', () => {
  it('drives the bundled worker, its static files and a session issued into its KV', () => {
    const out = mkdtempSync(join(tmpdir(), 'hozu-built-'))
    build('workers', out)
    const r = spawnSync(
      process.execPath,
      [
        bin,
        'browse',
        '/',
        '--build',
        out,
        '--session',
        '{"userId":"ada"}',
        '--do',
        'click Add in "Mug"',
        '--json',
      ],
      { cwd: cart, encoding: 'utf8', env: { ...process.env, ...env } },
    )
    const result = JSON.parse(r.stdout)
    expect(result.hydrated).toBe(true)
    expect(result.steps[0].modes[0].added).toContain('Mug × 1')
  }, 120_000)
})

describe('hozu build --target never empties the app (ADR 0073 A1)', () => {
  it('refuses an output that holds the app, and a full folder it did not write', () => {
    const here = spawnSync(process.execPath, [bin, 'build', '--target', 'workers', '--out', '.'], {
      cwd: cart,
      encoding: 'utf8',
    })
    expect(here.status).not.toBe(0)
    expect(here.stdout + here.stderr).toContain('holds the app')
    expect(existsSync(join(cart, 'hozu.config.ts'))).toBe(true)
    const full = mkdtempSync(join(tmpdir(), 'hozu-full-'))
    spawnSync('sh', ['-c', `echo keep > ${join(full, 'notes.txt')}`])
    const other = spawnSync(process.execPath, [bin, 'build', '--target', 'vercel', '--out', full], {
      cwd: cart,
      encoding: 'utf8',
    })
    expect(other.status).not.toBe(0)
    expect(existsSync(join(full, 'notes.txt'))).toBe(true)
  })
})

describe('a deploy that cannot work says why (ADR 0075)', () => {
  const app = `${root}packages/cli/test/fixtures/edge-node`
  const fake = join(app, 'node_modules/fakedb')
  spawnSync('mkdir', ['-p', fake])
  spawnSync('sh', [
    '-c',
    `printf '{ "name": "fakedb", "type": "module", "main": "index.js" }' > ${join(fake, 'package.json')} && printf "import net from 'net'\\nimport tls from 'tls'\\nexport const connect = () => typeof net + typeof tls\\n" > ${join(fake, 'index.js')}`,
  ])
  const run = (args: string[]) => spawnSync(process.execPath, [bin, ...args], { cwd: app, encoding: 'utf8' })

  it('names the chain from the app file to each Node built-in, leaves no folder, and is a build error', () => {
    const out = mkdtempSync(join(tmpdir(), 'hozu-edge-node-'))
    const r = run(['build', '--target', 'workers', '--out', out, '--json'])
    expect(r.status).not.toBe(0)
    const error = JSON.parse(r.stdout).error
    expect(error.code).toBe('build')
    expect(error.message).toContain('server/db.ts → fakedb → net, tls')
    expect(error.message).toContain('server/db.ts → fs/promises')
    expect(error.suggestions[0]).toContain('hozu build --target node')
    expect(existsSync(out)).toBe(false)
  }, 120_000)

  it('hozu build says which targets can serve the app before one is chosen', () => {
    const out = mkdtempSync(join(tmpdir(), 'hozu-edge-plain-'))
    const r = run(['build', '--out', out])
    expect(r.stdout).toContain('targets: node can serve this app; workers and vercel cannot')
    expect(r.stdout).toContain('server/db.ts → fakedb → net, tls')
  }, 120_000)

  it('--target node names env values on this machine, which a container cannot reach', () => {
    const out = mkdtempSync(join(tmpdir(), 'hozu-node-env-'))
    spawnSync('sh', [
      '-c',
      `printf 'DATABASE_URL=mysql://u:secret@127.0.0.1:3306/db\\n' > ${join(app, '.env')}`,
    ])
    try {
      const r = run(['build', '--target', 'node', '--out', out, '--json'])
      const needs: string[] = JSON.parse(r.stdout).needs
      expect(
        needs.some((n) => n.startsWith('DATABASE_URL points at this machine (mysql://…@127.0.0.1:3306/db)')),
      ).toBe(true)
    } finally {
      spawnSync('rm', ['-f', join(app, '.env')])
    }
  })
})
