import { type NodeDef, sendOf, type ViewDef, when } from '../builders/ui.ts'
import { htmlGlobalAttrs, svgGlobalAttrs, svgTags, tagAttrs, voidTags } from '../ir/dom-data.ts'
import { domEvents } from '../ir/events.ts'
import type { SendIR, ValueExpr, ViewIR, ViewNode } from '../ir/types.ts'
import { type Decl, defOf, infoOf } from '../model/decl.ts'
import { exprOf, refProxy } from '../model/expr.ts'
import { type At, at, type FeatureScope } from './scope.ts'

const eventSet = new Set<string>(domEvents)
const svgSet = new Set<string>(svgTags)
const voidSet = new Set<string>(voidTags)
const htmlGlobal = new Set<string>(htmlGlobalAttrs)
const svgGlobal = new Set<string>(svgGlobalAttrs)
const allowed = new Map<string, Set<string>>(
  Object.entries(tagAttrs).map(([tag, list]) => [tag, new Set<string>(list)]),
)

const attrAllowed = (tag: string, name: string) =>
  name.startsWith('aria-') ||
  /^data-[a-z0-9-]+$/.test(name) ||
  (svgSet.has(tag) ? svgGlobal : htmlGlobal).has(name) ||
  allowed.get(tag)?.has(name) === true

function element(
  scope: FeatureScope,
  d: Extract<NodeDef, { kind: 'el' }>,
  id: string,
  p: At,
  depth: number,
): ViewNode {
  let cls: string | null = null
  const toggle: Record<string, ValueExpr> = {}
  const vars: Record<string, ValueExpr> = {}
  const attrs: Record<string, ValueExpr> = {}
  const on: Record<string, SendIR> = {}
  if (!allowed.has(d.tag))
    scope.report(
      'TN014',
      at(p, 'tag'),
      `Element "${d.tag}" is not supported`,
      'Use a standard HTML or SVG element.',
    )
  for (const [key, value] of Object.entries(d.props ?? {})) {
    if (value === undefined) continue
    if (key === 'class') {
      if (typeof value === 'string') cls = value
      else
        scope.report(
          'TN014',
          at(p, 'class'),
          'class must be a static string',
          'Dynamic classes would make render output depend on runtime values.',
        )
    } else if (key === 'toggle' || key === 'vars') {
      for (const [name, v] of Object.entries(value as object)) {
        const tp = at(p, key, name)
        if (key === 'toggle' ? !/\S/.test(name) : !/^--[A-Za-z0-9_-]+$/.test(name)) {
          scope.report(
            'TN014',
            tp,
            key === 'toggle' ? 'toggle keys are class lists' : `CSS variable "${name}" must look like --name`,
            key === 'toggle'
              ? 'Each key is one or more classes switched on while its condition holds.'
              : 'vars binds CSS custom properties only; CSS decides how they are used.',
          )
          continue
        }
        const out = key === 'toggle' ? toggle : vars
        out[key === 'toggle' ? name.trim().split(/\s+/).join(' ') : name] = scope.attempt(
          tp,
          () => scope.value(v, p),
          { literal: null },
        )
      }
    } else if (key === 'on') {
      for (const [event, send] of Object.entries(value as object)) {
        const ep = at(p, 'on', event)
        const s = sendOf(send)
        if (!eventSet.has(event))
          scope.report(
            'TN014',
            ep,
            `DOM event "${event}" is not supported`,
            `Supported: ${domEvents.join(', ')}.`,
          )
        else if (!s)
          scope.report(
            'TN014',
            ep,
            'on handlers must be ui.send(Event, payload)',
            'Views cannot run arbitrary functions.',
          )
        else
          on[event] = {
            event: scope.ref(s.event, ['event'], ep),
            payload: scope.attempt(at(ep, 'payload'), () => scope.value(s.payload, ep), { literal: null }),
          }
      }
    } else if (attrAllowed(d.tag, key)) {
      attrs[key] = scope.attempt(at(p, 'attrs', key), () => scope.value(value, p), { literal: null })
    } else {
      scope.report(
        'TN014',
        at(p, 'attrs', key),
        `Attribute "${key}" is not allowed on <${d.tag}>`,
        key === 'style'
          ? 'Style lives in CSS: use class for static styling.'
          : key === 'value' && d.tag === 'select'
            ? 'Select the option instead: option({ selected: op.eq(…) }).'
            : `Allowed on <${d.tag}>: ${[...(allowed.get(d.tag) ?? [])].join(', ') || 'global attributes only'}, aria-*, data-*.`,
      )
    }
  }
  if (!Array.isArray(d.children))
    scope.report('TN014', at(p, 'children'), `<${d.tag}> needs a children array`, 'Pass [] when it has none.')
  else if (voidSet.has(d.tag) && d.children.length)
    scope.report('TN014', at(p, 'children'), `<${d.tag}> cannot have children`, 'It is a void element.')
  const children = (Array.isArray(d.children) ? d.children : []).map((c, i) =>
    node(scope, c, `${id}/${i}`, at(p, 'children', i), depth),
  )
  return { id, kind: 'el', tag: d.tag, class: cls, toggle, vars, attrs, on, children }
}

function node(scope: FeatureScope, value: unknown, id: string, p: At, depth: number): ViewNode {
  const info = infoOf(value)
  if (info?.kind === 'node') {
    scope.project.mark(p, value)
    const d = info.def as NodeDef
    const binding = () => refProxy('binding', depth)
    const branch = (render: (x: unknown) => unknown, bid: string, bp: At) =>
      node(
        scope,
        scope.attempt(bp, () => render(binding()), null),
        bid,
        bp,
        depth + 1,
      )
    switch (d.kind) {
      case 'el':
        return element(scope, d, id, p, depth)
      case 'when':
        return {
          id,
          kind: 'when',
          states: [...new Set(d.states.map(String))].sort(),
          children: d.children.map((c, i) => node(scope, c, `${id}/${i}`, at(p, 'children', i), depth)),
        }
      case 'each':
        return {
          id,
          kind: 'each',
          source: scope.attempt(at(p, 'source'), () => scope.value(d.source, p), { literal: [] }),
          key: String(d.key),
          item: branch(d.item, `${id}/item`, at(p, 'item')),
        }
      case 'query': {
        const failed: Record<string, ViewNode> = {}
        for (const [name, render] of Object.entries(d.failed ?? {}))
          failed[name] = branch(render, `${id}/failed/${name}`, at(p, 'failed', name))
        return {
          id,
          kind: 'query',
          query: scope.ref(d.query, ['query'], at(p, 'query')),
          input: scope.attempt(at(p, 'input'), () => scope.value(d.input, p), { literal: null }),
          ready: branch(d.ready, `${id}/ready`, at(p, 'ready')),
          pending:
            d.pending === null ? null : node(scope, d.pending, `${id}/pending`, at(p, 'pending'), depth),
          failed,
        }
      }
      case 'embed':
        return { id, kind: 'embed', view: scope.ref(d.view, ['view'], at(p, 'view')) }
    }
  }
  if (typeof value === 'string' || typeof value === 'number')
    return { id, kind: 'text', value: { literal: value } }
  if (exprOf(value))
    return { id, kind: 'text', value: scope.attempt(p, () => scope.value(value, p), { literal: null }) }
  scope.report('TN014', p, 'Invalid view child', 'Children must be ui nodes, strings, numbers or references.')
  return { id, kind: 'text', value: { literal: '' } }
}

export function buildView(scope: FeatureScope, symbol: string, decl: Decl): ViewIR {
  const p = scope.at('views', symbol)
  const d = defOf<ViewDef>(decl)
  let machine: string | null = null
  if (d.machine) {
    const owner = scope.project.owners.get(d.machine)
    machine = owner?.feature ?? '?'
    if (!owner)
      scope.report(
        'TN007',
        at(p, 'machine'),
        'View is bound to a machine that no feature declares',
        'Register the machine in feature({ machine }).',
      )
    else if (owner.feature !== scope.id)
      scope.report(
        'TN006',
        at(p, 'machine'),
        `View is bound to the machine of feature "${owner.feature}"`,
        'A view may only bind to its own feature machine; other features are reached through exports.',
      )
  }
  let route: string | null = null
  if (d.route) {
    route = scope.project.routes.get(d.route) ?? '?'
    if (route === '?')
      scope.report(
        'TN007',
        at(p, 'route'),
        'View is bound to a route missing from project({ routes })',
        'Register the route.',
      )
  }
  const params = refProxy('params', 0)
  const render = () =>
    d.machine ? d.render({ ctx: refProxy('context', 0), when, params }) : d.render({ params })
  const root = scope.attempt(at(p, 'root'), render, null)
  return { machine, route, root: node(scope, root, `${scope.id}.${symbol}`, at(p, 'root'), 0) }
}
