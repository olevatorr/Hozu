import { assetOf } from '../builders/asset.ts'
import type { FeatureConfig, ProjectConfig } from '../builders/feature.ts'
import type { RouteDef } from '../builders/route.ts'
import { join, resolveSource } from '../canonical/pointer.ts'
import type { Bindings } from '../ir/bindings.ts'
import type { Diagnostic, SourceIndex } from '../ir/diagnostic.ts'
import type { FeatureIR, JsonSchema, ProjectIR, RouteIR } from '../ir/types.ts'
import { type DeclKind, defOf, infoOf } from '../model/decl.ts'
import type { SchemaAdapterDef } from '../schema/adapter.ts'
import { toCheck } from '../schema/check.ts'
import { isStandardSchema } from '../schema/standard.ts'
import { withCapture } from '../source/capture.ts'
import { buildFeature } from './feature.ts'
import { buildPages } from './page.ts'
import { filePath, IDENTIFIER, ProjectScope } from './scope.ts'

export interface BuildResult {
  ir: ProjectIR
  bindings: Bindings
  sources: SourceIndex
  diagnostics: Diagnostic[]
}

export const UNEXPECTED_ERROR_SCHEMA: JsonSchema = {
  type: 'object',
  properties: { message: { type: 'string' } },
  required: ['message'],
  additionalProperties: false,
}

const registries: [keyof FeatureConfig, DeclKind][] = [
  ['tags', 'tag'],
  ['events', 'event'],
  ['queries', 'query'],
  ['mutations', 'mutation'],
  ['fns', 'fn'],
  ['views', 'view'],
  ['widgets', 'widget'],
  ['contracts', 'contract'],
]

function register(scope: ProjectScope, id: string, config: FeatureConfig) {
  const base = join('', 'features', id)
  const claim = (decl: object, symbol: string, kind: DeclKind, pointer: string) => {
    scope.mark(pointer, decl)
    if (!IDENTIFIER.test(symbol))
      scope.report(
        'TN014',
        id,
        pointer,
        `Name "${symbol}" is not an identifier`,
        'Names must match /^[A-Za-z][A-Za-z0-9_]*$/.',
      )
    const info = infoOf(decl)
    if (info?.kind !== kind) {
      scope.report(
        'TN014',
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
        'TN013',
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
  }
  for (const [key, kind] of registries)
    for (const [symbol, decl] of Object.entries((config[key] ?? {}) as Record<string, object>))
      claim(decl, symbol, kind, join(base, key, symbol))
  if (config.machine) claim(config.machine, 'machine', 'machine', join(base, 'machine'))
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
      'TN014',
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
      'TN012',
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
}

export function buildProject(project: unknown, options: BuildOptions = {}): BuildResult {
  const sources = options.sources ?? true
  return withCapture(sources, () => build(project, sources))
}

function build(project: unknown, tracking: boolean): BuildResult {
  const info = infoOf(project)
  if (info?.kind !== 'project')
    throw new TypeError('Expected a project() declaration as the default export of tenon.config.ts')
  const config = info.def as ProjectConfig
  const scope = new ProjectScope(tracking)
  const adapter = infoOf(config.schema)
  if (adapter?.kind === 'adapter') scope.adapter = adapter.def as SchemaAdapterDef
  else
    scope.report(
      'TN012',
      null,
      '/schema',
      'project({ schema }) must be a schema adapter',
      'Use an adapter such as zodAdapter from @tenon/schema-zod.',
    )

  const session = projectSchema(scope, config.session, '/session', '#session')
  const routes: Record<string, RouteIR> = {}
  for (const [id, route] of Object.entries(config.routes ?? {})) {
    const p = join('', 'routes', id)
    scope.mark(p, route)
    if (scope.routes.has(route)) {
      scope.report(
        'TN013',
        null,
        p,
        `Route is already registered as ${scope.routes.get(route)}`,
        'Each route identity is registered once.',
      )
      continue
    }
    scope.routes.set(route, id)
    const def = defOf<RouteDef>(route)
    routes[id] = {
      path: def.path,
      params: projectSchema(scope, def.params, join(p, 'params'), `#route:${id}`),
    }
  }

  const configs: [string, FeatureConfig][] = []
  for (const [i, f] of (config.features ?? []).entries()) {
    const fi = infoOf(f)
    if (fi?.kind !== 'feature') {
      scope.report(
        'TN014',
        null,
        join('', 'features', i),
        'features must contain feature() declarations',
        'Unknown value in project({ features }).',
      )
      continue
    }
    const fc = fi.def as FeatureConfig
    const p = join('', 'features', fc.id)
    scope.mark(p, f)
    if (!IDENTIFIER.test(fc.id))
      scope.report(
        'TN014',
        fc.id,
        p,
        `Feature id "${fc.id}" is not an identifier`,
        'Ids must match /^[A-Za-z][A-Za-z0-9_]*$/.',
      )
    if (configs.some(([id]) => id === fc.id)) {
      scope.report(
        'TN013',
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
  for (const [id, fc] of configs) register(scope, id, fc)

  const features: Record<string, FeatureIR> = {}
  for (const [id, fc] of configs) features[id] = buildFeature(scope, id, fc)

  const file = (url: unknown, feature: string | null, pointer: string): string | null => {
    const path = filePath(url)
    if (path) return path
    scope.report(
      'TN014',
      feature,
      pointer,
      'Stylesheets must be file URLs',
      "Declare them with new URL('./file.css', import.meta.url).",
    )
    return null
  }
  scope.bindings.styles.entry = config.styles == null ? null : file(config.styles, null, '/styles')
  for (const [id, fc] of configs)
    scope.bindings.styles.features[id] = (fc.styles ?? []).flatMap(
      (u, i) => file(u, id, join('', 'features', id, 'styles', i)) ?? [],
    )

  const pages = buildPages(scope, config.pages ?? [])

  const site = config.site
    ? {
        url: String(config.site.url).replace(/\/$/, ''),
        name: String(config.site.name),
        lang: String(config.site.lang),
        icon: assetOf(config.site.icon)?.href ?? null,
        themeColor: config.site.themeColor ?? null,
      }
    : null
  const icon = assetOf(config.site?.icon)
  if (icon) scope.bindings.assets[icon.href] = { file: icon.file, width: icon.width, height: icon.height }
  const notFound = config.notFound ? (scope.routes.get(config.notFound) ?? null) : null
  if (config.notFound && !notFound)
    scope.report(
      'TN007',
      null,
      '/notFound',
      'notFound is not a registered route',
      'Register it in project({ routes }).',
    )
  const ir: ProjectIR = { irVersion: 1, site, session, routes, pages, notFound, features }
  for (const d of scope.diagnostics) d.location.source = resolveSource(scope.sources, d.location.pointer)
  return { ir, bindings: scope.bindings, sources: scope.sources, diagnostics: scope.diagnostics }
}
