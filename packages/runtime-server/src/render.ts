import { planRoute, type RoutePlan } from '@tenon/compiler'
import {
  type BuildResult,
  canonicalStringify,
  type FeatureIR,
  type Json,
  type MachineIR,
  type TagExprIR,
  type ValueExpr,
  type ViewNode,
} from '@tenon/core/ir'
import type { DataRuntime } from '@tenon/data'
import { getIn } from '@tenon/machine'
import type { IslandRef, PagePayload, Result } from '@tenon/runtime-client'
import { escapeHtml, scriptJson } from './escape.ts'

export interface Assets {
  client: string
  fns: string | null
}

export interface RenderOptions {
  build: BuildResult
  data: DataRuntime
  route: string
  session?: unknown
  assets?: Assets
}

export interface RenderedPage {
  plan: RoutePlan
  chunks: AsyncIterable<string>
  tags: Set<string>
}

const voids = new Set(['img'])

const text = (v: Json) =>
  v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)

interface Scope {
  feature: FeatureIR
  context: Json
  state: string | null
  bindings: Json[]
}

export function renderPage({
  build,
  data,
  route,
  session,
  assets = { client: '/_tenon/client.js', fns: '/_tenon/fns.js' },
}: RenderOptions): RenderedPage {
  const { ir, bindings } = build
  const { plan } = planRoute(ir, route)
  const islandIds = new Set(plan.islands)
  const tags = new Set<string>()
  const payload: PagePayload = { islands: [], data: [], features: {}, nodes: {}, fns: null }
  const fns = bindings.fns as Record<string, (x: Json) => Json>

  const value = (v: ValueExpr, scope: Scope, input?: Json): Json => {
    if ('literal' in v) return v.literal
    if ('object' in v) {
      const out: Record<string, Json> = {}
      for (const k in v.object) out[k] = value(v.object[k]!, scope, input)
      return out
    }
    if ('fn' in v) return fns[v.fn]!(value(v.arg, scope, input))
    if (v.ref === 'binding') return getIn(scope.bindings[v.depth], v.path)
    if (v.ref === 'context') return getIn(scope.context, v.path)
    return v.ref === 'input' ? getIn(input ?? null, v.path) : null
  }

  const tagKeys = (list: TagExprIR[], input: Json, scope: Scope) =>
    list.map((t) => (t.param ? `${t.tag}(${canonicalStringify(value(t.param, scope, input))})` : t.tag))

  const featureScope = (feature: FeatureIR, bound: boolean): Scope => ({
    feature,
    context: bound ? (feature.machine?.initialContext ?? null) : null,
    state: bound ? (feature.machine?.initial ?? null) : null,
    bindings: [],
  })

  async function* node(n: ViewNode, scope: Scope, island: boolean): AsyncGenerator<string> {
    if (!island && islandIds.has(n.id)) {
      const index = payload.islands.length
      const ref: IslandRef = { feature: scope.feature.id, node: n.id, scope: scope.bindings }
      payload.islands.push(ref)
      payload.nodes[n.id] = n
      payload.features[scope.feature.id] ??= (scope.feature.machine as MachineIR | null) ?? null
      yield `<t-i data-i="${index}" style="display:contents">`
      yield* node(n, scope, true)
      yield '</t-i>'
      return
    }
    switch (n.kind) {
      case 'text':
        yield escapeHtml(text(value(n.value, scope)))
        return
      case 'el': {
        let attrs = ` data-t="${escapeHtml(n.id)}"${n.class ? ` class="${escapeHtml(n.class)}"` : ''}`
        for (const [name, v] of Object.entries(n.attrs)) {
          const x = value(v, scope)
          if (x === null || x === false) continue
          attrs += x === true ? ` ${name}` : ` ${name}="${escapeHtml(text(x))}"`
        }
        yield `<${n.tag}${attrs}>`
        if (voids.has(n.tag)) return
        for (const c of n.children) yield* node(c, scope, island)
        yield `</${n.tag}>`
        return
      }
      case 'when':
        yield `<!--${n.id}-->`
        if (scope.state !== null && n.states.includes(scope.state))
          for (const c of n.children) yield* node(c, scope, island)
        yield `<!--/${n.id}-->`
        return
      case 'each': {
        yield `<!--${n.id}-->`
        const items = value(n.source, scope)
        if (Array.isArray(items))
          for (const item of items)
            yield* node(n.item, { ...scope, bindings: [...scope.bindings, item] }, island)
        yield `<!--/${n.id}-->`
        return
      }
      case 'query': {
        yield `<!--${n.id}-->`
        const input = value(n.input, scope)
        const dot = n.query.indexOf('.')
        const q = ir.features[n.query.slice(0, dot)]?.queries[n.query.slice(dot + 1)]
        const result = (await data.run(n.query, input, session)) as Result
        if (q) for (const t of tagKeys(q.tags, input, scope)) tags.add(t)
        if (island) payload.data.push([n.query + canonicalStringify(input), result])
        const branch = result.ok ? n.ready : (n.failed[result.error] ?? n.failed.Unexpected)
        if (branch)
          yield* node(
            branch,
            { ...scope, bindings: [...scope.bindings, result.ok ? result.value : result.data] },
            island,
          )
        yield `<!--/${n.id}-->`
        return
      }
      case 'embed': {
        const dot = n.view.indexOf('.')
        const owner = ir.features[n.view.slice(0, dot)]
        const view = owner?.views[n.view.slice(dot + 1)]
        if (owner && view) yield* node(view.root, featureScope(owner, view.machine === owner.id), island)
      }
    }
  }

  async function* chunks(): AsyncGenerator<string> {
    yield `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(ir.routes[route]?.path ?? route)}</title></head><body>`
    for (const ref of plan.views) {
      const dot = ref.indexOf('.')
      const feature = ir.features[ref.slice(0, dot)]
      const view = feature?.views[ref.slice(dot + 1)]
      if (feature && view) yield* node(view.root, featureScope(feature, view.machine === feature.id), false)
    }
    if (payload.islands.length) {
      payload.fns = Object.keys(bindings.fns).length ? assets.fns : null
      yield `<script type="application/json" id="tenon-payload">${scriptJson(payload)}</script>`
      yield `<script type="module" src="${escapeHtml(assets.client)}"></script>`
    }
    yield '</body></html>'
  }

  return { plan, chunks: chunks(), tags }
}

export async function renderToString(
  options: RenderOptions,
): Promise<{ html: string; plan: RoutePlan; tags: Set<string> }> {
  const page = renderPage(options)
  let html = ''
  for await (const chunk of page.chunks) html += chunk
  return { html, plan: page.plan, tags: page.tags }
}

export function fnsModule(build: BuildResult): string {
  const entries = Object.entries(build.bindings.fns).map(([ref, impl]) => {
    const source = String(impl)
    const expression = /^(async\s+)?(function\b|\(|[A-Za-z_$][\w$]*\s*=>)/.test(source)
      ? source
      : `function ${source}`
    return `  ${JSON.stringify(ref)}: ${expression},`
  })
  return `export const fns = {\n${entries.join('\n')}\n}\n`
}
