import { relative } from 'node:path'
import {
  accessSummary,
  appModuleOf,
  type BuildResult,
  type Freshness,
  type JsonSchema,
  type ProjectIR,
  resolveSource,
} from '@hozu/core/ir'
import type { MapFeature, MapFile, MapOutput, MapState } from '../contract.ts'
import type { Loaded } from '../load.ts'
import { componentUses } from '../uses.ts'

const local = (ref: string) => ref.slice(ref.indexOf('.') + 1)

const fieldsOf = (schema: JsonSchema | undefined): string[] => {
  const props =
    schema && typeof schema === 'object' ? (schema as { properties?: object }).properties : undefined
  return props ? Object.keys(props) : []
}

const freshnessText = (f: Freshness) => ('seconds' in f ? `${f.kind} ${f.seconds}s` : f.kind)

type Schema = {
  type?: string | string[]
  properties?: Record<string, Schema>
  required?: string[]
  items?: Schema
  enum?: unknown[]
  const?: unknown
  anyOf?: Schema[]
}

export function shapeOf(schema: Schema): string {
  if (schema.enum) return schema.enum.map((v) => JSON.stringify(v)).join(' | ')
  if ('const' in schema) return JSON.stringify(schema.const)
  if (schema.anyOf) return schema.anyOf.map(shapeOf).join(' | ')
  const type = Array.isArray(schema.type) ? schema.type.join(' | ') : schema.type
  if (type === 'object' && schema.properties) {
    const req = new Set(schema.required ?? [])
    const fields = Object.entries(schema.properties).map(
      ([k, v]) => `${k}${req.has(k) ? '' : '?'}: ${shapeOf(v)}`,
    )
    return `{ ${fields.join(', ')} }`
  }
  if (type === 'array') return `${shapeOf(schema.items ?? {})}[]`
  return type ?? 'unknown'
}

export function sampleOf(schema: Schema): unknown {
  if (schema.enum) return schema.enum[0]
  if ('const' in schema) return schema.const
  if (schema.anyOf) return sampleOf(schema.anyOf.find((s) => s.type !== 'null') ?? {})
  const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== 'null') : schema.type
  if (type === 'object')
    return Object.fromEntries(
      Object.entries(schema.properties ?? {})
        .filter(([k]) => schema.required?.includes(k))
        .map(([k, v]) => [k, sampleOf(v)]),
    )
  if (type === 'array') return []
  if (type === 'number' || type === 'integer') return 1
  if (type === 'boolean') return false
  return 'ada'
}

const verifyLine = (ir: ProjectIR) => {
  const paths = Object.keys(ir.pages).map((id) => ir.routes[id]!.path)
  const path = paths.find((p) => !p.includes(':')) ?? paths[0] ?? '/'
  const session = ir.session ? ` --session '${JSON.stringify(sampleOf(ir.session as Schema))}'` : ''
  return `npx hozu browse ${path}${session} --js both --do '…'`
}

function filesOf(build: BuildResult, cwd: string, app: string | null): MapFile[] {
  const roles = new Map<string, Set<string>>()
  for (const [pointer, source] of Object.entries(build.sources)) {
    const seg = pointer.split('/')
    const role = seg[1] === 'features' ? (seg[3] ?? 'feature') : seg[1]!
    const file = relative(cwd, source.file)
    if (!roles.has(file)) roles.set(file, new Set())
    roles.get(file)!.add(role)
  }
  if (app) roles.set(relative(cwd, app), new Set(['app', 'resolvers']))
  const rank = (file: string) => (file.includes('/') ? 1 : 0)
  return [...roles]
    .map(([file, set]) => ({ file, roles: [...set] }))
    .sort((a, b) => rank(a.file) - rank(b.file) || a.file.localeCompare(b.file))
}

export function runMap(loaded: Loaded, cwd: string): MapOutput {
  const build: BuildResult = loaded.build(true)
  const { ir } = build
  const at = (pointer: string) => {
    const s = resolveSource(build.sources, pointer)
    return s ? `${relative(cwd, s.file)}:${s.line}` : null
  }
  const uses = componentUses(ir, build.sources, cwd)
  const routes = Object.entries(ir.routes).map(([id, r]) => {
    const page = ir.pages[id]
    const views = page?.views ?? []
    const components = [
      ...new Set(
        uses.filter(([, u]) => views.some((v) => u.node.startsWith(`${v}/`))).map(([component]) => component),
      ),
    ].sort()
    return {
      id,
      path: r.path,
      search: fieldsOf(r.search ?? undefined),
      views: page?.views ?? [],
      head: page?.head.query?.ref ?? null,
      at: at(`/pages/${id}`) ?? at(`/routes/${id}`),
      ...(components.length ? { components } : {}),
    }
  })
  const features: MapFeature[] = Object.values(ir.features).map((f) => {
    const base = `/features/${f.id}`
    const m = f.machine
    const states: MapState[] = m
      ? Object.entries(m.states).map(([name, s]) => ({
          name,
          initial: name === m.initial,
          final: s.final,
          on: Object.entries(s.on).map(([event, list]) => ({
            event: local(event),
            targets: list.map((t) => t.target),
          })),
          invoke: s.invoke
            ? {
                effect: local(s.invoke.effect),
                done: s.invoke.done.map((t) => t.target),
                failed: Object.fromEntries(
                  Object.entries(s.invoke.failed).map(([e, list]) => [e, list.map((t) => t.target)]),
                ),
              }
            : null,
          ignore: s.ignore.map(local),
          after: s.after.map((a) => ({ ms: a.ms, target: a.transition.target })),
          at:
            at(`${base}/machine/states/${name}/invoke`) ??
            at(`${base}/machine/states/${name}/on/${Object.keys(s.on)[0] ?? ''}/0`) ??
            at(`${base}/machine`),
        }))
      : []
    return {
      id: f.id,
      queries: Object.entries(f.queries).map(([name, q]) => ({
        name,
        scope: q.scope,
        freshness: freshnessText(q.freshness),
        errors: Object.keys(q.errors),
        tags: q.tags.map((t) => local(t.tag)),
        runs: q.runs,
        access: q.access ? accessSummary(q.access) : null,
        at: at(`${base}/queries/${name}`),
      })),
      mutations: Object.entries(f.mutations).map(([name, q]) => ({
        name,
        errors: Object.keys(q.errors),
        invalidates: q.invalidates.map((t) => local(t.tag)),
        runs: q.runs,
        access: q.access ? accessSummary(q.access) : null,
        at: at(`${base}/mutations/${name}`),
      })),
      fetch: f.fetch ? at(`${base}/fetch`) : null,
      endpoints: Object.entries(f.endpoints ?? {}).map(([name, e]) => ({
        name,
        method: e.method,
        path: e.path,
        at: at(`${base}/endpoints/${name}`),
      })),
      events: Object.entries(f.events).map(([name, e]) => ({
        name,
        fields: fieldsOf(f.schemas[e.payload]),
        at: at(`${base}/events/${name}`),
      })),
      fns: Object.keys(f.fns),
      context: m ? fieldsOf(f.schemas[m.context]) : [],
      machineAt: m ? at(`${base}/machine`) : null,
      states,
      views: Object.entries(f.views).map(([name, v]) => ({
        name,
        machine: v.machine !== null,
        route: v.route,
        at: at(`${base}/views/${name}`),
      })),
      parts: build.parts
        .filter((u) => u.features.includes(f.id))
        .map((u) => ({
          name: u.name,
          at: u.source ? `${relative(cwd, u.source.file)}:${u.source.line}` : null,
        })),
      contracts: Object.keys(f.contracts).length,
      contractsAt: at(`${base}/contracts/${Object.keys(f.contracts)[0] ?? ''}`),
    }
  })
  return {
    session: ir.session ? shapeOf(ir.session as Schema) : null,
    verify: verifyLine(ir),
    ...(Object.keys(ir.kits).length
      ? {
          kits: Object.entries(ir.kits).map(([id, k]) => ({
            id,
            components: Object.keys(k.components).length,
          })),
        }
      : {}),
    files: filesOf(build, cwd, appModuleOf(loaded.project)),
    routes,
    features,
  }
}

const where = (s: string | null) => (s ? `  ${s}` : '')

export function describeMap(out: MapOutput): string {
  const lines: string[] = [
    `session ${out.session ?? 'none'}`,
    `verify ${out.verify}`,
    'files',
    ...out.files.map((f) => `  ${f.file} ${f.roles.join(' ')}`),
    ...(out.kits?.length ? [`kits: ${out.kits.map((k) => `${k.id} ${k.components}`).join(', ')}`] : []),
    'routes',
  ]
  for (const r of out.routes)
    lines.push(
      `  ${r.id} ${r.path}${r.search.length ? `?${r.search.join('&')}` : ''} → ${r.views.map(local).join(', ') || '(no page)'}${r.head ? ` · head ${local(r.head)}` : ''}${r.components ? ` · uses ${r.components.join(' ')}` : ''}${where(r.at)}`,
    )
  for (const f of out.features) {
    lines.push(`feature ${f.id}`)
    for (const q of f.queries)
      lines.push(
        `  query ${q.name} ${q.scope} ${q.freshness} runs:${q.runs}${q.access ? ` access:${q.access}` : ''}${q.errors.length ? ` !${q.errors.join(' !')}` : ''}${q.tags.length ? ` [${q.tags.join(' ')}]` : ''}${where(q.at)}`,
      )
    for (const q of f.mutations)
      lines.push(
        `  mutation ${q.name} runs:${q.runs}${q.access ? ` access:${q.access}` : ''}${q.errors.length ? ` !${q.errors.join(' !')}` : ''}${q.invalidates.length ? ` ⟳${q.invalidates.join(' ')}` : ''}${where(q.at)}`,
      )
    for (const e of f.endpoints) lines.push(`  endpoint ${e.name} ${e.method} ${e.path}${where(e.at)}`)
    if (f.fetch) lines.push(`  fetch.ts${where(f.fetch)}`)
    if (f.events.length)
      lines.push(`  events ${f.events.map((e) => `${e.name}{${e.fields.join(',')}}`).join(' ')}`)
    if (f.fns.length) lines.push(`  fns ${f.fns.join(' ')}`)
    if (f.context.length) lines.push(`  context ${f.context.join(' ')}${where(f.machineAt)}`)
    for (const s of f.states) {
      const parts = s.on.map((t) => `${t.event}→${t.targets.join('|')}`)
      if (s.invoke)
        parts.push(
          `invoke ${s.invoke.effect} done→${s.invoke.done.join('|')} ${Object.entries(s.invoke.failed)
            .map(([e, t]) => `${e}→${t.join('|')}`)
            .join(' ')}`,
        )
      for (const a of s.after) parts.push(`after ${a.ms}ms→${a.target}`)
      if (s.ignore.length && !s.invoke) parts.push(`ignore ${s.ignore.join(' ')}`)
      lines.push(
        `  state ${s.name}${s.initial ? '*' : ''}${s.final ? ' (final)' : ''}: ${parts.join('; ')}${where(s.at)}`,
      )
    }
    for (const v of f.views)
      lines.push(
        `  view ${v.name}${v.machine ? ' (machine)' : ''}${v.route ? ` route ${v.route}` : ''}${where(v.at)}`,
      )
    if (f.parts?.length)
      lines.push(`  parts ${f.parts.map((p) => `${p.name ?? 'part'}${p.at ? ` ${p.at}` : ''}`).join(', ')}`)
    lines.push(`  contracts ${f.contracts}${where(f.contractsAt)}`)
  }
  return `${lines.join('\n')}\n`
}
