import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { BuildResult } from '@hozu/core/ir'
import type { Loaded } from '../load.ts'
import { importer, requireApp } from './app.ts'

interface Listening {
  listen(port: number, ...rest: [string, () => void] | [() => void]): unknown
  close(done: () => void): unknown
}

export async function runServe(
  loaded: Loaded,
  log: (line: string) => void,
): Promise<{ url: string; close(): Promise<void> }> {
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
  const widgets = module.options.widgets ? await module.options.widgets(build) : null
  for (const d of widgets?.diagnostics ?? []) log(`${d.code} ${d.message}`)
  const publicDir = join(root, 'public')
  const server = createServer(module.app, {
    env: process.env,
    styles: await compileStyles(build, { base: root }),
    ...(widgets ? { widgets } : {}),
    ...(images ? { images: await images.optimizeImages(build) } : {}),
    ...(existsSync(publicDir) ? { publicDir } : {}),
  })
  const port = Number(process.env.PORT ?? 3000)
  const host = process.env.HOST
  const name = (build.ir.site?.name ?? 'Hozu').trim() || 'Hozu'
  await new Promise<void>((ready) => (host ? server.listen(port, host, ready) : server.listen(port, ready)))
  const url = `http://${host ?? 'localhost'}:${port}`
  log(`${name} on ${url}`)
  return { url, close: () => new Promise<void>((done) => server.close(done)) }
}
