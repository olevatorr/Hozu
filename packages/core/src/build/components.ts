import type { ComponentDef } from '../builders/component.ts'
import { builtinOf, messageKeyOf } from '../builders/i18n.ts'
import { linkOf, type NodeDef, sendOf } from '../builders/ui.ts'
import { hashJson, sha256 } from '../canonical/hash.ts'
import { htmlTags, svgTags } from '../ir/dom-data.ts'
import type { ComponentIR, ComponentLoad, JsonSchema } from '../ir/types.ts'
import { infoOf } from '../model/decl.ts'
import { createRef, exprOf, guardOf, ReferenceEscape } from '../model/expr.ts'
import { builtin } from '../platform.ts'
import { isStandardSchema } from '../schema/standard.ts'
import { type At, at, type FeatureScope, filePath, type ProjectScope } from './scope.ts'

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

export function rootClasses(
  styles: unknown,
  chosen: Record<string, unknown>,
): { root: string[]; classes: Record<string, string> } {
  if (typeof styles !== 'function') return { root: [], classes: {} }
  const out = styles(chosen)
  if (typeof out === 'string') return { root: tokens(out), classes: {} }
  const slots = (out ?? {}) as Record<string, () => string>
  const classes: Record<string, string> = {}
  for (const [name, slot] of Object.entries(slots))
    if (name !== 'base' && typeof slot === 'function') classes[name] = tokens(slot()).join(' ')
  return { root: tokens(typeof slots.base === 'function' ? slots.base() : ''), classes }
}

const placeholder = (name: string) => createRef('binding', 0, [name])

const CLOSED_FIX: Record<string, [summary: string, snippet: string]> = {
  event: [
    'Declare an event in the component and pass the Send through on: events: ["press"], then on: { click: on.press }',
    "events: ['press'], render: ({ on }) => ui.button({ on: { click: on.press } }, [])",
  ],
  route: [
    'Take the URL as a prop: props: z.object({ href: z.string() }), and pass href: ui.link(route, params) at the use',
    'props: z.object({ href: z.string() }), render: ({ props }) => ui.a({ href: props.href }, [])',
  ],
}
const OTHER_FIX: [string, string] = [
  'Pass what the render needs as a prop, a slot or children instead of referencing it',
  "slots: ['label'], render: ({ slots }) => ui.span({}, [slots.label])",
]

type Found = Map<object, [kind: string, name: string]>

function references(project: ProjectScope, root: unknown): Found {
  const found: Found = new Map()
  const seen = new WeakSet<object>()
  const binding = placeholder('item')
  const declared = (v: object) => {
    const owner = project.owners.get(v)
    if (owner && owner.kind !== 'component') found.set(v, [owner.kind, `${owner.feature}.${owner.symbol}`])
    const route = project.routes.get(v)
    if (route) found.set(v, ['route', route])
  }
  const visit = (v: unknown): void => {
    if (v === null || (typeof v !== 'object' && typeof v !== 'function') || seen.has(v)) return
    seen.add(v)
    const expr = exprOf(v)
    const guard = guardOf(v)
    const send = sendOf(v)
    const link = linkOf(v)
    const info = infoOf(v)
    if (expr) {
      if (expr.kind !== 'call') return
      const message = messageKeyOf(expr.fn)
      const owner = message ? project.owners.get(message.decl) : null
      if (message && owner) found.set(message.decl, ['messages', `${owner.feature}.${message.key}`])
      else if (!builtinOf(expr.fn)) declared(expr.fn)
      visit(expr.arg)
    } else if (guard) Object.values(guard).forEach(visit)
    else if (send) {
      declared(send.event)
      visit(send.payload)
    } else if (link) {
      declared(link.route as object)
      visit(link.params)
      visit(link.search)
    } else if (info?.kind === 'node') {
      for (const [key, x] of Object.entries(info.def as NodeDef))
        if (typeof x === 'function') visit(x(binding))
        else if (key === 'failed')
          for (const f of Object.values((x ?? {}) as Record<string, unknown>))
            visit(typeof f === 'function' ? f(binding) : f)
        else visit(x)
    } else if (info) declared(v)
    else if (typeof v === 'object') Object.values(v).forEach(visit)
  }
  visit(root)
  return found
}

function innerClasses(root: Extract<NodeDef, { kind: 'el' }>): string[] {
  const out = new Set<string>()
  const seen = new WeakSet<object>()
  const binding = placeholder('item')
  const visit = (v: unknown): void => {
    if (v === null || (typeof v !== 'object' && typeof v !== 'function') || seen.has(v)) return
    seen.add(v)
    const expr = exprOf(v)
    if (expr) {
      if (expr.kind === 'call') visit(expr.arg)
      return
    }
    if (guardOf(v) || sendOf(v) || linkOf(v)) return
    const info = infoOf(v)
    if (info?.kind === 'node') {
      const d = info.def as NodeDef
      if (d.kind === 'el') {
        for (const c of tokens(d.props?.class)) out.add(c)
        for (const k of Object.keys((d.props?.toggle ?? {}) as object)) for (const c of tokens(k)) out.add(c)
        d.children.forEach(visit)
      } else if (d.kind === 'component') {
        const o = (d.options ?? {}) as Record<string, unknown>
        for (const c of tokens(o.class)) out.add(c)
        visit(o.slots)
        d.children.forEach(visit)
      } else
        for (const [key, x] of Object.entries(d))
          if (key === 'kind') continue
          else if (typeof x === 'function') visit(x(binding))
          else if (key === 'failed')
            for (const f of Object.values((x ?? {}) as Record<string, unknown>))
              visit(typeof f === 'function' ? f(binding) : f)
          else visit(x)
    } else if (!info && typeof v === 'object') Object.values(v).forEach(visit)
  }
  root.children.forEach(visit)
  return [...out].sort()
}

/** Builds the render once under reference props, slots, children and on (ADR 0045 B, C). */
function declaredRender(scope: FeatureScope, p: At, def: ComponentDef, id: string): NodeDef | null {
  try {
    const root = def.render({
      props: placeholder('props'),
      slots: placeholder('slots'),
      children: [placeholder('children')],
      on: placeholder('on'),
      classes: rootClasses(def.styles, {}).classes,
    })
    for (const [kind, name] of references(scope.project, root).values()) {
      const [summary, snippet] = CLOSED_FIX[kind] ?? OTHER_FIX
      scope.report(
        'HZ070',
        p,
        `The render of ${id} references ${kind} ${name}`,
        'A component render is closed: it reads only its props, slots, children and on, so a caller decides every event, query, route, view, fn, message and tag it reaches (ADR 0045 C).',
        { summary, snippet, patch: null },
      )
    }
    const info = infoOf(root)
    const node = info?.kind === 'node' ? (info.def as NodeDef) : null
    if (node?.kind === 'el') scope.project.bindings.components[id] = { inner: innerClasses(node) }
    return node
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    scope.project.report(
      error instanceof ReferenceEscape ? 'HZ059' : 'HZ014',
      scope.id,
      p,
      `The render of ${id} does not build under reference props: ${message}`,
      'Props are the state of a component and may be references (ADR 0045 B), so a render must build with reference props, slots, children and on; a value that must be a literal is a variant.',
      {
        summary:
          'Compute the value in the caller and pass the result as a prop, make it a variant when it picks among fixed options, or use a fn() for a value',
        snippet: 'props: z.object({ label: z.string() }) // at the use: props: { label: ctx.title }',
        patch: null,
      },
      error instanceof ReferenceEscape ? error.source : null,
    )
    return null
  }
}

export function ownedOf(def: ComponentDef, root: NodeDef | null): string[] {
  const tv = tvOf(def)
  const toggles = root?.kind === 'el' ? Object.keys((root.props?.toggle ?? {}) as object).flatMap(tokens) : []
  const classes = [
    ...tokens(tv?.slots ? (tv.slots.base ?? tv.base) : tv?.base),
    ...Object.values(tv?.variants ?? {}).flatMap((values) =>
      Object.values(values ?? {}).flatMap((v) => tokens(rootPart(v))),
    ),
    ...(tv?.compoundVariants ?? []).flatMap((c) => tokens(rootPart(c.class ?? c.className))),
    ...toggles,
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

const loads = new Set<unknown>(['eager', 'visible', 'idle'])

function clientOf(scope: FeatureScope, p: At, def: ComponentDef, id: string): ComponentIR['client'] {
  if (def.client === null) return null
  const listed = scope.project.manifest?.components[id]
  const fs = builtin('node:fs')
  const file = filePath(def.client)
  let sourceHash = ''
  if (listed) sourceHash = listed.hash
  else if (!file || !fs?.existsSync(file))
    scope.report(
      'HZ029',
      at(p, 'client'),
      file ? `Component module ${file} does not exist` : 'A component client must be a file URL',
      "Declare it with new URL('./my-component.client.ts', import.meta.url) and default-export implement<typeof MyComponent>(…) from @hozu/core/component.",
      {
        summary: 'Create the client module, or point client at it with a file URL',
        snippet: "client: new URL('./my-component.client.ts', import.meta.url)",
        patch: null,
      },
    )
  else {
    scope.project.bindings.clients[id] = file
    sourceHash = sha256(fs.readFileSync(file, 'utf8')).slice(0, 16)
  }
  if (!loads.has(def.load))
    scope.report('HZ014', at(p, 'load'), `Invalid load "${def.load}"`, "Use 'eager', 'visible' or 'idle'.")
  return { load: loads.has(def.load) ? (def.load as ComponentLoad) : 'visible', sourceHash }
}

export function buildComponent(scope: FeatureScope, p: At, decl: object): ComponentIR {
  const def = infoOf(decl)!.def as ComponentDef
  const tv = tvOf(def)
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
  const id = scope.project.components.get(decl)?.id ?? `${scope.id}.?`
  const root = typeof def.render === 'function' ? declaredRender(scope, p, def, id) : null
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
    owned: ownedOf(def, root),
    client: clientOf(scope, p, def, id),
    sourceHash:
      scope.project.manifest?.sources?.components[id] ??
      scope.fingerprint(
        `${def.tag}\n${String(def.render)}\n${JSON.stringify(tv ? { base: tv.base, slots: tv.slots, variants: tv.variants, defaultVariants: tv.defaultVariants, compoundVariants: tv.compoundVariants } : null)}`,
      ),
  }
}
