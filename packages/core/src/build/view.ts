import type { ComponentDef } from '../builders/component.ts'
import { builtinOf } from '../builders/i18n.ts'
import { op } from '../builders/op.ts'
import { type NodeDef, sendOf, setOf, type ViewDef, when } from '../builders/ui.ts'
import { htmlGlobalAttrs, svgGlobalAttrs, svgTags, tagAttrs, voidTags } from '../ir/dom-data.ts'
import { domEvents } from '../ir/events.ts'
import type {
  ComponentNode,
  ElementNode,
  FormRefIR,
  SendIR,
  UseIR,
  ValueExpr,
  ViewIR,
  ViewNode,
} from '../ir/types.ts'
import { transformedDecls } from '../lower.ts'
import { type Decl, defOf, infoOf } from '../model/decl.ts'
import { createRef, exprOf, guardOf, refProxy } from '../model/expr.ts'
import { defaultsOf, rootClasses, schemaJson, tokens, tvOf, variantsOf } from './components.ts'
import { formUse, holdForm, inEach, literalForm } from './forms.ts'
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
  let ref: FormRefIR | null = null
  let held: ValueExpr | null = null
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
        if (send === undefined) continue
        const ep = at(p, 'on', event)
        const s = sendOf(send)
        const set = setOf(send)
        if (set && eventSet.has(event)) {
          const target = exprOf(set.field)
          if (
            target?.kind !== 'ref' ||
            target.ref !== 'context' ||
            !target.path.length ||
            target.path.some((k) => !/^\w+$/.test(k))
          )
            scope.report(
              'HZ014',
              ep,
              'ui.set takes a context field and its new value',
              'ui.set(ctx.tab, "design") copies the value into ctx.tab; anything else is an event with ui.send.',
            )
          else {
            const name = `Set_${target.path.join('_')}`
            scope.sets.set(name, [...target.path])
            on[event] = {
              event: `${scope.id}.${name}`,
              payload: scope.attempt(
                at(ep, 'value'),
                (): ValueExpr => ({ object: { value: scope.value(set.value, ep) } }),
                { literal: null } as ValueExpr,
              ),
            }
          }
          continue
        }
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
    } else if (key === 'ref') {
      if (d.tag === 'form' && infoOf(value)?.kind === 'formRef') {
        ref = { formRef: id }
        held = holdForm(scope, value as object, id, p)
      } else
        scope.report(
          'HZ014',
          at(p, 'ref'),
          'ref takes a ui.formRef() and belongs on a <form>',
          'A formRef names the form that controls outside it submit with: ui.form({ ref: bulk }) and ui.input({ form: bulk }).',
        )
    } else if (key === 'form' && infoOf(value)?.kind === 'formRef' && attrAllowed(d.tag, key)) {
      attrs.form = { formRef: '' }
      formUse(scope, value as object, p, (v) => {
        attrs.form = v
      })
    } else if (attrAllowed(d.tag, key)) {
      attrs[key] = scope.attempt(at(p, 'attrs', key), () => scope.value(value, p), { literal: null })
      if (key === 'form' && typeof value === 'string') formUse(scope, value, p, () => {})
      else if (key === 'form')
        scope.report(
          'HZ014',
          at(p, 'attrs', 'form'),
          'form takes a ui.formRef()',
          'A control outside a form names it by a declared identity: const bulk = ui.formRef(), then form: bulk.',
          { summary: 'Pass the formRef the form holds: form: bulk', snippet: 'form: bulk', patch: null },
        )
    } else {
      scope.report(
        'HZ014',
        at(p, 'attrs', key),
        `Attribute "${key}" is not allowed on <${d.tag}>`,
        key === 'style'
          ? 'Style lives in CSS: use class for static styling.'
          : key === 'value' && d.tag === 'select'
            ? 'Select the option instead: option({ selected: ctx.choice === "a" }).'
            : `Allowed on <${d.tag}>: ${[...(allowed.get(d.tag) ?? [])].join(', ') || 'global attributes only'}, aria-*, data-*.`,
      )
    }
  }
  if (!Array.isArray(d.children))
    scope.report('HZ014', at(p, 'children'), `<${d.tag}> needs a children array`, 'Pass [] when it has none.')
  else if (voidSet.has(d.tag) && d.children.length)
    scope.report('HZ014', at(p, 'children'), `<${d.tag}> cannot have children`, 'It is a void element.')
  const listed = Array.isArray(d.children) ? d.children : []
  const children = (scope.inRender ? listed.filter((c) => c !== undefined) : listed).map((c, i) =>
    node(scope, c, `${id}/${i}`, at(p, 'children', i), depth),
  )
  if (on.visible) attrs['data-hozu-visible'] = { literal: '' }
  if (d.tag === 'form' && d.props?.id !== undefined) {
    if (ref)
      scope.report(
        'HZ014',
        at(p, 'attrs', 'id'),
        'A form that holds a formRef takes its id from it',
        'The framework derives the id from the form node (one per item key inside ui.each).',
        {
          summary: 'Remove the id',
          snippet: 'ui.form({ ref: bulk, on: { submit: … } }, [...])',
          patch: null,
        },
      )
    else if (typeof d.props.id === 'string') literalForm(scope, d.props.id, id, p)
  }
  if (held) attrs.id = held
  return {
    id,
    kind: 'el',
    tag: d.tag,
    class: cls,
    toggle,
    vars,
    attrs,
    on,
    children,
    ...(ref ? { ref } : {}),
  }
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

const nothing = (id: string): ViewNode => ({
  id,
  kind: 'if',
  test: { op: 'and', args: [] },
  motion: null,
  ifTrue: [],
  ifFalse: [],
})
const useKeys = new Set(['variant', 'props', 'slots', 'on', 'class'])

const isRef = (v: unknown) => exprOf(v) !== null || guardOf(v) !== null

function variantOf(scope: FeatureScope, def: ComponentDef, given: unknown, p: At) {
  const declared = variantsOf(tvOf(def))
  const chosen: Record<string, unknown> = {}
  for (const [key, value] of Object.entries((given ?? {}) as Record<string, unknown>)) {
    if (value === undefined) continue
    const vp = at(p, 'variant', key)
    if (isRef(value)) {
      scope.report(
        'HZ071',
        vp,
        `Variant ${key} is a reference`,
        'Variants are resolved when the view is recorded, so their values are literals; state that changes at run time is a prop (ADR 0045 B).',
        {
          summary: `Pass the state as a prop and style it through an attribute variant (aria-pressed:, data-[${key}=…]:)`,
          snippet: `props: { pressed: ctx.on }, // render: 'aria-pressed': props.pressed; styles: 'aria-pressed:bg-indigo-600'`,
          patch: null,
        },
      )
      continue
    }
    const values = declared[key]
    const text = String(value)
    const boolean = typeof value === 'boolean' && (values?.includes('true') || values?.includes('false'))
    if (!boolean && !values?.includes(text)) {
      scope.report(
        'HZ031',
        vp,
        values
          ? `${JSON.stringify(value)} is not a valid value for variant ${key}`
          : `Variant "${key}" is not declared by this component`,
        values
          ? `Expected one of ${values.map((v) => JSON.stringify(v)).join(', ')}.`
          : `Declared variants: ${Object.keys(declared).join(', ') || 'none'}.`,
        values
          ? {
              summary: `Use one of ${values.join(', ')}`,
              snippet: `variant: { ${key}: ${JSON.stringify(values[0])} }`,
              patch: null,
            }
          : {
              summary: `Remove variant "${key}"`,
              snippet: `variant: { ${Object.keys(declared)
                .map((k) => `${k}: ${JSON.stringify(declared[k]![0])}`)
                .join(', ')} }`,
              patch: null,
            },
      )
      continue
    }
    chosen[key] = value
  }
  return chosen
}

function componentUse(
  scope: FeatureScope,
  d: Extract<NodeDef, { kind: 'component' }>,
  id: string,
  p: At,
  depth: number,
): ViewNode {
  const entry = scope.project.components.get(d.component)
  if (!entry) {
    scope.report(
      'HZ007',
      at(p, 'component'),
      'This component is in no kit or feature',
      'A component gets its identity from a kit (project({ kits })) or from the declarations of the feature that owns it.',
      {
        summary:
          'Export it from a kit module listed in ui.kit({ components }), or from a module of this feature',
        snippet: "export const ui = ui.kit({ id: 'ui', components: [button] })  // project({ kits: [ui] })",
        patch: null,
      },
    )
    return nothing(id)
  }
  if (entry.owner.kind === 'feature' && entry.owner.id !== scope.id) {
    scope.report(
      'HZ006',
      at(p, 'component'),
      `${entry.id} is private to feature "${entry.owner.id}"`,
      'A component declared by a feature is used only by that feature; components shared by features belong to a kit (ADR 0045 A).',
      {
        summary: `Move ${entry.id.split('.')[1]} into a kit module and list the kit in project({ kits })`,
        snippet: "ui.kit({ id: 'ui', components: [button] })",
        patch: null,
      },
    )
    return nothing(id)
  }
  const def = defOf<ComponentDef>(d.component as never)
  const o = (d.options ?? {}) as Record<string, unknown>
  for (const key of Object.keys(o))
    if (!useKeys.has(key))
      scope.report(
        'HZ014',
        at(p, key),
        `ui.use of a component takes no "${key}"`,
        'The keys are variant, props, slots, on and class (ADR 0045 B).',
      )
  const chosen = variantOf(scope, def, o.variant, p)
  const variant = {
    ...defaultsOf(tvOf(def)),
    ...Object.fromEntries(Object.entries(chosen).map(([k, v]) => [k, String(v)])),
  }
  const styled = scope.attempt(at(p, 'variant'), () => rootClasses(def.styles, chosen), {
    root: [],
    classes: {},
  })
  const added = o.class === undefined ? [] : tokens(classOf(scope, o.class, p) ?? '')
  const json = def.props === null ? null : schemaJson(scope.project, def.props)
  const fields = (json?.properties ?? {}) as Record<string, { default?: unknown }>
  let props: unknown
  if (o.props !== undefined && (isRef(o.props) || typeof o.props !== 'object' || o.props === null))
    props = o.props
  else {
    const given = (o.props ?? {}) as Record<string, unknown>
    const filled: Record<string, unknown> = {}
    for (const [key, field] of Object.entries(fields))
      if (given[key] === undefined && field && 'default' in field) filled[key] = field.default
    for (const [key, value] of Object.entries(given)) if (value !== undefined) filled[key] = value
    props = filled
  }
  const named = (key: 'slots' | 'on', declared: readonly string[]) => {
    const out: Record<string, unknown> = {}
    for (const [name, value] of Object.entries((o[key] ?? {}) as Record<string, unknown>)) {
      if (!declared.includes(name))
        scope.report(
          'HZ014',
          at(p, key, name),
          `${entry.id} declares no ${key === 'slots' ? 'slot' : 'event'} "${name}"`,
          `Declared: ${declared.join(', ') || 'none'}.`,
        )
      else if (value !== undefined) out[name] = value
    }
    return out
  }
  const slots = named('slots', def.slots)
  const emits = Object.keys(def.emits)
  const handlers = named('on', [...def.events, ...emits])
  const on = Object.fromEntries(Object.entries(handlers).filter(([name]) => !emits.includes(name)))
  const given = Array.isArray(d.children) ? d.children : []
  if (given.length && !def.children)
    scope.report(
      'HZ014',
      at(p, 'children'),
      `${entry.id} takes no children`,
      'Declare children: true on the component, or pass the content as a slot.',
    )
  const children = def.children ? given : []
  const lowering = scope.lowering
  scope.lowering = transformedDecls().has(d.component)
  scope.inRender++
  try {
    const failed = Symbol('failed')
    const root = scope.attempt<unknown>(
      p,
      () => scope.callback(def.render)({ props, slots, children, on, classes: styled.classes }),
      failed,
    )
    if (root === failed) return nothing(id)
    const info = infoOf(root)
    const rd = info?.kind === 'node' ? (info.def as NodeDef) : null
    if (rd?.kind !== 'el' || rd.tag !== def.tag) {
      scope.report(
        'HZ014',
        p,
        `The render of ${entry.id} must return a <${def.tag}> element`,
        `tag declares the root element; the render returned ${rd?.kind === 'el' ? `<${rd.tag}>` : 'something else'} (ADR 0045 A).`,
        {
          summary: `Return ui.${def.tag}(…) from the render, or change tag`,
          snippet: `render: () => ui.${def.tag}({}, [])`,
          patch: null,
        },
      )
      return nothing(id)
    }
    if (rd.props?.class !== undefined) {
      scope.report(
        'HZ014',
        at(p, 'class'),
        `The render of ${entry.id} sets class on its root`,
        "The root's class comes from the component's styles and the caller's class (ADR 0045 A).",
        {
          summary: 'Move the classes into the tv() base of styles and remove class from the root',
          snippet: "styles: tv({ base: '…' }), render: () => ui.button({}, [])",
          patch: null,
        },
      )
      return nothing(id)
    }
    const cls = [...styled.root, ...added]
    scope.escapes(root, p)
    const out = scope.within(root, () =>
      element(
        scope,
        { ...rd, props: { ...rd.props, class: cls.length ? cls.join(' ') : undefined } },
        id,
        p,
        depth,
      ),
    ) as ElementNode
    const use: UseIR = {
      component: entry.id,
      variant,
      added,
      overrides: added.filter((c) => c.endsWith('!')),
    }
    if (def.client === null) return { ...out, use }
    return clientUse(scope, out, use, p, props, handlers, emits)
  } finally {
    scope.inRender--
    scope.lowering = lowering
  }
}

function clientUse(
  scope: FeatureScope,
  root: ElementNode,
  use: UseIR,
  p: At,
  props: unknown,
  handlers: Record<string, unknown>,
  emits: string[],
): ComponentNode {
  if (Object.keys(root.attrs).length || Object.keys(root.on).length)
    scope.report(
      'HZ014',
      p,
      `The render of client component ${use.component} sets attributes or on on its root`,
      'The client module owns the root of a client component; the server renders it with its class, toggle and vars only (ADR 0045 A).',
      {
        summary:
          'Move the attributes and handlers to an element inside the root, or set them from the client module',
        snippet: "render: ({ children }) => ui.div({}, [ui.button({ type: 'button' }, children)])",
        patch: null,
      },
    )
  const on: Record<string, SendIR> = {}
  for (const name of emits) {
    const handler = handlers[name]
    if (handler === undefined) continue
    const ep = at(p, 'on', name)
    const s =
      typeof handler === 'function'
        ? scope.attempt(ep, () => sendOf(scope.callback(handler)(createRef('dom', 0, ['detail']))), null)
        : null
    if (!s) {
      scope.report(
        'HZ014',
        ep,
        'Handlers of emitted events must be (detail) => ui.send(Event, payload)',
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
    id: root.id,
    kind: 'component',
    use,
    class: root.class,
    toggle: root.toggle,
    vars: root.vars,
    props: scope.attempt(at(p, 'props'), () => scope.value(props, p), { literal: null }),
    on,
    children: root.children,
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
  scope.project.markNode(id, p)
  return scope.within(value, () => nodeOf(scope, value, id, p, depth))
}

const listOf = (x: unknown): unknown[] =>
  x === null || x === undefined || x === false ? [] : Array.isArray(x) ? x : [x]

function condNode(
  scope: FeatureScope,
  arg: { c: unknown; a: unknown; b: unknown },
  id: string,
  p: At,
  depth: number,
) {
  const tested = exprOf(arg.c)
  const same = (x: unknown) =>
    x === arg.c ||
    (tested?.kind === 'call' && builtinOf(tested.fn) === '%truthy' && (tested.arg as { v: unknown }).v === x)
  const branch = (items: unknown[], key: string) =>
    items.map((c, i) => node(scope, c, `${id}/${key}/${i}`, at(p, key, i), depth))
  return {
    id,
    kind: 'if' as const,
    test: scope.attempt(at(p, 'test'), () => scope.guard(arg.c, at(p, 'test')), {
      op: 'eq' as const,
      left: { literal: true },
      right: { literal: true },
    }),
    motion: null,
    ifTrue: branch(listOf(arg.a), 'ifTrue'),
    ifFalse: branch(same(arg.b) ? [] : listOf(arg.b), 'ifFalse'),
  }
}

function nodeOf(scope: FeatureScope, value: unknown, id: string, p: At, depth: number): ViewNode {
  const info = infoOf(value)
  if (info?.kind === 'node') {
    scope.project.mark(p, value)
    scope.escapes(value, p)
    const d = info.def as NodeDef
    const binding = () => refProxy('binding', depth)
    const branch = (render: (x: unknown) => unknown, bid: string, bp: At): ViewNode => {
      const failed = Symbol('failed')
      const rendered = scope.attempt<unknown>(bp, () => scope.callback(render)(binding()), failed)
      return rendered === null || rendered === failed
        ? { id: bid, kind: 'if', test: { op: 'and', args: [] }, motion: null, ifTrue: [], ifFalse: [] }
        : node(scope, rendered, bid, bp, depth + 1)
    }
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
          item: inEach(scope, { id, depth, key: d.key === null ? null : String(d.key) }, () =>
            branch(d.item, `${id}/item`, at(p, 'item')),
          ),
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
      case 'component':
        return componentUse(scope, d, id, p, depth)
      case 'if': {
        if (d.motion === undefined)
          scope.report(
            'HZ014',
            at(p, 'motion'),
            'ui.if needs a motion name',
            'Without a motion, a condition is written as c ? a : b or c && a (a branch may be a list of children).',
            {
              summary: 'Write the condition as c ? [a] : [b]',
              snippet: 'ctx.open ? [ui.p({}, ["Open"])] : null',
              patch: null,
            },
          )
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
  const expr = exprOf(value)
  if (expr?.kind === 'call' && builtinOf(expr.fn) === '%cond')
    return condNode(scope, expr.arg as { c: unknown; a: unknown; b: unknown }, id, p, depth)
  if (expr)
    return { id, kind: 'text', value: scope.attempt(p, () => scope.value(value, p), { literal: null }) }
  const got =
    value === undefined
      ? 'undefined'
      : value === null
        ? 'null'
        : typeof value === 'function'
          ? 'a function'
          : Array.isArray(value)
            ? 'a list'
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
        : Array.isArray(value)
          ? 'A list of children is valid only as a branch of ?: or &&: c ? [a, b] : null or c && [a, b]. A query branch, an each item or a view that always shows several nodes wraps them in one element.'
          : 'Children must be ui nodes, strings, numbers or references; write conditional content as c ? a : b.',
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
  scope.lowering = transformedDecls().has(decl)
  const render = () =>
    d.machine
      ? scope.callback(d.render)({
          ctx: refProxy('context', 0),
          when,
          is: (states: string[]) => {
            for (const s of states)
              if (scope.stateNames.length && !scope.stateNames.includes(s))
                scope.report(
                  'HZ007',
                  at(p, 'root'),
                  `Unknown state "${s}" in is([...])`,
                  `States: ${scope.stateNames.join(', ')}.`,
                )
            const one = states.map((s) => op.eq(refProxy('state', 0) as unknown as string, s))
            return one.length === 1 ? one[0] : op.or(...one)
          },
          params,
          search,
          locale: refProxy('locale', 0),
        })
      : scope.callback(d.render)({ params, search, locale: refProxy('locale', 0) })
  const root = scope.attempt(at(p, 'root'), render, null)
  let seed: Record<string, ValueExpr> | null = null
  if (d.seed) {
    const sp = at(p, 'seed')
    if (!d.machine || !d.route)
      scope.report(
        'HZ048',
        sp,
        'seed needs a view with both a machine and a route',
        'seed starts the machine from the page URL, so the view must bind a machine and declare the route it reads.',
      )
    const fields = scope.attempt(sp, () => scope.callback(d.seed!)({ params, search }), null)
    if (fields === null || typeof fields !== 'object' || Array.isArray(fields) || exprOf(fields))
      scope.report(
        'HZ048',
        sp,
        'seed must return an object of context fields',
        'Each key is a top-level context field; each value is read from params or search.',
      )
    else {
      seed = {}
      for (const [key, v] of Object.entries(fields))
        seed[key] = scope.attempt(at(sp, key), () => scope.value(v, at(sp, key)), { literal: null })
    }
  }
  const out = { machine, route, seed, root: node(scope, root, `${scope.id}.${symbol}`, at(p, 'root'), 0) }
  scope.lowering = false
  return out
}
