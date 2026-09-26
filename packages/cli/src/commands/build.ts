import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { type BuildResult, hashJson, type ImageSet, type Manifest } from '@hozu/core/ir'
import type { BuildOutput } from '../contract.ts'
import { HozuCliError } from '../errors.ts'
import type { Loaded } from '../load.ts'

interface Stylesheet {
  href: string
  css: string
  assets: Record<string, string>
  preload: string[]
}

interface Widgets {
  urls: Record<string, string>
  files: Record<string, string>
}

interface ServerModule {
  generateRender(build: BuildResult, images: Record<string, { width: number; href: string }[]> | null): string
  staticFiles(
    build: BuildResult,
    options: { styles: Stylesheet | null; widgets: Widgets | null; client: boolean },
  ): { path: string; text: string | null; file: string | null }[]
}

export async function runBuild(loaded: Loaded, out: string | undefined, cwd: string): Promise<BuildOutput> {
  const build = loaded.build(false)
  const errors = build.diagnostics.filter((d) => d.severity === 'error')
  if (errors.length)
    throw new HozuCliError('build', `The project has ${errors.length} build errors`, ['Run hozu validate'])
  const require = createRequire(loaded.path)
  const optional = async <T>(id: string): Promise<T | null> => {
    try {
      return (await import(pathToFileURL(require.resolve(id)).href)) as T
    } catch {
      return null
    }
  }
  const from = async <T>(id: string): Promise<T> => {
    try {
      return (await import(pathToFileURL(require.resolve(id)).href)) as T
    } catch {
      throw new HozuCliError('build', `hozu build needs ${id} installed in the project`, [`pnpm add ${id}`])
    }
  }
  const base = dirname(loaded.path)
  const styles = build.bindings.styles.entry
    ? await (
        await from<{ compileStyles(b: BuildResult, o: { base: string }): Promise<Stylesheet> }>('@hozu/css')
      ).compileStyles(build, { base })
    : null
  const widgets = Object.keys(build.bindings.widgets).length
    ? await (await from<{ bundleWidgets(b: BuildResult): Promise<Widgets> }>('@hozu/bundle')).bundleWidgets(
        build,
      )
    : null
  const images = await optional<{ optimizeImages(b: BuildResult): Promise<ImageSet> }>('@hozu/image').then(
    (m) => (m ? m.optimizeImages(build) : null),
  )
  const server = await from<ServerModule>('@hozu/runtime-server')
  const dir = resolve(cwd, out ?? 'dist')
  const files: string[] = []
  for (const f of server.staticFiles(build, { styles, widgets, client: true })) {
    const file = join(dir, 'public', f.path.replace(/^\//, ''))
    await mkdir(dirname(file), { recursive: true })
    if (f.file) await copyFile(f.file, file)
    else await writeFile(file, f.text ?? '')
    files.push(file)
  }
  for (const [href, bytes] of Object.entries(images?.files ?? {})) {
    const file = join(dir, 'public', href.replace(/^\//, ''))
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, bytes)
    files.push(file)
  }
  const manifest: Manifest = {
    irHash: hashJson(build.ir),
    images: images && Object.keys(images.variants).length ? images.variants : null,
    assets: build.bindings.assetOrder,
    widgets: Object.fromEntries(
      Object.entries(widgets?.urls ?? {}).map(([ref, url]) => {
        const [feature, symbol] = ref.split('.') as [string, string]
        return [ref, { hash: build.ir.features[feature]?.widgets[symbol]?.sourceHash ?? '', url }]
      }),
    ),
    styles: styles ? { href: styles.href, preload: styles.preload } : null,
  }
  const renderFile = join(dir, 'server', 'render.js')
  await mkdir(dirname(renderFile), { recursive: true })
  await writeFile(renderFile, server.generateRender(build, manifest.images))
  files.push(renderFile)
  const manifestFile = join(dir, 'manifest.json')
  await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`)
  return { out: dir, manifest: manifestFile, files }
}
