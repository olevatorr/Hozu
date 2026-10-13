import { existsSync } from 'node:fs'
import { basename, dirname, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  type BuildResult,
  buildProject,
  componentIdOf,
  componentProject,
  type DevPreviews,
  type Diagnostic,
  exampleProject,
  type IsolatedUse,
  type Json,
  previewsModulesOf,
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

export interface LoadedPreviews {
  set: PreviewSet | null
  problems: Diagnostic[]
}

const hz014 = (path: string, message: string, cause: string): Diagnostic => ({
  code: 'HZ014',
  severity: 'error',
  message,
  location: { feature: null, pointer: '/previews', source: { file: path, line: 1, column: 1 } },
  cause,
  fix: {
    summary: "Default-export previews((p) => [...]) from '@hozu/core/preview'",
    snippet: "export default previews((p) => [p.component(Button, 'Long label', { children: '…' })])",
    patch: null,
  },
})

async function loadOne(path: string): Promise<{ set: PreviewSet | null; problem: Diagnostic | null }> {
  const name = basename(path)
  if (!existsSync(path))
    return {
      set: null,
      problem: hz014(
        path,
        'project({ previews }) names a file that does not exist',
        'The URL in hozu.config.ts points at no file.',
      ),
    }
  try {
    const mod = (await import(pathToFileURL(path).href)) as { default?: unknown }
    if (isPreviewSet(mod.default)) return { set: mod.default, problem: null }
    return {
      set: null,
      problem: hz014(
        path,
        `${name} does not default-export previews(...)`,
        'Its default export is not the result of previews() from @hozu/core/preview.',
      ),
    }
  } catch (error) {
    return {
      set: null,
      problem: hz014(
        path,
        `${name} failed to load: ${(error as Error).message}`,
        'Importing the previews module threw.',
      ),
    }
  }
}

/**
 * `project({ previews })` imported, every file of the list in order; a file that is missing, throws or exports
 * something else is HZ014 and the others still load (ADR 0058 H).
 */
export async function loadPreviews(loaded: Loaded): Promise<LoadedPreviews> {
  const paths = previewsModulesOf(loaded.project)
  if (!paths.length) return { set: null, problems: [] }
  const found = await Promise.all(paths.map(loadOne))
  const sets = found.flatMap((f) => (f.set ? [f.set] : []))
  return {
    set: sets.length ? { hozuPreviews: true, list: sets.flatMap((x) => x.list) } : null,
    problems: found.flatMap((f) => (f.problem ? [f.problem] : [])),
  }
}

const isolatedUse = (use: Extract<Preview, { kind: 'component' }>['use']): IsolatedUse => ({
  variant: (use.variant ?? {}) as Record<string, string>,
  props: (use.props ?? {}) as Record<string, unknown>,
  slots: use.slots ?? {},
  ...(use.children !== undefined ? { children: use.children } : {}),
})

/** One component use rendered alone, as `hozu render` does: the HTML inside its body. */
export const renderUse = (loaded: Loaded, id: string, use: IsolatedUse) =>
  renderAlone(loaded, id, componentProject(loaded.project, id, use))

/** A `p.example` of the component `id` rendered alone, as written. */
export function renderExample(loaded: Loaded, set: PreviewSet | null, id: string, name: string) {
  const example = examplesOf(loaded, set).find((e) => e.id === id && e.preview.name === name)
  if (!example)
    return Promise.resolve({ ok: false, html: '', problems: [`No example "${name}" of ${id}`], build: null })
  return renderAlone(loaded, id, exampleProject(loaded.project, id, example.preview.render))
}

const examplesOf = (loaded: Loaded, set: PreviewSet | null) =>
  (set?.list ?? []).flatMap((preview) => {
    if (preview.kind !== 'example') return []
    const id = componentIdOf(loaded.project, preview.component)
    return id ? [{ id, preview }] : []
  })

const built = (isolated: unknown) => {
  try {
    return { build: buildProject(isolated, { sources: false }), thrown: null }
  } catch (error) {
    return { build: null, thrown: (error as Error).message }
  }
}

async function renderAlone(loaded: Loaded, id: string, isolated: unknown) {
  if (!isolated) return { ok: false, html: '', problems: [`No component ${id}`], build: null }
  const { build, thrown } = built(isolated)
  if (!build) return { ok: false, html: '', problems: [thrown ?? 'The build failed'], build: null }
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
  const examples: NonNullable<DevPreviews['examples']> = {}
  const root = dirname(loaded.path)
  for (const p of set?.list ?? []) {
    if (p.kind === 'example') {
      const id = componentIdOf(loaded.project, p.component)
      if (id)
        examples[id] = [
          ...(examples[id] ?? []),
          {
            name: p.name,
            file: p.at ? relative(root, p.at.file).split('\\').join('/') : null,
            line: p.at?.line ?? 1,
          },
        ]
      continue
    }
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
  return Object.keys(examples).length ? { ...out, examples } : out
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
    if (p.kind === 'example') {
      const id = componentIdOf(loaded.project, p.component)
      if (!id) {
        out.push(
          hz092(
            p,
            i,
            `Example "${p.name}" names a component the project does not declare`,
            'Its component is not in a kit or a feature of this project.',
            'Use a component from project({ kits }) or a feature',
          ),
        )
        continue
      }
      const { build, thrown } = built(exampleProject(loaded.project, id, p.render))
      const errors = build
        ? build.diagnostics.filter((d) => d.severity === 'error')
        : [{ message: thrown ?? 'the build failed', cause: 'Recording the example threw.', fix: null }]
      for (const e of errors)
        out.push(
          hz092(
            p,
            i,
            `Example "${p.name}" of ${id}: ${e.message}`,
            e.cause,
            e.fix?.summary ?? 'Fix the example',
          ),
        )
      continue
    }
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
