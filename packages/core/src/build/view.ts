import { type NodeDef, sendOf, type ViewDef, when } from '../builders/ui.ts'
import { htmlGlobalAttrs, svgGlobalAttrs, svgTags, tagAttrs, voidTags } from '../ir/dom-data.ts'
import { domEvents } from '../ir/events.ts'
import type { SendIR, ValueExpr, ViewIR, ViewNode } from '../ir/types.ts'
import { type Decl, defOf, infoOf } from '../model/decl.ts'
import { createRef, exprOf, refProxy } from '../model/expr.ts'
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
      'HZ014',
      at(p, 'tag'),
      `Element "${d.tag}" is not supported`,
      'Use a standard HTML or SVG element.',
    )
  for (const [key, value] of Object.entries(d.props ?? {})) {
    if (value === undefined) continue
    if (key === 'class' || key === 'toggle' || key === 'vars') {
      if (key === 'class') cls = classOf(scope, value, p)
      else styling(scope, key, value, key === 'toggle' ? toggle : vars, p)
    } else if (key === 'on') {
      for (const [event, send] of Object.entries(value as object)) {
        const ep = at(p, 'on', event)
        const s = sendOf(send)
        if (!eventSet.has(event))
          scope.report(
            'HZ014',
            ep,
            `DOM event "${event}" is not supported`,
            `Supported: ${domEvents.join(', ')}.`,
          )
        else if (!s)
          scope.report(
            'HZ014',
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
        'HZ014',
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
    scope.report('HZ014', at(p, 'children'), `<${d.tag}> needs a children array`, 'Pass [] when it has none.')
  else if (voidSet.has(d.tag) && d.children.length)
    scope.report('HZ014', at(p, 'children'), `<${d.tag}> cannot have children`, 'It is a void element.')
  const children = (Array.isArray(d.children) ? d.children : []).map((c, i) =>
    node(scope, c, `${id}/${i}`, at(p, 'children', i), depth),
  )
  if (on.visible) attrs['data-hozu-visible'] = { literal: '' }
  return { id, kind: 'el', tag: d.tag, class: cls, toggle, vars, attrs, on, children }
}

function classOf(scope: FeatureScope, value: unknown, p: At): string | null {
  if (typeof value === 'string') return value
  scope.report(
    'HZ014',
    at(p, 'class'),
    'class must be a static string',
    'Dynamic classes would make render output depend on runtime values.',
  )
  return null
}

function styling(
  scope: FeatureScope,
  key: 'toggle' | 'vars',
  value: unknown,
  out: Record<string, ValueExpr>,
  p: At,
) {
  for (const [name, v] of Object.entries((value ?? {}) as object)) {
    const tp = at(p, key, name)
    if (key === 'toggle' ? !/\S/.test(name) : !/^--[A-Za-z0-9_-]+$/.test(name)) {
      scope.report(
        'HZ014',
        tp,
        key === 'toggle' ? 'toggle keys are class lists' : `CSS variable "${name}" must look like --name`,
        key === 'toggle'
          ? 'Each key is one or more classes switched on while its condition holds.'
          : 'vars binds CSS custom properties only; CSS decides how they are used.',
      )
      continue
    }
    out[key === 'toggle' ? name.trim().split(/\s+/).join(' ') : name] = scope.attempt(
      tp,
      () => scope.value(v, p),
      { literal: null },
    )
  }
}

function widgetNode(
  scope: FeatureScope,
  d: Extract<NodeDef, { kind: 'widget' }>,
  id: string,
  p: At,
  depth: number,
): ViewNode {
  const o = d.options ?? ({} as typeof d.options)
  const toggle: Record<string, ValueExpr> = {}
  const vars: Record<string, ValueExpr> = {}
  styling(scope, 'toggle', o.toggle, toggle, p)
  styling(scope, 'vars', o.vars, vars, p)
  const on: Record<string, SendIR> = {}
  for (const [name, handler] of Object.entries((o.on ?? {}) as Record<string, unknown>)) {
    const ep = at(p, 'on', name)
    const s =
      typeof handler === 'function'
        ? scope.attempt(ep, () => sendOf(handler(createRef('dom', 0, ['detail']))), null)
        : null
    if (!s) {
      scope.report(
        'HZ014',
        ep,
        'Widget handlers must be (detail) => ui.send(Event, payload)',
        'Views cannot run arbitrary functions.',
      )
      continue
    }
    on[name] = {
      event: scope.ref(s.event, ['event'], ep),
      payload: scope.attempt(at(ep, 'payload'), () => scope.value(s.payload, ep), { literal: null }),
    }
  }
  return {
    id,
    kind: 'widget',
    widget: scope.ref(d.widget, ['widget'], at(p, 'widget')),
    class: o.class === undefined ? null : classOf(scope, o.class, p),
    toggle,
    vars,
    props: scope.attempt(at(p, 'props'), () => scope.value(o.props, p), { literal: null }),
    on,
    children: (Array.isArray(d.children) ? d.children : []).map((c, i) =>
      node(scope, c, `${id}/${i}`, at(p, 'children', i), depth),
    ),
  }
}

function motionOf(scope: FeatureScope, motion: unknown, p: At): string | null {
  if (motion === null || motion === undefined) return null
  if (typeof motion === 'string' && /^[a-z][a-z0-9-]*$/.test(motion)) return motion
  scope.report(
    'HZ014',
    p,
    'motion must be a lowercase name such as "fade"',
    'The name prefixes the enter/leave/move classes defined in CSS (fade-enter-active, …).',
  )
  return null
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
          motion: motionOf(scope, d.motion, at(p, 'motion')),
          children: d.children.map((c, i) => node(scope, c, `${id}/${i}`, at(p, 'children', i), depth)),
        }
      case 'each':
        return {
          id,
          kind: 'each',
          source: scope.attempt(at(p, 'source'), () => scope.value(d.source, p), { literal: [] }),
          key: d.key === null ? null : String(d.key),
          motion: motionOf(scope, d.motion, at(p, 'motion')),
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
      case 'widget':
        return widgetNode(scope, d, id, p, depth)
      case 'if': {
        const list = (items: readonly unknown[], key: string) =>
          (Array.isArray(items) ? items : []).map((c, i) =>
            node(scope, c, `${id}/${key}/${i}`, at(p, key, i), depth),
          )
        return {
          id,
          kind: 'if',
          test: scope.attempt(at(p, 'test'), () => scope.guard(d.test, at(p, 'test')), {
            op: 'eq',
            left: { literal: true },
            right: { literal: true },
          }),
          motion: motionOf(scope, d.motion, at(p, 'motion')),
          ifTrue: list(d.ifTrue, 'ifTrue'),
          ifFalse: list(d.ifFalse, 'ifFalse'),
        }
      }
      case 'html':
        return {
          id,
          kind: 'html',
          value: scope.attempt(at(p, 'value'), () => scope.value(d.value, p), { literal: null }),
        }
      case 'global': {
        const on: Record<string, SendIR> = {}
        for (const [event, send] of Object.entries(d.on ?? {})) {
          const ep = at(p, 'on', event)
          const s = sendOf(send)
          if (!eventSet.has(event) || !s) {
            scope.report(
              'HZ014',
              ep,
              s ? `DOM event "${event}" is not supported` : 'on handlers must be ui.send(Event, payload)',
              s ? `Supported: ${domEvents.join(', ')}.` : 'Views cannot run arbitrary functions.',
            )
            continue
          }
          on[event] = {
            event: scope.ref(s.event, ['event'], ep),
            payload: scope.attempt(at(ep, 'payload'), () => scope.value(s.payload, ep), { literal: null }),
          }
        }
        return { id, kind: 'global', target: d.target, on }
      }
    }
  }
  if (typeof value === 'string' || typeof value === 'number')
    return { id, kind: 'text', value: { literal: value } }
  if (exprOf(value))
    return { id, kind: 'text', value: scope.attempt(p, () => scope.value(value, p), { literal: null }) }
  const got =
    value === undefined
      ? 'undefined'
      : value === null
        ? 'null'
        : typeof value === 'function'
          ? 'a function'
          : typeof value === 'object'
            ? 'an object'
            : typeof value
  scope.report(
    'HZ014',
    p,
    `Invalid view child: got ${got}`,
    value === undefined
      ? 'A required field was left out, or a callback returned nothing. Children must be ui nodes, strings, numbers or references.'
      : typeof value === 'function'
        ? 'A function was passed instead of calling it, or a callback where a node belongs. Children must be ui nodes, strings, numbers or references.'
        : 'Children must be ui nodes, strings, numbers or references; use ui.if for conditional content.',
  )
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
        'HZ007',
        at(p, 'machine'),
        'View is bound to a machine that no feature declares',
        'Add the machine to feature({ declarations }).',
      )
    else if (owner.feature !== scope.id)
      scope.report(
        'HZ006',
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
        'HZ007',
        at(p, 'route'),
        'View is bound to a route missing from project({ routes })',
        'Register the route.',
      )
  }
  const params = refProxy('params', 0)
  const search = refProxy('search', 0)
  const render = () =>
    d.machine
      ? d.render({ ctx: refProxy('context', 0), when, params, search, locale: refProxy('locale', 0) })
      : d.render({ params, search, locale: refProxy('locale', 0) })
  const root = scope.attempt(at(p, 'root'), render, null)
  return { machine, route, root: node(scope, root, `${scope.id}.${symbol}`, at(p, 'root'), 0) }
}
