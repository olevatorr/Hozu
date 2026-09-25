import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { exportStatic } from '@tenon/adapter-static'
import { buildProject } from '@tenon/core/ir'
import { describe, expect, it } from 'vitest'
import { createResolvers } from '../../../examples/cart/server.ts'
import project from '../../../examples/cart/tenon.config.ts'

describe('static export', () => {
  it('writes cacheable pages and reports the rest', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'tenon-static-'))
    const result = await exportStatic({
      build: buildProject(project, { sources: false }),
      resolvers: createResolvers(),
      outDir,
    })
    expect(result.written).toEqual([join(outDir, 'order/placed/index.html')])
    expect(result.skipped).toEqual([{ route: 'home', reason: 'per-request regions: cart.getCart' }])
    const html = await readFile(join(outDir, 'order/placed/index.html'), 'utf8')
    expect(html).toContain('T-shirt')
    expect(html).not.toContain('<script')
  })
})
