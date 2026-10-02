import type { KitDef } from '../builders/component.ts'
import type { FeatureConfig, FeatureParts, ProjectConfig } from '../builders/feature.ts'
import type { RouteDef } from '../builders/route.ts'
import { join, resolveSource } from '../canonical/pointer.ts'
import type { Bindings } from '../ir/bindings.ts'
import type { Diagnostic, SourceIndex } from '../ir/diagnostic.ts'
import type { FeatureIR, JsonSchema, KitIR, ProjectIR, RouteIR } from '../ir/types.ts'
import { freeNamesOf, transformedDecls } from '../lower.ts'
import { type DeclKind, defOf, infoOf } from '../model/decl.ts'
import type { SchemaAdapterDef } from '../schema/adapter.ts'
import { toCheck, toParse } from '../schema/check.ts'
import { isStandardSchema } from '../schema/standard.ts'
import { withCapture } from '../source/capture.ts'
import { buildComponent } from './components.ts'
import { buildFeature } from './feature.ts'
import { buildHttp } from './http.ts'
import type { Manifest } from './manifest.ts'
import { buildPages } from './page.ts'
import { FeatureScope, filePath, IDENTIFIER, type PartUse, ProjectScope } from './scope.ts'
import { reportSharedParts } from './shared-parts.ts'

export interface BuildResult {
  ir: ProjectIR
  bindings: Bindings
  sources: SourceIndex
  nodes?: Record<string, string>
  diagnostics: Diagnostic[]
  parts: PartUse[]
}

export const INVALID_ERROR_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    message: { type: 'string' },
    fields: { type: 'object', additionalProperties: { type: 'string' } },
  },
  required: ['message', 'fields'],
  additionalProperties: false,
}

export const UNEXPECTED_ERROR_SCHEMA: JsonSchema = {
  type: 'object',
  properties: { message: { type: 'string' } },
  required: ['message'],
  additionalProperties: false,
}

const registries: [keyof FeatureParts, DeclKind][] = [
  ['tags', 'tag'],
  ['events', 'event'],
  ['queries', 'query'],
  ['mutations', 'mutation'],
  ['fns', 'fn'],
  ['views', 'view'],
  ['components', 'component'],
  ['endpoints', 'endpoint'],
  ['contracts', 'contract'],
]

const kindKeys: Partial<Record<DeclKind, keyof FeatureParts>> = {
  tag: 'tags',
  event: 'events',
  query: 'queries',
  mutation: 'mutations',
  fn: 'fns',
  view: 'views',
  component: 'components',
  endpoint: 'endpoints',
  contract: 'contracts',
}
const exportKeys: Partial<Record<DeclKind, keyof FeatureParts['exports']>> = {
  event: 'events',
  query: 'queries',
  mutation: 'mutations',
  tag: 'tags',
  fn: 'fns',
  view: 'views',
  endpoint: 'endpoints',
}

function partsOf(scope: ProjectScope, config: FeatureConfig): FeatureParts {
  const id = String(config.id)
  const base = join('', 'features', id)
  const records: Record<string, Record<string, unknown>> = {}
  const parts = {
    id,
    intent: { summary: config.intent?.summary, invariants: config.intent?.invariants ?? [] },
    styles: config.styles ?? [],
    imports: config.imports ?? [],
    machine: null,
    messages: null,
    exports: { events: [], queries: [], mutations: [], tags: [], fns: [], views: [], endpoints: [] },
  } as unknown as FeatureParts & Record<string, unknown>
  for (const key of Object.values(kindKeys)) records[key as string] = {}
  const modules = config.declarations as unknown
  if (!Array.isArray(modules))
    scope.report(
      'HZ014',
      id,
      join(base, 'declarations'),
      'declarations is a list of modules',
      'A feature lists the modules that hold its declarations (ADR 0041); every exported declaration is registered under its export name.',
      {
        summary:
          "import * as model from './model.ts' and import * as views from './views.ts', then declarations: [model, views]",
        snippet: 'declarations: [model, views]',
        patch: null,
      },
    )
  const named = new Map<string, unknown>()
  for (const [m, module] of (Array.isArray(modules) ? modules : []).entries())
    for (const [name, decl] of Object.entries(module as Record<string, unknown>)) {
      const kind = infoOf(decl)?.kind
      const at = join(base, 'declarations', m, name)
      if (!kind || (!kindKeys[kind] && kind !== 'machine' && kind !== 'messages')) continue
      const seen = named.get(name)
      if (seen !== undefined) {
        if (seen !== decl)
          scope.report(
            'HZ013',
            id,
            at,
            `"${name}" is declared by two of the feature's modules`,
            'Each declaration is registered under its export name, so names are unique within a feature.',
          )
        continue
      }
      named.set(name, decl)
      const key = kindKeys[kind]
      if (key) records[key as string]![name] = decl
      else if (kind === 'machine' || kind === 'messages') {
        if (parts[kind])
          scope.report('HZ013', id, at, `A feature has one ${kind}`, `"${name}" is a second ${kind}.`)
        else (parts as Record<string, unknown>)[kind] = decl
      }
    }
  Object.assign(parts, records)
  for (const [i, decl] of (config.exports ?? []).entries()) {
    const kind = infoOf(decl)?.kind
    const key = kind ? exportKeys[kind] : undefined
    if (key) (parts.exports[key] as unknown[]).push(decl)
    else
      scope.report(
        'HZ014',
        id,
        join(base, 'exports', i),
        'Only events, queries, mutations, tags, fns, views and endpoints can be exported',
        `Got ${kind ?? typeof decl}.`,
      )
  }
  return parts
}

function register(scope: ProjectScope, id: string, config: FeatureParts) {
  const base = join('', 'features', id)
  const claim = (decl: object, symbol: string, kind: DeclKind, pointer: string) => {
    scope.mark(pointer, decl)
    if (!IDENTIFIER.test(symbol))
      scope.report(
        'HZ014',
        id,
        pointer,
        `Name "${symbol}" is not an identifier`,
        'Names must match /^[A-Za-z][A-Za-z0-9_]*$/.',
      )
    const info = infoOf(decl)
    if (info?.kind !== kind) {
      scope.report(
        'HZ014',
        id,
        pointer,
        `Expected a ${kind} declaration`,
        `Got ${info?.kind ?? typeof decl}.`,
      )
      return
    }
    const existing = scope.owners.get(decl)
    if (existing) {
      scope.report(
        'HZ013',
        id,
        pointer,
        `This ${kind} is already declared as ${existing.feature}.${existing.symbol}`,
        'Every declaration identity is registered exactly once; other features reach it through exports and imports.',
        {
          summary: `Remove it here and import ${existing.feature} instead`,
          snippet: `imports: [${existing.feature}]`,
          patch: null,
        },
      )
      return
    }
    scope.owners.set(decl, { feature: id, symbol, kind })
    scope.bindings.refs.set(decl, `${id}.${symbol}`)
    if (kind === 'component')
      scope.components.set(decl, { id: `${id}.${symbol}`, owner: { kind: 'feature', id } })
  }
  for (const [key, kind] of registries)
    for (const [symbol, decl] of Object.entries((config[key] ?? {}) as Record<string, object>))
      claim(decl, symbol, kind, join(base, key, symbol))
  if (config.machine) claim(config.machine, 'machine', 'machine', join(base, 'machine'))
  if (config.messages) claim(config.messages, 'messages', 'messages', join(base, 'messages'))
}

function projectSchema(
  scope: ProjectScope,
  schema: unknown,
  pointer: string,
  key: string,
): JsonSchema | null {
  if (schema === null || schema === undefined) return null
  if (!isStandardSchema(schema)) {
    scope.report(
      'HZ014',
      null,
      pointer,
      'Expected a schema or null',
      'Project-level schemas use the project schema adapter.',
    )
    return null
  }
  const adapter = scope.adapter
  if (!adapter) return null
  const vendor = schema['~standard'].vendor
  if (vendor !== adapter.vendor) {
    scope.report(
      'HZ012',
      null,
      pointer,
      `Schema from "${vendor}" but the project adapter is "${adapter.vendor}"`,
      'One canonical schema form per project.',
    )
    return null
  }
  const check = toCheck(schema)
  if (check) scope.bindings.checks[key] = check
  return adapter.toJsonSchema(schema)
}

export interface BuildOptions {
  sources?: boolean
  manifest?: Manifest
}

export function buildProject(project: unknown, options: BuildOptions = {}): BuildResult {
  const sources = options.sources ?? true
  return withCapture(sources, () => build(project, sources, options.manifest ?? null))
}

function build(project: unknown, tracking: boolean, manifest: Manifest | null): BuildResult {
  const info = infoOf(project)
  if (info?.kind !== 'project')
    throw new TypeError('Expected a project() declaration as the default export of hozu.config.ts')
  const config = info.def as ProjectConfig
  const scope = new ProjectScope(tracking)
  scope.manifest = manifest
  const adapter = infoOf(config.schema)
  if (adapter?.kind === 'adapter') scope.adapter = adapter.def as SchemaAdapterDef
  else
    scope.report(
      'HZ012',
      null,
      '/schema',
      'project({ schema }) must be a schema adapter',
      'Use an adapter such as zodAdapter from @hozu/schema-zod.',
    )

  scope.basePath = typeof config.http?.basePath === 'string' ? config.http.basePath : ''
  const session = projectSchema(scope, config.session, '/session', '#session')
  const routes: Record<string, RouteIR> = {}
  for (const [id, route] of Object.entries(config.routes ?? {})) {
    const p = join('', 'routes', id)
    scope.mark(p, route)
    if (scope.routes.has(route)) {
      scope.report(
        'HZ013',
        null,
        p,
        `Route is already registered as ${scope.routes.get(route)}`,
        'Each route identity is registered once.',
      )
      continue
    }
    scope.routes.set(route, id)
    scope.bindings.refs.set(route, `#route:${id}`)
    const def = defOf<RouteDef>(route)
    routes[id] = {
      path: def.path,
      params: projectSchema(scope, def.params, join(p, 'params'), `#route:${id}`),
      search: projectSchema(scope, def.search ?? null, join(p, 'search'), `#search:${id}`),
    }
  }

  const configs: [string, FeatureParts][] = []
  for (const [i, f] of (config.features ?? []).entries()) {
    const fi = infoOf(f)
    if (fi?.kind !== 'feature') {
      scope.report(
        'HZ014',
        null,
        join('', 'features', i),
        'features must contain feature() declarations',
        'Unknown value in project({ features }).',
      )
      continue
    }
    const fc = partsOf(scope, fi.def as FeatureConfig)
    const p = join('', 'features', fc.id)
    scope.mark(p, f)
    if (!IDENTIFIER.test(fc.id))
      scope.report(
        'HZ014',
        fc.id,
        p,
        `Feature id "${fc.id}" is not an identifier`,
        'Ids must match /^[A-Za-z][A-Za-z0-9_]*$/.',
      )
    if (configs.some(([id]) => id === fc.id)) {
      scope.report(
        'HZ013',
        fc.id,
        p,
        `Feature id "${fc.id}" is declared twice`,
        'Feature ids are unique within a project.',
      )
      continue
    }
    scope.features.set(f, fc.id)
    configs.push([fc.id, fc])
  }
  for (const [id, fc] of configs) {
    scope.configs.set(id, fc)
    register(scope, id, fc)
  }
  const kitDecls = registerKits(scope, config.kits, new Set(configs.map(([id]) => id)))
  if (!manifest) {
    const done = transformedDecls()
    const checked: [string | null, string, object][] = [
      ...configs.flatMap(([id, fc]) =>
        [
          ...(fc.machine ? [['machine', fc.machine] as const] : []),
          ...Object.entries(fc.views).map(([s, v]) => [`views/${s}`, v] as const),
          ...Object.entries(fc.components).map(([s, c]) => [`components/${s}`, c] as const),
        ].map(
          ([where, decl]) =>
            [id, join('', 'features', id, ...where.split('/')), decl] as [string, string, object],
        ),
      ),
      ...kitDecls.flatMap(([kit, decls]) =>
        Object.entries(decls).map(
          ([s, c]) => [null, join('', 'kits', kit, 'components', s), c] as [null, string, object],
        ),
      ),
    ]
    for (const [id, pointer, decl] of checked) {
      const file = infoOf(decl)?.source?.file ?? 'A feature file'
      if (!done.has(decl))
        scope.report(
          'HZ044',
          id,
          pointer,
          `${file} was loaded without the Hozu transform`,
          'Builder callbacks are written in ordinary TypeScript and lowered by @hozu/transform; without it, a comparison such as ctx.x === "a" is silently false.',
          {
            summary:
              'Run node with --import @hozu/transform/register (npm scripts from create-hozu do), or add hozuTransform() from @hozu/transform/vite to Vite / Vitest',
            snippet: 'node --import @hozu/transform/register serve.ts',
            patch: null,
          },
        )
    }
  }

  if (!manifest) {
    const free = freeNamesOf()
    for (const [id, fc] of configs)
      for (const [symbol, decl] of Object.entries(fc.fns)) {
        const names = free.get(decl)
        if (!names) continue
        const list = names.map((n) => `\`${n}\``).join(', ')
        scope.report(
          'HZ047',
          id,
          join('', 'features', id, 'fns', symbol),
          `fn ${symbol} uses ${list}, which ${names.length === 1 ? 'is' : 'are'} defined outside its impl`,
          'fn bodies are sent to the browser as source text. Module helpers that are self-contained are sent with them; imported names and mutable module state (let) are not, so the island would stop while the server still renders the page.',
          {
            summary: `Pass ${list} as input fields, or write ${names.length === 1 ? 'it' : 'them'} as a const helper in this module`,
            snippet: `const ${names[0]} = (…) => …   // declared in this module, not imported`,
            patch: null,
          },
        )
      }
  }

  const features: Record<string, FeatureIR> = {}
  for (const [id, fc] of configs) features[id] = buildFeature(scope, id, fc)

  const file = (url: unknown, feature: string | null, pointer: string): string | null => {
    const path = filePath(url)
    if (path) return path
    scope.report(
      'HZ014',
      feature,
      pointer,
      'Stylesheets must be file URLs',
      "Declare them with new URL('./file.css', import.meta.url).",
    )
    return null
  }
  scope.bindings.styles.entry = config.styles == null ? null : file(config.styles, null, '/styles')
  if (config.app != null && !filePath(config.app))
    scope.report(
      'HZ014',
      null,
      '/app',
      'project({ app }) must be a file URL',
      "Name the app module with new URL('./app.ts', import.meta.url).",
    )
  for (const [i, kit] of (Array.isArray(config.kits) ? config.kits : []).entries()) {
    const def = infoOf(kit)?.kind === 'kit' ? (infoOf(kit)!.def as KitDef) : null
    if (!def?.styles || !kitDecls.some(([id]) => id === def.id)) continue
    const path = file(def.styles, null, join('', 'kits', i, 'styles'))
    if (path) scope.bindings.styles.kits[def.id] = path
  }
  for (const [id, fc] of configs)
    scope.bindings.styles.features[id] = (fc.styles ?? []).flatMap(
      (u, i) => file(u, id, join('', 'features', id, 'styles', i)) ?? [],
    )

  const kits: Record<string, KitIR> = {}
  for (const [kit, decls] of kitDecls) {
    const ks = new FeatureScope(scope, kit, join('', 'kits', kit))
    const components = Object.fromEntries(
      Object.entries(decls).map(([s, c]) => [s, buildComponent(ks, ks.at('components', s), c)]),
    )
    kits[kit] = { schemas: ks.schemas, components }
  }

  const pages = buildPages(scope, config.pages ?? [])

  const site = config.site
    ? {
        url: String(config.site.url).replace(/\/$/, ''),
        name: String(config.site.name),
        lang: String(config.site.lang),
        icon: scope.asset(config.site.icon)?.href ?? null,
        themeColor: config.site.themeColor ?? null,
        locales: Array.isArray(config.site.locales) ? config.site.locales.map(String) : null,
        offline: config.site.offline ? (scope.routes.get(config.site.offline) ?? '?') : null,
      }
    : null
  const notFound = config.notFound ? (scope.routes.get(config.notFound) ?? null) : null
  if (config.notFound && !notFound)
    scope.report(
      'HZ007',
      null,
      '/notFound',
      'notFound is not a registered route',
      'Register it in project({ routes }).',
    )
  const error = config.error ? (scope.routes.get(config.error) ?? null) : null
  if (config.error && !error)
    scope.report(
      'HZ007',
      null,
      '/error',
      'error is not a registered route',
      'Register it in project({ routes }).',
    )
  scope.mark('/http', project)
  scope.mark('/site', project)
  const http = buildHttp(scope, config.http)
  const env = config.env
    ? {
        server: projectSchema(scope, config.env.server, '/env/server', '#env:server'),
        public: projectSchema(scope, config.env.public, '/env/public', '#env:public'),
      }
    : null
  scope.bindings.env = { server: toParse(config.env?.server), public: toParse(config.env?.public) }
  const ir: ProjectIR = {
    irVersion: 3,
    site,
    session,
    routes,
    pages,
    notFound,
    error,
    http,
    env,
    features,
    kits,
  }
  reportSharedParts(scope, new Set(Object.keys(features)))
  scope.bindings.assetOrder = scope.assetList
  for (const d of scope.diagnostics) d.location.source ??= resolveSource(scope.sources, d.location.pointer)
  return {
    ir,
    bindings: scope.bindings,
    sources: scope.sources,
    nodes: scope.nodes,
    diagnostics: scope.diagnostics,
    parts: [...scope.parts.values()],
  }
}

function registerKits(
  scope: ProjectScope,
  list: unknown,
  features: Set<string>,
): [string, Record<string, object>][] {
  const out: [string, Record<string, object>][] = []
  for (const [i, kit] of (Array.isArray(list) ? list : []).entries()) {
    const p = join('', 'kits', i)
    scope.mark(p, kit)
    const info = infoOf(kit)
    if (info?.kind !== 'kit') {
      scope.report(
        'HZ014',
        null,
        p,
        'kits must contain ui.kit() declarations',
        `Got ${info?.kind ?? typeof kit}.`,
      )
      continue
    }
    const def = info.def as KitDef
    const id = String(def.id)
    if (!IDENTIFIER.test(id))
      scope.report(
        'HZ014',
        null,
        join(p, 'id'),
        `Kit id "${id}" is not an identifier`,
        'Ids must match /^[A-Za-z][A-Za-z0-9_]*$/.',
      )
    if (features.has(id) || out.some(([k]) => k === id)) {
      scope.report(
        'HZ013',
        null,
        join(p, 'id'),
        features.has(id) ? `Kit id "${id}" is also a feature id` : `Kit id "${id}" is declared twice`,
        'Component ids are owner.Name, so kit and feature ids share one namespace (ADR 0045 A).',
        { summary: `Rename the kit`, snippet: `ui.kit({ id: '${id}Kit', components: [...] })`, patch: null },
      )
      continue
    }
    const decls: Record<string, object> = {}
    for (const [m, module] of (Array.isArray(def.components) ? def.components : []).entries())
      for (const [name, decl] of Object.entries(module as Record<string, unknown>)) {
        if (infoOf(decl)?.kind !== 'component') continue
        const at = join(p, 'components', m, name)
        scope.mark(at, decl)
        const taken = scope.components.get(decl as object)
        if (decls[name] !== undefined || taken) {
          if (decls[name] !== decl || taken)
            scope.report(
              'HZ013',
              null,
              at,
              taken
                ? `This component is already declared as ${taken.id}`
                : `"${name}" is declared by two of the kit's modules`,
              'A component has one owner: one kit or one feature.',
            )
          continue
        }
        decls[name] = decl as object
        scope.mark(join('', 'kits', id, 'components', name), decl)
        scope.components.set(decl as object, { id: `${id}.${name}`, owner: { kind: 'kit', id } })
      }
    out.push([id, decls])
  }
  return out
}

export function appModuleOf(project: unknown): string | null {
  const info = infoOf(project)
  return info?.kind === 'project' ? filePath((info.def as ProjectConfig).app) : null
}
