import { existsSync } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { BuildResult } from '@hozu/core/ir'
import type { ExportOutput } from '../contract.ts'
import { HozuCliError } from '../errors.ts'
import type { Loaded } from '../load.ts'
import { requireApp } from './app.ts'

interface StaticModule {
  exportStatic(options: {
    build: BuildResult
    resolvers: unknown
    outDir: string
    styles: unknown
    components: unknown
    images: unknown
    env: Record<string, string | undefined>
  }): Promise<{
    written: string[]
    skipped: { route: string; reason: string }[]
    needsServer: { path: string; effect: string; reason: string }[]
  }>
}

/** `hozu export` (ADR 0059 H): every page that needs no server, written as files for a static host. */
export async function runExport(loaded: Loaded, out: string | undefined, cwd: string): Promise<ExportOutput> {
  const build = loaded.build(false)
  const errors = build.diagnostics.filter((d) => d.severity === 'error')
  if (errors.length)
    throw new HozuCliError('build', `The project has ${errors.length} build errors`, ['Run hozu check'])
  const base = dirname(loaded.path)
  const dir = resolve(cwd, out ?? 'dist')
  if (dir === base || existsSync(join(dir, 'hozu.config.ts')) || existsSync(join(dir, 'package.json')))
    throw new HozuCliError('usage', `hozu export empties its output directory, and ${dir} holds the app`, [
      'hozu export --out dist',
    ])
  const require = createRequire(loaded.path)
  const from = async <T>(id: string): Promise<T> => {
    try {
      return (await import(pathToFileURL(require.resolve(id)).href)) as T
    } catch {
      throw new HozuCliError('build', `hozu export needs ${id} installed in the project`, [
        `npm install ${id}   # or pnpm add / yarn add`,
      ])
    }
  }
  const optional = <T>(id: string): Promise<T | null> => from<T>(id).catch(() => null)
  const { exportStatic } = await from<StaticModule>('@hozu/adapter-static')
  const module = await requireApp(loaded, 'export', build)
  const styles = build.bindings.styles.entry
    ? await (
        await from<{ compileStyles(b: BuildResult, o: { base: string }): Promise<unknown> }>('@hozu/css')
      ).compileStyles(build, { base })
    : null
  const components =
    Object.keys(build.bindings.clients).length + Object.keys(build.bindings.fetches).length
      ? await (
          await from<{ bundleComponents(b: BuildResult): Promise<unknown> }>('@hozu/bundle')
        ).bundleComponents(build)
      : null
  const images = await optional<{ optimizeImages(b: BuildResult): Promise<unknown> }>('@hozu/image').then(
    (m) => (m ? m.optimizeImages(build) : null),
  )
  await rm(dir, { recursive: true, force: true })
  const result = await exportStatic({
    build,
    resolvers: module.options.resolvers,
    outDir: dir,
    styles,
    components,
    images,
    env: process.env,
  })
  await writeFile(join(dir, '.nojekyll'), '')
  const shown = (file: string) => relative(cwd, file) || '.'
  return {
    out: shown(dir),
    written: result.written.map(shown),
    skipped: result.skipped,
    needsServer: result.needsServer,
  }
}

export function describeExport(r: ExportOutput): string {
  const lines = [`✔ wrote ${r.written.length} files to ${r.out}`]
  for (const s of r.skipped) lines.push(`✖ not written: ${s.route} (${s.reason})`)
  for (const n of r.needsServer)
    lines.push(`✖ ${n.path} calls ${n.effect}, which needs a server (${n.reason})`)
  if (r.skipped.length || r.needsServer.length)
    lines.push(
      'A static host cannot serve these: deploy with npm start (Node, Docker) or an edge handler instead (hozu docs deploy)',
    )
  return `${lines.join('\n')}\n`
}
