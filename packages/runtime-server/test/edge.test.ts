import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInContext } from 'node:vm'
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'
import { hozuTransform } from '../../transform/src/esbuild.ts'

const cart = fileURLToPath(new URL('../../../examples/cart/', import.meta.url))
const cli = fileURLToPath(new URL('../../cli/bin/hozu.js', import.meta.url))
const bun = process.env.BUN_PATH ?? 'bun'
const hasBun = spawnSync(bun, ['--version']).status === 0

const hozuBuild = () => {
  const out = mkdtempSync(join(tmpdir(), 'hozu-edge-'))
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

describe('a bundled app with components and fns matches its build manifest (issue #1, ADR 0066)', () => {
  it('reads the component and fn fingerprints from the manifest, so a reprinting bundler does not break it', async () => {
    const bookmarks = fileURLToPath(new URL('../../../examples/bookmarks/', import.meta.url))
    const out = mkdtempSync(join(tmpdir(), 'hozu-issue1-'))
    const built = spawnSync(process.execPath, [cli, 'build', '--out', out], {
      cwd: bookmarks,
      encoding: 'utf8',
    })
    expect(built.status, built.stderr).toBe(0)
    const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'))
    expect(manifest.sources.components).toBeUndefined()
    expect(Object.keys(manifest.sources.fns)).toContain('bookmarks.visible')
    const outfile = join(bookmarks, '.issue1-entry.mjs')
    try {
      await build({
        stdin: {
          contents: `import { createHandler } from '@hozu/runtime-server'\nimport app from './app.ts'\nimport * as render from '${join(out, 'server/render.js')}'\nexport const handler = (manifest: never) => createHandler(app, { manifest, render, env: {} })\n`,
          resolveDir: bookmarks,
          sourcefile: 'entry.ts',
          loader: 'ts',
        },
        outfile,
        bundle: true,
        format: 'esm',
        platform: 'node',
        packages: 'external',
        plugins: [hozuTransform()],
        logLevel: 'silent',
      })
      const { handler } = await import(outfile)
      const response = await handler(manifest).fetch(new Request('http://localhost/'))
      expect(response.status).toBe(200)
      const { sources: _, ...withoutSources } = manifest
      expect(() => handler(withoutSources)).toThrow('The build manifest does not match this project')
    } finally {
      ;(await import('node:fs')).rmSync(outfile, { force: true })
    }
  }, 60_000)
})

describe('@hozu/bundle in an edge bundle (issue #1)', () => {
  it('pulls no Node built-ins or esbuild into a web bundle that imports it', async () => {
    const result = await build({
      stdin: { contents: "export { bundleComponents } from '@hozu/bundle'", resolveDir: cart },
      bundle: true,
      platform: 'neutral',
      format: 'esm',
      mainFields: ['module', 'main'],
      metafile: true,
      write: false,
      logLevel: 'silent',
    })
    expect(
      Object.keys(result.metafile.inputs).filter((f) => f.startsWith('node:') || f.includes('esbuild')),
    ).toEqual([])
  })
})

describe('edge build (ADR 0016)', () => {
  it('bundles without node: imports and serves the cart from web globals only', async () => {
    const out = mkdtempSync(join(tmpdir(), 'hozu-edge-'))
    const built = spawnSync(process.execPath, [cli, 'build', '--out', out, '--json'], {
      cwd: cart,
      encoding: 'utf8',
    })
    expect(built.status, built.stderr).toBe(0)
    expect(readFileSync(join(out, 'server/render.d.ts'), 'utf8')).toContain("RenderModule['default']")
    const entry = join(out, 'entry.ts')
    writeFileSync(
      entry,
      `import manifest from './manifest.json' with { type: 'json' }\nimport * as render from './server/render.js'\nimport { createEdge } from '${join(cart, 'edge.ts')}'\nexport default createEdge(manifest, render)\n`,
    )
    const result = await build({
      entryPoints: [entry],
      bundle: true,
      platform: 'neutral',
      format: 'iife',
      globalName: 'edge',
      mainFields: ['module', 'main'],
      metafile: true,
      plugins: [hozuTransform()],
      write: false,
      logLevel: 'silent',
    })
    expect(Object.keys(result.metafile.inputs).filter((f) => f.startsWith('node:'))).toEqual([])
    const context: Record<string, unknown> = { ...web }
    context.globalThis = context
    runInContext(
      result.outputFiles[0]!.text,
      (await import('node:vm')).createContext(context, { codeGeneration: { strings: false, wasm: false } }),
    )
    const { fetch } = (context.edge as { default: { fetch(r: Request): Promise<Response> } }).default
    expect(context.process).toBeUndefined()

    const home = await fetch(new Request('https://cart.example/', { headers: { cookie: 'user=ada' } }))
    expect(home.status).toBe(200)
    expect(home.headers.get('content-security-policy')).toContain("script-src 'self' 'sha256-")
    const html = await home.text()
    expect(html).toContain('<h2>Products</h2>')
    expect(html).toContain('href="/_hozu/styles.')

    const added = await fetch(
      new Request('https://cart.example/_hozu/effect', {
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
      const out = hozuBuild()
      const entry = join(out, 'serve.ts')
      writeFileSync(
        entry,
        `import manifest from './manifest.json' with { type: 'json' }\nimport * as render from './server/render.js'\nimport { createEdge } from '${join(cart, 'edge.ts')}'\nconst server = Bun.serve({ port: 0, fetch: createEdge(manifest, render).fetch })\nconsole.log(server.port)\n`,
      )
      const bundled = join(out, 'serve.js')
      await build({
        entryPoints: [entry],
        outfile: bundled,
        bundle: true,
        platform: 'neutral',
        format: 'esm',
        mainFields: ['module', 'main'],
        plugins: [hozuTransform()],
        logLevel: 'silent',
      })
      const child = spawn(bun, [bundled], { cwd: cart })
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
