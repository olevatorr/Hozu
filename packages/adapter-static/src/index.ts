import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { planRoute } from '@hozu/compiler'
import type { BuildResult, ImageSet } from '@hozu/core/ir'
import { createDataRuntime, type ResolverSet } from '@hozu/data'
import {
  assertComponentBundle,
  assertFetchBundle,
  type ComponentBundle,
  pageEntries,
  publicAssets,
  renderToString,
  robotsTxt,
  type Stylesheet,
  sitemapXml,
  staticFiles,
} from '@hozu/runtime-server'

export interface StaticExportOptions {
  build: BuildResult
  resolvers: ResolverSet
  outDir: string
  styles?: Stylesheet | null
  components?: ComponentBundle | null
  images?: ImageSet | null
}

export interface StaticExport {
  written: string[]
  skipped: { route: string; reason: string }[]
  /**
   * Server effects a written page can call at runtime (HZ082, ADR 0049): a static host cannot answer them. Give the
   * effect runs: 'either' or 'browser', or deploy with a server.
   */
  needsServer: { path: string; effect: string; reason: string }[]
}

/** The server effects this page's islands can call once hydrated. */
function serverCalls(build: BuildResult, html: string): { effect: string; reason: string }[] {
  const json = /<script type="application\/json" id="hozu-payload">([\s\S]*?)<\/script>/.exec(html)?.[1]
  if (!json) return []
  const payload = JSON.parse(json) as {
    nodes: Record<string, unknown>
    features: Record<string, { states: Record<string, { invoke: { effect: string } | null }> } | null>
  }
  const runsOf = (ref: string) => {
    const dot = ref.indexOf('.')
    const f = build.ir.features[ref.slice(0, dot)]
    return f?.queries[ref.slice(dot + 1)]?.runs ?? f?.mutations[ref.slice(dot + 1)]?.runs ?? 'server'
  }
  const out = new Map<string, string>()
  for (const machine of Object.values(payload.features))
    for (const state of Object.values(machine?.states ?? {}))
      if (state.invoke && runsOf(state.invoke.effect) === 'server')
        out.set(state.invoke.effect, 'a machine on this page starts it')
  const visit = (x: unknown): void => {
    if (!x || typeof x !== 'object') return
    if (Array.isArray(x)) return x.forEach(visit)
    const o = x as Record<string, unknown>
    if (o.kind === 'query' && typeof o.query === 'string' && runsOf(o.query) === 'server')
      out.set(o.query, 'an island on this page can read it again (a new input or a refresh)')
    for (const v of Object.values(o)) visit(v)
  }
  visit(payload.nodes)
  return [...out].sort().map(([effect, reason]) => ({ effect, reason }))
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
  components = null,
  images = null,
}: StaticExportOptions): Promise<StaticExport> {
  const assets = publicAssets(
    build.ir.http.basePath,
    styles,
    components?.urls ?? {},
    components?.fetches ?? {},
  )
  assertComponentBundle(build.ir, assets.components, Boolean(components))
  assertFetchBundle(build.ir, assets.fetches ?? {}, Boolean(components))
  const data = createDataRuntime({ build, resolvers })
  const result: StaticExport = { written: [], skipped: [], needsServer: [] }
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
      for (const call of serverCalls(build, html)) result.needsServer.push({ path: entry.path, ...call })
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
  for (const f of staticFiles(build, { styles, components, client: js })) {
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
