import { type BuildResult, hashJson } from '@hozu/core/ir'
import { clientBundle } from './assets.ts'
import { fnModules } from './fn-modules.ts'
import { serviceWorker, serviceWorkerRegistration, webManifest } from './pwa.ts'
import type { Assets, ComponentBundle, Stylesheet } from './render.ts'

export interface StaticFile {
  path: string
  text: string | null
  file: string | null
}

export function publicAssets(
  basePath: string,
  styles: { href: string; preload: string[] } | null,
  components: Record<string, string>,
  fetches: Record<string, string> = {},
  fns: Record<string, string> = {},
): Assets {
  return {
    client: `${basePath}/_hozu/client.js`,
    fns: Object.fromEntries(Object.entries(fns).map(([k, v]) => [k, basePath + v])),
    styles: styles ? basePath + styles.href : null,
    preload: (styles?.preload ?? []).map((href) => basePath + href),
    components: Object.fromEntries(Object.entries(components).map(([k, v]) => [k, basePath + v])),
    fetches: Object.fromEntries(Object.entries(fetches).map(([k, v]) => [k, basePath + v])),
  }
}

export function staticFiles(
  build: BuildResult,
  {
    styles,
    components,
    client,
  }: { styles: Stylesheet | null; components: ComponentBundle | null; client: boolean },
): StaticFile[] {
  const base = build.ir.http.basePath
  const text = (path: string, body: string): StaticFile => ({ path: base + path, text: body, file: null })
  const out: StaticFile[] = []
  if (client) {
    for (const [path, code] of Object.entries(clientBundle())) out.push(text(path, code))
    for (const m of Object.values(fnModules(build))) out.push(text(m.path, m.source))
  }
  if (styles) {
    out.push(text(styles.href, styles.css))
    for (const [path, file] of Object.entries(styles.assets))
      out.push({ path: base + path, text: null, file })
  }
  for (const [path, a] of Object.entries(build.bindings.assets))
    if (a.file) out.push({ path, text: null, file: a.file })
  for (const [path, code] of Object.entries(components?.files ?? {})) out.push(text(path, code))
  const manifest = webManifest(build.ir)
  if (manifest) out.push(text('/manifest.webmanifest', manifest))
  const worker = serviceWorker(build.ir, hashJson(build.ir).slice(0, 12))
  if (worker) {
    out.push(text('/sw.js', worker))
    out.push(text('/_hozu/sw-register.js', serviceWorkerRegistration(build.ir)))
  }
  return out
}
