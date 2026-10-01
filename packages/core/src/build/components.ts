import type { ComponentDef } from '../builders/component.ts'
import type { NodeDef } from '../builders/ui.ts'
import { hashJson } from '../canonical/hash.ts'
import type { Fix } from '../ir/diagnostic.ts'
import { htmlTags, svgTags } from '../ir/dom-data.ts'
import type { ComponentIR, JsonSchema } from '../ir/types.ts'
import { infoOf } from '../model/decl.ts'
import { createRef } from '../model/expr.ts'
import { isStandardSchema } from '../schema/standard.ts'
import { type At, at, type FeatureScope, type ProjectScope } from './scope.ts'

export const notYet = (what: string, phase: number): [message: string, cause: string, fix: Fix] => [
  `${what} is not supported until ADR 0045 phase ${phase}`,
  `0.9 records pure components from phase 2; client components arrive in phase ${phase} (docs/adr/0045-0-9-ui-components.md).`,
  {
    summary: 'Keep this component pure (no client, load or emits), or keep it a ui.widget until then',
    snippet: null,
    patch: null,
  },
]

export interface ComponentOwnerRef {
  kind: 'kit' | 'feature'
  id: string
}

export interface ComponentEntry {
  id: string
  owner: ComponentOwnerRef
}

type Classes = string | readonly Classes[] | Record<string, unknown> | null | undefined | false

export interface TvConfig {
  base?: Classes
  slots?: Record<string, Classes>
  variants?: Record<string, Record<string, Classes>>
  defaultVariants?: Record<string, unknown>
  compoundVariants?: readonly Record<string, unknown>[]
}

const elementTags = new Set<string>([...htmlTags, ...svgTags])

export const tokens = (value: unknown): string[] =>
  typeof value === 'string'
    ? value.split(/\s+/).filter(Boolean)
    : Array.isArray(value)
      ? value.flatMap(tokens)
      : []

const rootPart = (value: unknown): unknown =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>).base
    : value

export const tvOf = (def: ComponentDef): TvConfig | null => (def.styles ?? null) as TvConfig | null

export const variantsOf = (tv: TvConfig | null): Record<string, string[]> =>
  Object.fromEntries(Object.entries(tv?.variants ?? {}).map(([k, values]) => [k, Object.keys(values ?? {})]))

export const defaultsOf = (tv: TvConfig | null): Record<string, string> =>
  Object.fromEntries(
    Object.entries(tv?.defaultVariants ?? {})
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => [k, String(v)]),
  )

function rootToggles(def: ComponentDef): string[] {
  try {
    const props = createRef('binding', 0, ['props'])
    const root = def.render({ props, slots: {}, children: [], on: {}, classes: {} })
    const d = infoOf(root)?.kind === 'node' ? (infoOf(root)!.def as NodeDef) : null
    return d?.kind === 'el' ? Object.keys((d.props?.toggle ?? {}) as object).flatMap(tokens) : []
  } catch {
    return []
  }
}

export function ownedOf(def: ComponentDef): string[] {
  const tv = tvOf(def)
  const classes = [
    ...tokens(tv?.slots ? (tv.slots.base ?? tv.base) : tv?.base),
    ...Object.values(tv?.variants ?? {}).flatMap((values) =>
      Object.values(values ?? {}).flatMap((v) => tokens(rootPart(v))),
    ),
    ...(tv?.compoundVariants ?? []).flatMap((c) => tokens(rootPart(c.class ?? c.className))),
    ...rootToggles(def),
  ]
  return [...new Set(classes)].sort()
}

export function schemaJson(project: ProjectScope, schema: unknown): JsonSchema | null {
  if (!isStandardSchema(schema) || !project.adapter) return null
  if (schema['~standard'].vendor !== project.adapter.vendor) return null
  let hit = project.schemaCache.get(schema)
  if (!hit) {
    const json = project.adapter.toJsonSchema(schema)
    hit = { json, hash: `s_${hashJson(json).slice(0, 16)}` }
    project.schemaCache.set(schema, hit)
  }
  return hit.json
}

export function buildComponent(scope: FeatureScope, p: At, decl: object): ComponentIR {
  const def = infoOf(decl)!.def as ComponentDef
  const tv = tvOf(def)
  if (def.client !== null) scope.report('HZ014', at(p, 'client'), ...notYet('A client ui.component', 4))
  if (!elementTags.has(def.tag))
    scope.report(
      'HZ014',
      at(p, 'tag'),
      `Component tag "${def.tag}" is not an HTML or SVG element`,
      'tag names the element the render returns.',
    )
  if (typeof def.render !== 'function')
    scope.report('HZ014', at(p, 'render'), 'A component needs a render', 'render returns the root element.')
  const empty = `s_${hashJson({}).slice(0, 16)}`
  if (def.props === null) scope.schemas[empty] = {}
  return {
    tag: def.tag,
    props: def.props === null ? empty : scope.schema(def.props, at(p, 'props')),
    variants: variantsOf(tv),
    defaults: defaultsOf(tv),
    slots: [...def.slots],
    children: def.children,
    events: [...def.events],
    emits: Object.fromEntries(
      Object.entries(def.emits).map(([name, s]) => [name, scope.schema(s, at(p, 'emits', name))]),
    ),
    extend: def.extend,
    owned: ownedOf(def),
    client: null,
    sourceHash: scope.fingerprint(
      `${def.tag}\n${String(def.render)}\n${JSON.stringify(tv ? { base: tv.base, slots: tv.slots, variants: tv.variants, defaultVariants: tv.defaultVariants, compoundVariants: tv.compoundVariants } : null)}`,
    ),
  }
}
