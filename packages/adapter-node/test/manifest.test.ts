import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from '@tenonkit/adapter-node'
import { buildProject, type Manifest } from '@tenonkit/core/ir'
import { describe, expect, it } from 'vitest'
import { createResolvers } from '../../../examples/cart/server.ts'
import project from '../../../examples/cart/tenon.config.ts'

const cart = fileURLToPath(new URL('../../../examples/cart/', import.meta.url))
const cli = fileURLToPath(new URL('../../cli/bin/tenon.js', import.meta.url))

describe('tenon build output on Node (ADR 0016)', () => {
  it('serves dist/public next to pages built from the manifest, and rejects a stale manifest', async () => {
    const out = mkdtempSync(join(tmpdir(), 'tenon-dist-'))
    const built = spawnSync(process.execPath, [cli, 'build', '--out', out], { cwd: cart, encoding: 'utf8' })
    expect(built.status, built.stderr).toBe(0)
    const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8')) as Manifest
    expect(manifest.images).toBeNull()
    const build = buildProject(project, { sources: false, manifest })
    const server = createServer({
      build,
      manifest,
      resolvers: createResolvers(),
      publicDir: join(out, 'public'),
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    try {
      const html = await (await fetch(`${base}/`)).text()
      const href = /<link rel="stylesheet" href="([^"]+)">/.exec(html)?.[1]
      expect(href).toBe(manifest.styles!.href)
      const css = await fetch(`${base}${href}`)
      expect([css.status, css.headers.get('content-type'), css.headers.get('cache-control')]).toEqual([
        200,
        'text/css',
        'public, max-age=31536000, immutable',
      ])
      const client = await fetch(`${base}/_tenon/client.js`)
      expect([client.status, client.headers.get('content-type')]).toEqual([200, 'text/javascript'])
      expect((await fetch(`${base}/_tenon/..%2F..%2Fpackage.json`)).status).toBe(404)
    } finally {
      server.close()
    }
    expect(() =>
      createServer({ build, manifest: { ...manifest, irHash: 'stale' }, resolvers: createResolvers() }),
    ).toThrow('run `tenon build` again')
  }, 30_000)
})
