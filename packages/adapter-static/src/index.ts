import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { planRoute } from '@hozu/compiler'
import type { BuildResult, ImageSet } from '@hozu/core/ir'
import { createDataRuntime, type ResolverSet } from '@hozu/data'
import {
  assertWidgetBundle,
  pageEntries,
  publicAssets,
  renderToString,
  robotsTxt,
  type Stylesheet,
  sitemapXml,
  staticFiles,
  type WidgetBundle,
} from '@hozu/runtime-server'

export interface StaticExportOptions {
  build: BuildResult
  resolvers: ResolverSet
  outDir: string
  styles?: Stylesheet | null
  widgets?: WidgetBundle | null
  images?: ImageSet | null
}

export interface StaticExport {
  written: string[]
  skipped: { route: string; reason: string }[]
}

const write = async (file: string, content: string) => {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, content)
}

export async function exportStatic({
  build,
  resolvers,
  outDir,
  styles = null,
  widgets = null,
  images = null,
}: StaticExportOptions): Promise<StaticExport> {
  const assets = publicAssets(build.ir.http.basePath, styles, widgets?.urls ?? {})
  assertWidgetBundle(build.ir, assets.widgets, Boolean(widgets))
  const data = createDataRuntime({ build, resolvers })
  const result: StaticExport = { written: [], skipped: [] }
  let js = false
  const entries = await pageEntries(build, data)
  for (const [route, page] of Object.entries(build.ir.pages).sort(([a], [b]) => a.localeCompare(b))) {
    const { plan } = planRoute(build.ir, route)
    const dynamic = plan.regions.filter((r) => r.mode === 'request')
    if (dynamic.length) {
      result.skipped.push({ route, reason: `per-request regions: ${dynamic.map((r) => r.query).join(', ')}` })
      continue
    }
    const list = entries.filter((e) => e.route === route)
    if (!list.length && build.ir.routes[route]?.params && !page.entries) {
      result.skipped.push({ route, reason: 'parameterized route without entries (HZ025)' })
      continue
    }
    for (const entry of list) {
      const { html, status } = await renderToString({
        build,
        data,
        route,
        params: entry.params,
        assets,
        locale: entry.locale,
        images: images?.variants ?? null,
      })
      if (status !== 200) {
        result.skipped.push({ route: entry.path, reason: `status ${status}` })
        continue
      }
      const file = join(outDir, entry.path.replace(/^\//, ''), 'index.html')
      await write(file, html)
      result.written.push(file)
      js ||= html.includes(`<script type="module" src="${assets.client}">`)
    }
  }
  if (build.ir.notFound) {
    const { html } = await renderToString({
      build,
      data,
      route: build.ir.notFound,
      params: null,
      assets,
      images: images?.variants ?? null,
    })
    await write(join(outDir, '404.html'), html)
    result.written.push(join(outDir, '404.html'))
  }
  await write(join(outDir, 'robots.txt'), robotsTxt(build))
  await write(join(outDir, 'sitemap.xml'), sitemapXml(build, entries))
  result.written.push(join(outDir, 'robots.txt'), join(outDir, 'sitemap.xml'))
  for (const f of staticFiles(build, { styles, widgets, client: js })) {
    const file = join(outDir, f.path.replace(/^\//, ''))
    await mkdir(dirname(file), { recursive: true })
    if (f.file) await copyFile(f.file, file)
    else await writeFile(file, f.text ?? '')
    result.written.push(file)
  }
  for (const [href, bytes] of Object.entries(images?.files ?? {})) {
    const file = join(outDir, href.replace(/^\//, ''))
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, bytes)
    result.written.push(file)
  }
  return result
}
