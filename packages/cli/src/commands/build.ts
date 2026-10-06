import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'
import { type BuildResult, componentOf, hashJson, type ImageSet, type Manifest } from '@hozu/core/ir'
import type { BuildOutput } from '../contract.ts'
import { HozuCliError } from '../errors.ts'
import type { Loaded } from '../load.ts'

interface Stylesheet {
  href: string
  css: string
  assets: Record<string, string>
  preload: string[]
}

interface Components {
  urls: Record<string, string>
  files: Record<string, string>
  fetches?: Record<string, string>
}

interface ServerModule {
  generateRender(build: BuildResult, images: Record<string, { width: number; href: string }[]> | null): string
  staticFiles(
    build: BuildResult,
    options: { styles: Stylesheet | null; components: Components | null; client: boolean },
  ): { path: string; text: string | null; file: string | null }[]
}

export async function runBuild(loaded: Loaded, out: string | undefined, cwd: string): Promise<BuildOutput> {
  const build = loaded.build(false)
  const errors = build.diagnostics.filter((d) => d.severity === 'error')
  if (errors.length)
    throw new HozuCliError('build', `The project has ${errors.length} build errors`, ['Run hozu check'])
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
      throw new HozuCliError('build', `hozu build needs ${id} installed in the project`, [
        `npm install ${id}   # or pnpm add / yarn add`,
      ])
    }
  }
  const base = dirname(loaded.path)
  const styles = build.bindings.styles.entry
    ? await (
        await from<{ compileStyles(b: BuildResult, o: { base: string }): Promise<Stylesheet> }>('@hozu/css')
      ).compileStyles(build, { base })
    : null
  const components =
    Object.keys(build.bindings.clients).length + Object.keys(build.bindings.fetches).length
      ? await (
          await from<{ bundleComponents(b: BuildResult): Promise<Components> }>('@hozu/bundle')
        ).bundleComponents(build)
      : null
  const images = await optional<{ optimizeImages(b: BuildResult): Promise<ImageSet> }>('@hozu/image').then(
    (m) => (m ? m.optimizeImages(build) : null),
  )
  const server = await from<ServerModule>('@hozu/runtime-server')
  const dir = resolve(cwd, out ?? 'dist')
  const files: string[] = []
  for (const f of server.staticFiles(build, { styles, components, client: true })) {
    const file = join(dir, 'public', f.path.replace(/^\//, ''))
    await mkdir(dirname(file), { recursive: true })
    if (f.file) await copyFile(f.file, file)
    else await writeFile(file, f.text ?? '')
    files.push(file)
  }
  for (const file of files.filter((f) => /\.(js|css|svg|json|xml|webmanifest|txt|html)$/.test(f))) {
    const bytes = await readFile(file)
    if (bytes.length < 1024) {
      await rm(`${file}.br`, { force: true })
      await rm(`${file}.gz`, { force: true })
      continue
    }
    await writeFile(
      `${file}.br`,
      brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }),
    )
    await writeFile(`${file}.gz`, gzipSync(bytes, { level: 9 }))
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
    components: Object.fromEntries(
      Object.entries(components?.urls ?? {}).map(([ref, url]) => [
        ref,
        { hash: componentOf(build.ir, ref)?.client?.sourceHash ?? '', url },
      ]),
    ),
    styles: styles ? { href: styles.href, preload: styles.preload } : null,
    sources: {
      components: Object.fromEntries([
        ...Object.entries(build.ir.kits).flatMap(([kit, k]) =>
          Object.entries(k.components).map(([name, c]) => [`${kit}.${name}`, c.sourceHash] as const),
        ),
        ...Object.values(build.ir.features).flatMap((f) =>
          Object.entries(f.components).map(([name, c]) => [`${f.id}.${name}`, c.sourceHash] as const),
        ),
      ]),
      fns: Object.fromEntries(
        Object.values(build.ir.features).flatMap((f) =>
          Object.entries(f.fns).map(([name, fn]) => [`${f.id}.${name}`, fn.sourceHash] as const),
        ),
      ),
    },
    fetches: Object.fromEntries(
      Object.entries(components?.fetches ?? {}).map(([feature, url]) => [
        feature,
        { hash: build.ir.features[feature]?.fetch?.sourceHash ?? '', url },
      ]),
    ),
  }
  const renderFile = join(dir, 'server', 'render.js')
  await mkdir(dirname(renderFile), { recursive: true })
  await writeFile(renderFile, server.generateRender(build, manifest.images))
  const renderTypes = join(dir, 'server', 'render.d.ts')
  await writeFile(
    renderTypes,
    "import type { RenderModule } from '@hozu/runtime-server'\n\ndeclare const render: RenderModule['default']\nexport default render\n",
  )
  files.push(renderFile, renderTypes)
  const manifestFile = join(dir, 'manifest.json')
  await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`)
  return { out: dir, manifest: manifestFile, files }
}
