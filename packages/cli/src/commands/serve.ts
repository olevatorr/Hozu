import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { BuildResult, IsolatedUse } from '@hozu/core/ir'
import { HozuCliError } from '../errors.ts'
import type { Loaded } from '../load.ts'
import { devPreviews, loadPreviews, renderUse } from '../previews.ts'
import { DISPOSE_MS, disposeApps, importer, requireApp } from './app.ts'

interface Listening {
  listen(port: number, ...rest: [string, () => void] | [() => void]): unknown
  close(done: () => void): unknown
  once(event: 'error', listener: (error: { code?: string }) => void): unknown
}

export async function runServe(
  loaded: Loaded,
  log: (line: string) => void,
): Promise<{ url: string; close(): Promise<void> }> {
  if (process.env.HOZU_DEV !== '1' && !process.env.NODE_ENV) process.env.NODE_ENV = 'production'
  const importFrom = importer(loaded, 'serve')
  const build = loaded.build()
  const module = await requireApp(loaded, 'serve', build)
  const root = dirname(loaded.path)
  const { createServer } = await importFrom<{ createServer(app: unknown, host: object): Listening }>(
    '@hozu/adapter-node',
  )
  const { compileStyles } = await importFrom<{
    compileStyles(build: BuildResult, o: { base: string }): Promise<unknown>
  }>('@hozu/css')
  const images = await importFrom<{ optimizeImages(build: BuildResult): Promise<unknown> }>(
    '@hozu/image',
  ).catch(() => null)
  const components = module.options.components ? await module.options.components(build) : null
  for (const d of components?.diagnostics ?? []) log(`${d.code} ${d.message}`)
  if (process.env.HOZU_DEV === '1' && process.connected)
    process.send?.({
      hozuGraph: [
        ...((components as { inputs?: string[] } | null)?.inputs ?? []),
        ...loaded.envFiles.map((f) => join(root, f)),
      ],
    })
  const publicDir = join(root, 'public')
  const server = createServer(module.app, {
    env: process.env,
    ...(process.env.HOZU_DEV === '1'
      ? {
          dev: {
            root,
            previews: await (async () => {
              const { set, problems } = await loadPreviews(loaded)
              for (const p of problems) log(`${p.code} ${p.message} (previews are off)`)
              return devPreviews(loaded, build, set)
            })(),
            render: async (id: string, use: IsolatedUse) => {
              const { ok, html, problems } = await renderUse(loaded, id, use)
              return { ok, html, problems }
            },
          },
        }
      : {}),
    styles: await compileStyles(build, { base: root }),
    ...(components ? { components } : {}),
    ...(images ? { images: await images.optimizeImages(build) } : {}),
    ...(existsSync(publicDir) ? { publicDir } : {}),
  })
  const port = Number(process.env.PORT ?? 3000)
  const host = process.env.HOST ?? (process.env.HOZU_DEV === '1' ? '127.0.0.1' : undefined)
  const name = (build.ir.site?.name ?? 'Hozu').trim() || 'Hozu'
  await new Promise<void>((ready, fail) => {
    server.once('error', (error: { code?: string }) =>
      fail(
        error.code === 'EADDRINUSE'
          ? new HozuCliError('usage', `Port ${port} is in use`, [
              `PORT=${port + 1} npm start   # another port`,
              `lsof -ti:${port}   # what holds it`,
            ])
          : error,
      ),
    )
    if (host) server.listen(port, host, ready)
    else server.listen(port, ready)
  })
  const url = `http://${host ?? 'localhost'}:${port}`
  const close = async () => {
    await new Promise<void>((done) => {
      server.close(done)
      ;(server as { closeAllConnections?: () => void }).closeAllConnections?.()
      setTimeout(done, DISPOSE_MS).unref()
    })
    await disposeApps(DISPOSE_MS, log)
  }
  const parent = Number(process.env.HOZU_DEV_PARENT)
  if (parent)
    setInterval(() => {
      try {
        process.kill(parent, 0)
      } catch {
        void close().finally(() => process.exit(0))
      }
    }, 500).unref()
  log(`${name} on ${url}${process.env.HOZU_DEV === '1' ? '' : ` · stop: kill ${process.pid}`}`)
  return { url, close }
}
