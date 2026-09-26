import type { BuildResult } from '@hozu/core/ir'
import { clientBundle } from './assets.ts'
import { type Assets, fnsModule, type Stylesheet, type WidgetBundle } from './render.ts'

export interface StaticFile {
  path: string
  text: string | null
  file: string | null
}

export function publicAssets(
  basePath: string,
  styles: { href: string; preload: string[] } | null,
  widgets: Record<string, string>,
): Assets {
  return {
    client: `${basePath}/_hozu/client.js`,
    fns: `${basePath}/_hozu/fns.js`,
    styles: styles ? basePath + styles.href : null,
    preload: (styles?.preload ?? []).map((href) => basePath + href),
    widgets: Object.fromEntries(Object.entries(widgets).map(([k, v]) => [k, basePath + v])),
  }
}

export function staticFiles(
  build: BuildResult,
  { styles, widgets, client }: { styles: Stylesheet | null; widgets: WidgetBundle | null; client: boolean },
): StaticFile[] {
  const base = build.ir.http.basePath
  const text = (path: string, body: string): StaticFile => ({ path: base + path, text: body, file: null })
  const out: StaticFile[] = []
  if (client) {
    for (const [path, code] of Object.entries(clientBundle())) out.push(text(path, code))
    out.push(text('/_hozu/fns.js', fnsModule(build)))
  }
  if (styles) {
    out.push(text(styles.href, styles.css))
    for (const [path, file] of Object.entries(styles.assets))
      out.push({ path: base + path, text: null, file })
  }
  for (const [path, a] of Object.entries(build.bindings.assets))
    if (a.file) out.push({ path, text: null, file: a.file })
  for (const [path, code] of Object.entries(widgets?.files ?? {})) out.push(text(path, code))
  return out
}
