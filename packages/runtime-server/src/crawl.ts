import type { BuildResult, Json, ValueExpr } from '@tenon/core/ir'
import type { DataRuntime } from '@tenon/data'
import { getIn } from '@tenon/machine'
import { escapeHtml } from './escape.ts'
import { pathOf } from './render.ts'

export interface PageEntry {
  route: string
  params: Json
  path: string
}

const evaluate = (v: ValueExpr, item: Json, fns: Record<string, (x: Json) => Json>): Json => {
  if ('literal' in v) return v.literal
  if ('object' in v) {
    const out: Record<string, Json> = {}
    for (const k in v.object) out[k] = evaluate(v.object[k]!, item, fns)
    return out
  }
  if ('fn' in v) return fns[v.fn]!(evaluate(v.arg, item, fns))
  return v.ref === 'binding' ? getIn(item, v.path) : null
}

export async function pageEntries(build: BuildResult, data: DataRuntime): Promise<PageEntry[]> {
  const { ir } = build
  const fns = build.bindings.fns as Record<string, (x: Json) => Json>
  const out: PageEntry[] = []
  for (const [route, page] of Object.entries(ir.pages).sort(([a], [b]) => a.localeCompare(b))) {
    const r = ir.routes[route]
    if (!r) continue
    if (!r.params) {
      out.push({ route, params: null, path: r.path })
      continue
    }
    if (!page.entries) continue
    const result = await data.run(page.entries.query, evaluate(page.entries.input, null, fns))
    if (!result.ok || !Array.isArray(result.value)) continue
    for (const item of result.value) {
      const params = evaluate(page.entries.params, item, fns)
      out.push({ route, params, path: pathOf(r.path, params) })
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
    .map(([route]) => `Disallow: ${ir.routes[route]!.path}`)
  return [
    'User-agent: *',
    'Allow: /',
    ...hidden,
    ...(ir.site ? [`Sitemap: ${ir.site.url}/sitemap.xml`] : []),
    '',
  ].join('\n')
}
