import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  appModuleOf,
  type BuildResult,
  codes,
  type Diagnostic,
  type Fix,
  resolveSource,
  usedWidgets,
} from '@hozu/core/ir'
import { HozuCliError } from '../errors.ts'
import type { Loaded } from '../load.ts'

export interface AppOptions {
  resolvers: unknown
  widgets?: (build: BuildResult) => Promise<{ diagnostics?: Diagnostic[] }>
  [key: string]: unknown
}

export interface AppModule {
  path: string
  app: unknown
  options: AppOptions
}

export const APP_SNIPPET = `// app.ts
import { resolvers } from '@hozu/data'
import { app } from '@hozu/runtime-server'
import project from './hozu.config.ts'

export default app({ resolvers: resolvers(project, (implement) => [...]) })`

export const importer =
  (loaded: Loaded, command: string) =>
  async <T>(id: string, hint: string[] = [`npm install ${id}`]): Promise<T> => {
    try {
      return (await import(pathToFileURL(createRequire(loaded.path).resolve(id)).href)) as T
    } catch {
      throw new HozuCliError('config', `hozu ${command} needs ${id} in the app`, hint)
    }
  }

const lineOf = (file: string, pattern: RegExp) => {
  try {
    const at = readFileSync(file, 'utf8')
      .split('\n')
      .findIndex((l) => pattern.test(l))
    return { file, line: at + 1, column: 1 }
  } catch {
    return null
  }
}

const hz045 = (
  message: string,
  cause: string,
  fix: Fix,
  source: Diagnostic['location']['source'],
): Diagnostic => ({
  code: 'HZ045',
  severity: codes.HZ045.severity,
  message,
  location: { feature: null, pointer: '/app', source },
  cause,
  fix,
})

export async function inspectApp(
  loaded: Loaded,
  build: BuildResult,
): Promise<{ module: AppModule | null; diagnostics: Diagnostic[] }> {
  const path = appModuleOf(loaded.project)
  const configLine = lineOf(loaded.path, /project\(\{/)
  if (!path)
    return {
      module: null,
      diagnostics: [
        hz045(
          'project({ app }) names no app module',
          'hozu serve, check, get, browse and testApp all build the app from one module, so the tools verify what production serves.',
          {
            summary: "Add app: new URL('./app.ts', import.meta.url) to project({ … }) and write app.ts",
            snippet: `app: new URL('./app.ts', import.meta.url),\n\n${APP_SNIPPET}`,
            patch: null,
          },
          configLine,
        ),
      ],
    }
  const where = lineOf(path, /export default/)
  const shown = relative(dirname(loaded.path), path) || path
  if (!existsSync(path))
    return {
      module: null,
      diagnostics: [
        hz045(
          `The app module ${shown} does not exist`,
          'project({ app }) names the module that default-exports app({ resolvers, … }).',
          { summary: `Create ${shown}`, snippet: APP_SNIPPET, patch: null },
          configLine,
        ),
      ],
    }
  let mod: { default?: unknown }
  try {
    mod = await import(pathToFileURL(path).href)
  } catch (error) {
    throw new HozuCliError(
      'config',
      `Failed to load ${path}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  const server = await importer(
    loaded,
    'check',
  )<{
    appOptionsOf(value: unknown): AppOptions | null
    projectOfApp(value: unknown): unknown
  }>('@hozu/runtime-server')
  const options = server.appOptionsOf(mod.default)
  if (options && server.projectOfApp(mod.default) !== loaded.project)
    return {
      module: null,
      diagnostics: [
        hz045(
          `The resolvers of ${shown} are declared for another project`,
          'resolvers(project, …) in the app module must name the project of this hozu.config.ts.',
          {
            summary: "import project from './hozu.config.ts' and pass it to resolvers()",
            snippet: APP_SNIPPET,
            patch: null,
          },
          where,
        ),
      ],
    }
  if (!options)
    return {
      module: null,
      diagnostics: [
        hz045(
          `The default export of ${shown} is not app(…)`,
          'The app module is the one place resolvers, the session store and widgets are named; there is no wrapper position around it.',
          {
            summary: 'export default app({ resolvers, session?, widgets? })',
            snippet: APP_SNIPPET,
            patch: null,
          },
          where,
        ),
      ],
    }
  const diagnostics: Diagnostic[] = []
  const widgets = usedWidgets(build.ir)
  if (widgets.length && !options.widgets)
    diagnostics.push(
      hz045(
        `app() has no widgets, but views use ${widgets.join(', ')}`,
        'Widget client code is bundled separately; without it the server refuses to start.',
        {
          summary: "Pass widgets: bundleWidgets to app() (import { bundleWidgets } from '@hozu/bundle')",
          snippet: 'widgets: bundleWidgets,',
          patch: null,
        },
        where,
      ),
    )
  const data = await importer(
    loaded,
    'check',
  )<{
    createDataRuntime(o: { build: BuildResult; resolvers: unknown }): unknown
    DataRuntimeError: new (...a: never[]) => Error & { diagnostics: Diagnostic[] }
  }>('@hozu/data')
  try {
    data.createDataRuntime({ build, resolvers: options.resolvers })
  } catch (error) {
    if (!(error instanceof data.DataRuntimeError)) throw error
    for (const d of error.diagnostics)
      diagnostics.push({
        ...d,
        location: {
          ...d.location,
          source: d.location.source ?? resolveSource(build.sources, d.location.pointer),
        },
      })
  }
  return { module: { path, app: mod.default, options }, diagnostics }
}

export async function requireApp(loaded: Loaded, command: string, build: BuildResult): Promise<AppModule> {
  const errors = build.diagnostics.filter((d) => d.severity === 'error')
  if (errors.length) throw new BuildFailed(errors)
  const { module, diagnostics } = await inspectApp(loaded, build)
  const first = diagnostics.find((d) => d.severity === 'error')
  if (!module || first)
    throw new HozuCliError('config', `hozu ${command}: ${first?.message ?? 'no app module'}`, [
      first?.fix?.summary ?? '',
      ...(first?.fix?.snippet ? [first.fix.snippet] : []),
    ])
  return module
}

export class BuildFailed extends HozuCliError {
  readonly diagnostics: Diagnostic[]
  constructor(diagnostics: Diagnostic[]) {
    super(
      'build',
      `The build has ${diagnostics.length} error${diagnostics.length === 1 ? '' : 's'}, so nothing is rendered (run hozu check)`,
      diagnostics.map((d) => `${d.code} ${d.location.pointer} ${d.message}`),
    )
    this.diagnostics = diagnostics
  }
}
