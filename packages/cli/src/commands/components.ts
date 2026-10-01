import { relative } from 'node:path'
import {
  type BuildResult,
  type ComponentIR,
  hashJson,
  type Json,
  type JsonSchema,
  type ProjectIR,
  resolveSource,
} from '@hozu/core/ir'
import { closest } from '@hozu/validator'
import type {
  ComponentImpact,
  ComponentOwner,
  ComponentUseSite,
  DocsComponent,
  DocsComponentProp,
  InspectComponentOutput,
} from '../contract.ts'
import { HozuCliError } from '../errors.ts'
import { componentUses } from '../uses.ts'
import { shapeOf } from './map.ts'

export interface ComponentEntry {
  id: string
  owner: ComponentOwner
  ir: ComponentIR
  schemas: Record<string, JsonSchema>
  pointer: string
}

export function componentEntries(ir: ProjectIR): ComponentEntry[] {
  const kits = Object.entries(ir.kits).flatMap(([kit, k]) =>
    Object.entries(k.components).map(([name, c]) => ({
      id: `${kit}.${name}`,
      owner: { kind: 'kit' as const, id: kit },
      ir: c,
      schemas: k.schemas,
      pointer: `/kits/${kit}/components/${name}`,
    })),
  )
  const features = Object.values(ir.features).flatMap((f) =>
    Object.entries(f.components).map(([name, c]) => ({
      id: `${f.id}.${name}`,
      owner: { kind: 'feature' as const, id: f.id },
      ir: c,
      schemas: f.schemas,
      pointer: `/features/${f.id}/components/${name}`,
    })),
  )
  return [...kits, ...features]
}

export function findComponent(ir: ProjectIR, id: string): ComponentEntry | null {
  return componentEntries(ir).find((c) => c.id === id) ?? null
}

export function requireComponent(ir: ProjectIR, id: string | undefined): ComponentEntry {
  const all = componentEntries(ir)
  if (!id)
    throw new HozuCliError(
      'usage',
      'Missing <component> argument, e.g. ui.Button',
      all.map((c) => c.id),
    )
  const entry = all.find((c) => c.id === id)
  if (entry) return entry
  const guess = closest(
    id,
    all.map((c) => c.id),
  )
  throw new HozuCliError(
    'unknown-feature',
    `Unknown component "${id}"`,
    guess ? [guess] : all.map((c) => c.id),
  )
}

type Schema = {
  properties?: Record<string, Schema & { default?: Json }>
  required?: string[]
}

export function propsOf(entry: ComponentEntry): DocsComponentProp[] {
  const schema = (entry.schemas[entry.ir.props] ?? {}) as Schema
  const required = new Set(schema.required ?? [])
  return Object.entries(schema.properties ?? {}).map(([name, s]) => ({
    name,
    type: shapeOf(s as never),
    required: required.has(name) && !('default' in s),
    ...('default' in s ? { default: s.default as Json } : {}),
  }))
}

export function docsComponent(entry: ComponentEntry): DocsComponent {
  const c = entry.ir
  return {
    id: entry.id,
    owner: entry.owner,
    tag: c.tag,
    variants: Object.fromEntries(
      Object.entries(c.variants).map(([k, values]) => [k, { values, default: c.defaults[k] ?? null }]),
    ),
    props: propsOf(entry),
    slots: c.slots,
    children: c.children,
    events: c.events,
    emits: Object.keys(c.emits),
    extend: c.extend,
    client: c.client?.load ?? null,
  }
}

export function describeCatalog(components: DocsComponent[]): string {
  if (!components.length)
    return '\nIn this app: no components (hozu add kit ui, then hozu add component ui Button)\n'
  const lines = components.map((c) => {
    const variants = Object.keys(c.variants)
    return `  ${c.id} <${c.tag}>${variants.length ? ` ${variants.join(' ')}` : ''}${c.client ? ' (client)' : ''}`
  })
  return `\nIn this app:\n${lines.join('\n')}\nhozu inspect <id>: props, slots, events and every use\n`
}

const usesOf = (build: BuildResult, cwd: string, id: string): ComponentUseSite[] =>
  componentUses(build.ir, build.sources, cwd)
    .filter(([c]) => c === id)
    .map(([, site]) => site)

export function inspectComponent(build: BuildResult, cwd: string, id: string): InspectComponentOutput {
  const entry = requireComponent(build.ir, id)
  return {
    component: entry.id,
    owner: entry.owner,
    hash: hashJson(entry.ir),
    ir: entry.ir,
    uses: usesOf(build, cwd, entry.id),
  }
}

export function impactComponent(build: BuildResult, cwd: string, entry: ComponentEntry): ComponentImpact {
  const uses = usesOf(build, cwd, entry.id)
  return {
    target: entry.id,
    kind: 'component',
    owner: entry.owner,
    uses,
    features: [...new Set(uses.map((u) => u.feature))].sort(),
  }
}

const value = (v: Json) => JSON.stringify(v)

export function describeUse(u: ComponentUseSite): string {
  const variant = Object.entries(u.variant).map(([k, v]) => `${k}=${v}`)
  const added = u.added.filter((c) => !u.overrides.includes(c))
  return [
    `  ${u.node}${u.at ? `  ${u.at}` : ''}`,
    variant.length ? ` · ${variant.join(' ')}` : '',
    added.length ? ` · adds ${added.join(' ')}` : '',
    u.overrides.length ? ` · overrides ${u.overrides.join(' ')}` : '',
  ].join('')
}

export function describeComponent(build: BuildResult, cwd: string, out: InspectComponentOutput): string {
  const entry = findComponent(build.ir, out.component)!
  const doc = docsComponent(entry)
  const source = resolveSource(build.sources, entry.pointer)
  const lines = [
    `${out.component} <${doc.tag}> · ${out.owner.kind} ${out.owner.id}${source ? `  ${relative(cwd, source.file)}:${source.line}` : ''}`,
  ]
  for (const [k, v] of Object.entries(doc.variants))
    lines.push(`variant ${k}: ${v.values.map((x) => (x === v.default ? `${x}*` : x)).join(' ')}`)
  if (doc.props.length)
    lines.push(
      `props ${doc.props
        .map(
          (p) =>
            `${p.name}${p.required ? '' : '?'}: ${p.type}${p.default === undefined ? '' : ` = ${value(p.default)}`}`,
        )
        .join(', ')}`,
    )
  const shape = [
    doc.slots.length ? `slots ${doc.slots.join(' ')}` : '',
    doc.children ? 'children' : '',
    doc.events.length ? `events ${doc.events.join(' ')}` : '',
    doc.emits.length ? `emits ${doc.emits.join(' ')}` : '',
    doc.extend ? '' : 'extend false',
    doc.client ? `client ${doc.client}` : '',
  ].filter(Boolean)
  if (shape.length) lines.push(shape.join(' · '))
  if (out.ir.owned.length) lines.push(`owned ${out.ir.owned.join(' ')}`)
  lines.push(`uses ${out.uses.length}`, ...out.uses.map(describeUse), '')
  return lines.join('\n')
}

export function describeComponentImpact(out: ComponentImpact): string {
  return [
    `${out.target}  (component, ${out.owner.kind} ${out.owner.id})`,
    'uses:',
    ...(out.uses.length ? out.uses.map(describeUse) : ['  (none)']),
    `features: ${out.features.join(', ') || '(none)'}`,
    '',
  ].join('\n')
}
