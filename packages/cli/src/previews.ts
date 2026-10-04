import { pathToFileURL } from 'node:url'
import {
  type BuildResult,
  buildProject,
  componentIdOf,
  componentProject,
  type DevPreviews,
  type Diagnostic,
  type IsolatedUse,
  type Json,
  previewsModuleOf,
} from '@hozu/core/ir'
import { isPreviewSet, type Preview, type PreviewData, type PreviewSet } from '@hozu/core/preview'
import { importer } from './commands/app.ts'
import type { Loaded } from './load.ts'

interface Server {
  renderToString(options: { build: BuildResult; data: unknown; route: string }): Promise<{ html: string }>
}

interface Data {
  createDataRuntime(options: { build: BuildResult; resolvers: unknown }): unknown
  resolvers(project: unknown, list: () => unknown[]): unknown
}

const BODY = /<body[^>]*>([\s\S]*?)(?:<script|<\/body>)/

/** `project({ previews })` imported, or null when the app names none (ADR 0058 H). */
export async function loadPreviews(loaded: Loaded): Promise<PreviewSet | null> {
  const path = previewsModuleOf(loaded.project)
  if (!path) return null
  const mod = (await import(pathToFileURL(path).href)) as { default?: unknown }
  return isPreviewSet(mod.default) ? mod.default : null
}

const isolatedUse = (use: Extract<Preview, { kind: 'component' }>['use']): IsolatedUse => ({
  variant: (use.variant ?? {}) as Record<string, string>,
  props: (use.props ?? {}) as Record<string, unknown>,
  slots: use.slots ?? {},
  ...(use.children !== undefined ? { children: use.children } : {}),
})

/** One component use rendered alone, as `hozu render` does: the HTML inside its body. */
export async function renderUse(loaded: Loaded, id: string, use: IsolatedUse) {
  const isolated = componentProject(loaded.project, id, use)
  if (!isolated) return { ok: false, html: '', problems: [`No component ${id}`], build: null }
  const build = buildProject(isolated, { sources: false })
  const problems = build.diagnostics
    .filter((d) => d.severity === 'error')
    .map((d) => `${d.code} ${d.message}`)
  if (problems.length) return { ok: false, html: '', problems, build }
  const load = importer(loaded, 'render')
  const server = await load<Server>('@hozu/runtime-server')
  const data = await load<Data>('@hozu/data')
  const runtime = data.createDataRuntime({ build, resolvers: data.resolvers(isolated, () => []) })
  const page = await server.renderToString({ build, data: runtime, route: 'render' })
  return { ok: true, html: (BODY.exec(page.html)?.[1] ?? page.html).trim(), problems: [], build }
}

const resultOf = (d: PreviewData): Json =>
  d.kind === 'data'
    ? { ok: true, value: d.output as Json }
    : d.error === 'Unexpected'
      ? { ok: false, error: 'Unexpected', data: { message: 'Preview: Unexpected' } }
      : { ok: false, error: d.error ?? 'Unexpected', data: (d.data ?? {}) as Json }

/** Previews by component id and by route, with each query answered (ADR 0058 H). */
export function devPreviews(loaded: Loaded, build: BuildResult, set: PreviewSet | null): DevPreviews {
  const out: DevPreviews = { components: {}, pages: {} }
  for (const p of set?.list ?? []) {
    if (p.kind === 'component') {
      const id = componentIdOf(loaded.project, p.component)
      if (id) out.components[id] = [...(out.components[id] ?? []), { name: p.name, use: isolatedUse(p.use) }]
      continue
    }
    const route = build.bindings.refs.get(p.route)?.replace(/^#route:/, '')
    if (!route) continue
    const data: Record<string, Json> = {}
    for (const d of p.data) {
      const ref = build.bindings.refs.get(d.query)
      if (ref) data[ref] = resultOf(d)
    }
    out.pages[route] = [...(out.pages[route] ?? []), { name: p.name, data }]
  }
  return out
}

const hz092 = (
  p: Preview | PreviewData,
  i: number,
  message: string,
  cause: string,
  fix: string,
): Diagnostic => ({
  code: 'HZ092',
  severity: 'error',
  message,
  location: { feature: null, pointer: `/previews/${i}`, source: p.at },
  cause,
  fix: { summary: fix, snippet: null, patch: null },
})

/** HZ092: previews that no longer fit the app. They never ship, so only `hozu check` keeps them honest. */
export function checkPreviews(loaded: Loaded, build: BuildResult, set: PreviewSet | null): Diagnostic[] {
  const out: Diagnostic[] = []
  const { ir, bindings } = build
  for (const [i, p] of (set?.list ?? []).entries()) {
    if (p.kind === 'component') {
      const id = componentIdOf(loaded.project, p.component)
      if (!id) {
        out.push(
          hz092(
            p,
            i,
            `Preview "${p.name}" names a component the project does not declare`,
            'Its component is not in a kit or a feature of this project.',
            'Use a component from project({ kits }) or a feature',
          ),
        )
        continue
      }
      const isolated = componentProject(loaded.project, id, isolatedUse(p.use))
      const errors = isolated
        ? buildProject(isolated, { sources: false }).diagnostics.filter((d) => d.severity === 'error')
        : []
      for (const e of errors)
        out.push(
          hz092(
            p,
            i,
            `Preview "${p.name}" of ${id}: ${e.message}`,
            e.cause,
            e.fix?.summary ?? 'Fix the use in the preview',
          ),
        )
      continue
    }
    const route = bindings.refs.get(p.route)?.replace(/^#route:/, '')
    if (!route || !ir.pages[route]) {
      out.push(
        hz092(
          p,
          i,
          `Preview "${p.name}" names a route without a page`,
          'A page preview renders a page; this route has none.',
          'Name a route listed in project({ pages })',
        ),
      )
      continue
    }
    for (const d of p.data) {
      const ref = bindings.refs.get(d.query)
      const [feature, name] = (ref ?? '').split('.') as [string, string]
      const query = ir.features[feature]?.queries[name ?? '']
      if (!ref || !query) {
        out.push(
          hz092(
            d,
            i,
            `Preview "${p.name}" answers a query the project does not declare`,
            'Only declared queries can be answered in a preview.',
            'Use a query from a feature of this project',
          ),
        )
        continue
      }
      if (d.kind === 'data') {
        const issues = bindings.checks[`${ref}#output`]?.(d.output) ?? null
        if (issues)
          out.push(
            hz092(
              d,
              i,
              `Preview "${p.name}": data for ${ref} does not match its output: ${issues.join('; ')}`,
              'The query output schema changed, or the preview data was written for another shape.',
              `Make the data fit ${ref}'s output schema`,
            ),
          )
      } else if (d.error !== 'Unexpected' && !(d.error! in query.errors))
        out.push(
          hz092(
            d,
            i,
            `Preview "${p.name}": ${ref} declares no error "${d.error}"`,
            `Its errors are ${Object.keys(query.errors).join(', ') || 'none'} (and Unexpected).`,
            'Use a declared error or Unexpected',
          ),
        )
      else if (d.error !== 'Unexpected') {
        const issues = bindings.checks[`${ref}#error:${d.error}`]?.(d.data) ?? null
        if (issues)
          out.push(
            hz092(
              d,
              i,
              `Preview "${p.name}": data of ${ref}'s ${d.error} does not match: ${issues.join('; ')}`,
              'The error data schema changed.',
              `Make the data fit ${ref}'s ${d.error} schema`,
            ),
          )
      }
    }
  }
  return out
}
