import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import { feature, project, query } from '@hozu/core'
import { buildProject } from '@hozu/core/ir'
import { createDataRuntime, resolvers } from '@hozu/data'
import { appOptionsOf, createHandler, fnsModule } from '@hozu/runtime-server'
import { zodAdapter } from '@hozu/schema-zod'
import { z } from 'zod'

const [mode, arg] = process.argv.slice(2)
const gc = () => (globalThis as { gc?: () => void }).gc?.()
const heap = () => {
  gc()
  gc()
  return process.memoryUsage().heapUsed
}

async function appProbe(dir: string) {
  const config = (await import(pathToFileURL(join(dir, 'hozu.config.ts')).href)).default
  const started = performance.now()
  const build = buildProject(config, { sources: false })
  const buildMs = performance.now() - started
  const app = (await import(pathToFileURL(join(dir, 'app.ts')).href)).default
  const handlerStarted = performance.now()
  const handler = createHandler({ build, resolvers: appOptionsOf(app)!.resolvers, onError: () => {} })
  const response = await handler.fetch(new Request('http://localhost/f0'))
  const startMs = performance.now() - handlerStarted
  const html = await response.text()
  const payload = JSON.parse(/id="hozu-payload">([\s\S]*?)<\/script>/.exec(html)![1]!)
  const fns = fnsModule(build)
  const ownFns = Object.keys(build.bindings.fns).filter((r) => r.startsWith('f0.')).length
  return {
    buildMs,
    startMs,
    status: response.status,
    html: Buffer.byteLength(html),
    payload: Buffer.byteLength(JSON.stringify(payload)),
    islands: payload.ids.length,
    fnsBytes: Buffer.byteLength(fns),
    fnsGzip: gzipSync(fns).length,
    fnsCount: Object.keys(build.bindings.fns).length,
    pageFnsCount: ownFns,
  }
}

async function cacheProbe(keys: number) {
  const byId = query({
    input: z.object({ id: z.string() }),
    output: z.object({ id: z.string(), title: z.string() }),
    scope: 'public',
    freshness: { revalidate: 3600 },
    runs: 'server',
  })
  const p = project({
    schema: zodAdapter,
    routes: {},
    pages: [],
    features: [feature({ id: 'probe', intent: { summary: 'cache probe' }, declarations: [{ byId }] })],
  })
  const build = buildProject(p, { sources: false })
  const data = createDataRuntime({
    build,
    resolvers: resolvers(p, (implement) => [implement(byId, ({ id }) => ({ id, title: `Item ${id}` }))]),
  })
  const before = heap()
  for (let i = 0; i < keys; i++) await data.query(byId, { id: `k${i}` })
  const after = heap()
  return { keys, entries: data.stats().entries, heapMB: (after - before) / 1024 / 1024 }
}

const out = mode === 'cache' ? await cacheProbe(Number(arg)) : await appProbe(arg!)
process.stdout.write(`${JSON.stringify(out)}\n`)
