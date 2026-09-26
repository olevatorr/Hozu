import { type BuildResult, type Json, publicPath, routeTable, type ValueExpr } from '@tenon/core/ir'
import type { DataRuntime } from '@tenon/data'
import { compileValue } from '@tenon/machine'
import { escapeHtml } from './escape.ts'
import { pathOf } from './render.ts'

export interface PageEntry {
  route: string
  params: Json
  path: string
  locale: string | null
}

const evaluate = (v: ValueExpr, item: Json, fns: Record<string, (x: Json) => Json>): Json =>
  compileValue(v, fns)({ bindings: [item] })

export async function pageEntries(build: BuildResult, data: DataRuntime): Promise<PageEntry[]> {
  const { ir } = build
  const fns = build.bindings.fns as Record<string, (x: Json) => Json>
  const out: PageEntry[] = []
  const locales = ir.site?.locales ?? [null]
  for (const [route, page] of Object.entries(ir.pages).sort(([a], [b]) => a.localeCompare(b))) {
    const r = ir.routes[route]
    if (!r) continue
    const params: Json[] = []
    if (!r.params) params.push(null)
    else if (page.entries) {
      const result = await data.run(page.entries.query, evaluate(page.entries.input, null, fns))
      if (result.ok && Array.isArray(result.value))
        for (const item of result.value) params.push(evaluate(page.entries.params, item, fns))
    }
    for (const locale of locales) {
      const pattern = routeTable(ir, locale)[route] ?? r.path
      for (const p of params) out.push({ route, params: p, path: pathOf(pattern, p), locale })
    }
  }
  return out
}

export function sitemapXml(build: BuildResult, entries: PageEntry[]): string {
  const site = build.ir.site
  const urls = entries
    .filter((e) => !build.ir.pages[e.route]?.head.noindex)
    .map((e) => `<url><loc>${escapeHtml(`${site?.url ?? ''}${e.path}`)}</loc></url>`)
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>\n`
}

export function robotsTxt(build: BuildResult): string {
  const { ir } = build
  const hidden = Object.entries(ir.pages)
    .filter(([route, p]) => p.head.noindex && ir.routes[route] && !ir.routes[route]!.params)
    .flatMap(([route]) =>
      (ir.site?.locales ?? [null]).map((l) => `Disallow: ${publicPath(ir, ir.routes[route]!.path, l)}`),
    )
  return [
    'User-agent: *',
    'Allow: /',
    ...hidden,
    ...(ir.site ? [`Sitemap: ${ir.site.url}${ir.http.basePath}/sitemap.xml`] : []),
    '',
  ].join('\n')
}
