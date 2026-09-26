import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInContext } from 'node:vm'
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'

const cart = fileURLToPath(new URL('../../../examples/cart/', import.meta.url))
const cli = fileURLToPath(new URL('../../cli/bin/tenon.js', import.meta.url))
const bun = process.env.BUN_PATH ?? 'bun'
const hasBun = spawnSync(bun, ['--version']).status === 0

const tenonBuild = () => {
  const out = mkdtempSync(join(tmpdir(), 'tenon-edge-'))
  const built = spawnSync(process.execPath, [cli, 'build', '--out', out], { cwd: cart, encoding: 'utf8' })
  expect(built.status, built.stderr).toBe(0)
  return out
}

const web = {
  Request,
  Response,
  Headers,
  URL,
  URLSearchParams,
  ReadableStream,
  TextEncoder,
  TextDecoder,
  FormData,
  File,
  Blob,
  AbortController,
  crypto,
  atob,
  btoa,
  structuredClone,
  queueMicrotask,
  setTimeout,
  clearTimeout,
  console,
}

describe('edge build (ADR 0016)', () => {
  it('bundles without node: imports and serves the cart from web globals only', async () => {
    const out = mkdtempSync(join(tmpdir(), 'tenon-edge-'))
    const built = spawnSync(process.execPath, [cli, 'build', '--out', out, '--json'], {
      cwd: cart,
      encoding: 'utf8',
    })
    expect(built.status, built.stderr).toBe(0)
    const entry = join(out, 'entry.ts')
    writeFileSync(
      entry,
      `import manifest from './manifest.json' with { type: 'json' }\nimport { createEdge } from '${join(cart, 'edge.ts')}'\nexport default createEdge(manifest)\n`,
    )
    const result = await build({
      entryPoints: [entry],
      bundle: true,
      platform: 'neutral',
      format: 'iife',
      globalName: 'edge',
      mainFields: ['module', 'main'],
      define: { 'import.meta.url': '"https://edge.example/worker.js"' },
      metafile: true,
      write: false,
      logLevel: 'silent',
    })
    expect(Object.keys(result.metafile.inputs).filter((f) => f.startsWith('node:'))).toEqual([])
    const context: Record<string, unknown> = { ...web }
    context.globalThis = context
    runInContext(result.outputFiles[0]!.text, (await import('node:vm')).createContext(context))
    const { fetch } = (context.edge as { default: { fetch(r: Request): Promise<Response> } }).default
    expect(context.process).toBeUndefined()

    const home = await fetch(new Request('https://cart.example/', { headers: { cookie: 'user=ada' } }))
    expect(home.status).toBe(200)
    expect(home.headers.get('content-security-policy')).toContain("script-src 'self' 'sha256-")
    const html = await home.text()
    expect(html).toContain('<h2>Products</h2>')
    expect(html).toContain('href="/_tenon/styles.')

    const added = await fetch(
      new Request('https://cart.example/_tenon/effect', {
        method: 'POST',
        headers: { cookie: 'user=ada', 'content-type': 'application/json' },
        body: JSON.stringify({ effect: 'cart.addItem', input: { sku: 'mug', qty: 2 }, keys: [] }),
      }),
    )
    const body = (await added.json()) as { result: { ok: boolean } }
    expect(body.result, JSON.stringify(body)).toMatchObject({ ok: true })
    const again = await (
      await fetch(new Request('https://cart.example/', { headers: { cookie: 'user=ada' } }))
    ).text()
    expect(again.replace(/<!--[^>]*-->/g, '')).toContain('Mug × 2')
    expect((await fetch(new Request('https://cart.example/products/mug/'))).headers.get('location')).toBe(
      '/products/mug',
    )
  }, 30_000)

  it.skipIf(!hasBun)(
    'serves the same entry on Bun',
    async () => {
      const out = tenonBuild()
      const entry = join(out, 'serve.ts')
      writeFileSync(
        entry,
        `import manifest from './manifest.json' with { type: 'json' }\nimport { createEdge } from '${join(cart, 'edge.ts')}'\nconst server = Bun.serve({ port: 0, fetch: createEdge(manifest).fetch })\nconsole.log(server.port)\n`,
      )
      const child = spawn(bun, [entry], { cwd: cart })
      try {
        const port = await new Promise<string>((resolve, reject) => {
          child.stdout.once('data', (d: Buffer) => resolve(d.toString().trim()))
          child.stderr.once('data', (d: Buffer) => reject(new Error(d.toString())))
        })
        const home = await fetch(`http://127.0.0.1:${port}/`)
        expect(home.status).toBe(200)
        expect(await home.text()).toContain('<h2>Products</h2>')
        const product = await fetch(`http://127.0.0.1:${port}/products/mug`)
        expect(await product.text()).toContain('Mug — $12')
      } finally {
        child.kill()
      }
    },
    30_000,
  )
})
