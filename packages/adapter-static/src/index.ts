import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { planRoute } from '@tenon/compiler'
import type { BuildResult } from '@tenon/core/ir'
import { createDataRuntime, type ResolverSet } from '@tenon/data'
import { clientBundle, fnsModule, renderToString } from '@tenon/runtime-server'

export interface StaticExportOptions {
  build: BuildResult
  resolvers: ResolverSet
  outDir: string
}

export interface StaticExport {
  written: string[]
  skipped: { route: string; reason: string }[]
}

const write = async (file: string, content: string) => {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, content)
}

export async function exportStatic({ build, resolvers, outDir }: StaticExportOptions): Promise<StaticExport> {
  const data = createDataRuntime({ build, resolvers })
  const result: StaticExport = { written: [], skipped: [] }
  let js = false
  for (const route of Object.keys(build.ir.pages).sort()) {
    const { plan } = planRoute(build.ir, route)
    const dynamic = plan.regions.filter((r) => r.mode === 'request')
    if (dynamic.length) {
      result.skipped.push({ route, reason: `per-request regions: ${dynamic.map((r) => r.query).join(', ')}` })
      continue
    }
    const { html } = await renderToString({ build, data, route })
    const file = join(outDir, plan.path.replace(/^\//, ''), 'index.html')
    await write(file, html)
    result.written.push(file)
    js ||= plan.js
  }
  if (js) {
    await write(join(outDir, '_tenon/client.js'), clientBundle())
    await write(join(outDir, '_tenon/fns.js'), fnsModule(build))
    result.written.push(join(outDir, '_tenon/client.js'), join(outDir, '_tenon/fns.js'))
  }
  return result
}
