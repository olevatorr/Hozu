import { canonicalStringify } from '@hozu/core/canonical'
import type { GuardExpr, Json, ValueExpr, ViewIR, ViewNode } from '@hozu/core/ir'
import {
  type CompiledMachine,
  compileValue,
  type Env,
  equal,
  type Getter,
  getIn,
  type Input,
  init,
  type Snapshot,
  type Step,
  transition,
} from '@hozu/machine'
import { attrText, classText, domField, passive, properties, SVG_NS, text } from './dom.ts'

export type Motion = typeof import('./motion.ts')

import type { ComponentHost } from './component.ts'

export type Result = { ok: true; value: Json } | { ok: false; error: string; data: Json }

export type Payload = Map<string, Result>

export interface Store {
  data: Payload
  versions: Map<string, number>
}

export interface AppOptions {
  machine: CompiledMachine | null
  payload: Payload | Store
  fns?: Record<string, (input: never) => unknown>
  params?: Json
  search?: Json
  snapshot?: Snapshot
  onInvoke?: (effect: string, input: Json) => Promise<Result>
  onQuery?: (query: string, input: Json) => Promise<Result>
  /** Queries the server never read (ADR 0049): requested while hydrating too, since the payload cannot hold them. */
  readsInBrowser?: (query: string) => boolean
  onNavigate?: (url: string) => void
  components?: Record<string, ComponentRef>
  routes?: Record<string, string>
  motion?: Motion | undefined
  mountComponent?: ((host: ComponentHost) => void) | undefined
  loadComponent?: (url: string) => Promise<ComponentSetup>
}

export interface ComponentRef {
  url: string
  tag: string
  load: 'eager' | 'visible' | 'idle'
}

export type ComponentSetup = (context: {
  el: HTMLElement
  props: unknown
  emit(event: string, detail: unknown): void
  signal: AbortSignal
}) => { update?(props: unknown): void; destroy?(): void } | undefined

export interface MountOptions extends AppOptions {
  view: ViewIR
}

export interface App {
  attach(parent: Node, before: Node | null, node: ViewNode, scope: Json[], claim: boolean): void
  start(): void
  sync(): void
  dispatch(input: Input): void
  snapshot(): Snapshot | null
  destroy(): void
}

export type Mounted = Omit<App, 'attach' | 'start'>

type Block = (() => void)[]

interface Cursor {
  parent: Node
  next: Node | null
  claim: boolean
}

interface Item {
  key: string
  value: Json
  scope: Json[]
  block: Block
  first: Node
  last: Node
}

const guardReads = (g: GuardExpr): boolean => {
  switch (g.op) {
    case 'and':
    case 'or':
      return g.args.some(guardReads)
    case 'not':
      return guardReads(g.arg)
    case 'fn':
      return reads(g.arg)
    default:
      return reads(g.left) || reads(g.right)
  }
}

const reads = (v: ValueExpr): boolean =>
  'ref' in v
    ? v.ref === 'context' || v.ref === 'binding'
    : 'object' in v
      ? Object.values(v.object).some(reads)
      : 'fn' in v
        ? reads(v.arg)
        : 'link' in v
          ? reads(v.params) || (v.search !== null && reads(v.search))
          : 'endpoint' in v
            ? v.input != null && reads(v.input)
            : 'test' in v && guardReads(v.test)

export const payloadKey = (query: string, input: Json) => query + canonicalStringify(input)

export const store = (payload: Payload | Store): Store =>
  payload instanceof Map ? { data: payload, versions: new Map() } : payload

export function mount(target: Element, options: MountOptions): Mounted {
  const app = createApp(target.ownerDocument, options)
  app.attach(target, null, options.view.root, [], false)
  app.start()
  return app
}

const isComment = (n: Node | null, data: string): n is Comment =>
  n !== null && n.nodeType === 8 && (n as Comment).data === data

function range(first: Node, last: Node): Node[] {
  const out: Node[] = [first]
  let n: Node | null = first
  while (n !== last) {
    n = n.nextSibling
    if (!n) break
    out.push(n)
  }
  return out
}

function span(c: Cursor, run: () => void): [Node | null, Node | null] {
  const prev = c.next ? c.next.previousSibling : c.parent.lastChild
  run()
  return [prev ? prev.nextSibling : c.parent.firstChild, c.next ? c.next.previousSibling : c.parent.lastChild]
}

function clear(start: Node, end: Node) {
  while (start.nextSibling && start.nextSibling !== end) start.nextSibling.remove()
}

export function createApp(doc: Document, options: AppOptions): App {
  const { machine, fns = {}, params = null, search = null, routes = {} } = options
  const { data: payload } = store(options.payload)
  const ranges: [Node, Node][] = []
  const timers = new Set<ReturnType<typeof setTimeout>>()
  let first: Step | null = machine ? (options.snapshot ? null : init(machine)) : null
  let snapshot: Snapshot | null = options.snapshot ?? first?.snapshot ?? null
  const root: Block = []
  const detached = new Set<() => void>()
  const mounted = new Set<{ el: Node; stop: () => void }>()
  const getters = new WeakMap<ValueExpr, Getter>()

  const value = (v: ValueExpr, scope: Json[], dom?: Env['dom']): Json => {
    let get = getters.get(v)
    if (!get) {
      get = compileValue(v, fns)
      getters.set(v, get)
    }
    return get({
      context: snapshot?.context ?? null,
      bindings: scope,
      params,
      search,
      routes,
      ...(dom ? { dom } : {}),
    })
  }

  const bind = (block: Block, v: ValueExpr, scope: Json[], apply: (x: Json) => void) => {
    let last = value(v, scope)
    apply(last)
    if (reads(v))
      block.push(() => {
        const next = value(v, scope)
        if (next === last) return
        last = next
        apply(next)
      })
  }

  const marker = (c: Cursor, data: string): Comment => {
    if (c.claim && isComment(c.next, data)) {
      const m = c.next
      c.next = m.nextSibling
      return m
    }
    return c.parent.insertBefore(doc.createComment(data), c.next)
  }

  const skip = (c: Cursor) => {
    if (!c.claim || !isComment(c.next, '[')) return
    let depth = 0
    while (c.next) {
      const n: Node = c.next
      c.next = n.nextSibling
      if (isComment(n, '[')) depth++
      else if (isComment(n, ']') && --depth === 0) return
    }
  }

  const render = (node: ViewNode, scope: Json[], c: Cursor, block: Block, ns: string | null): void => {
    switch (node.kind) {
      case 'text': {
        let t: Text
        if (c.claim && c.next?.nodeType === 3) {
          t = c.next as Text
          c.next = t.nextSibling
        } else t = c.parent.insertBefore(doc.createTextNode(''), c.next)
        if (c.claim && isComment(c.next, '')) c.next = c.next.nextSibling
        bind(block, node.value, scope, (x) => {
          const s = text(x)
          if (t.data !== s) t.data = s
        })
        return
      }
      case 'el': {
        const tag = node.tag
        const space = tag === 'svg' ? SVG_NS : ns
        let el: Element
        const claimed = c.claim && c.next?.nodeType === 1 && (c.next as Element).localName === tag
        if (claimed) {
          el = c.next as Element
          c.next = el.nextSibling
        } else {
          el = space ? doc.createElementNS(space, tag) : doc.createElement(tag)
          if (globalThis.__HOZU_DEV__) el.setAttribute('data-hz', node.id)
          if (node.class) el.setAttribute('class', node.class)
          c.parent.insertBefore(el, c.next)
        }
        for (const name in node.attrs) {
          const v = node.attrs[name]!
          const prop = properties.has(name) && name in el
          if (claimed && !reads(v)) continue
          bind(block, v, scope, (x) => {
            if (prop) {
              const p = el as unknown as Record<string, unknown>
              const next = name === 'value' ? text(x) : x === true
              if (p[name] !== next) p[name] = next
              return
            }
            const s = attrText(name, x)
            if (s === null) el.removeAttribute(name)
            else if (el.getAttribute(name) !== s) el.setAttribute(name, s)
          })
        }
        styling(el, node, scope, block)
        for (const event in node.on) {
          const send = node.on[event]!
          el.addEventListener(
            event,
            (e) => {
              if (event === 'submit') e.preventDefault()
              dispatch({ type: 'event', event: send.event, payload: value(send.payload, scope, domField(e)) })
            },
            passive.has(event) ? { passive: true } : undefined,
          )
        }
        if (tag === 'textarea') return
        const inner: Cursor = { parent: el, next: claimed ? el.firstChild : null, claim: claimed }
        const childNs = tag === 'foreignObject' ? null : space
        for (const child of node.children) render(child, scope, inner, block, childNs)
        return
      }
      case 'when': {
        const visible = () => (snapshot ? node.states.includes(snapshot.state) : false)
        region(
          c,
          block,
          visible,
          (cc, inner) => {
            if (visible()) for (const child of node.children) render(child, scope, cc, inner, ns)
          },
          node.motion,
        )
        return
      }
      case 'query': {
        let bound: Json[] = scope
        const key = () => {
          const k = payloadKey(node.query, value(node.input, scope))
          const r = payload.get(k)
          if (r && bound !== scope) bound.splice(0, bound.length, ...scope, r.ok ? r.value : r.data)
          return `${k}|${!r ? '' : r.ok ? 'ready' : node.failed[r.error] ? r.error : 'Unexpected'}`
        }
        region(c, block, key, (cc, inner) => {
          const input = value(node.input, scope)
          const k = payloadKey(node.query, input)
          const result = payload.get(k)
          bound = scope
          if (!result) {
            if (!cc.claim || options.readsInBrowser?.(node.query)) request(k, node.query, input)
            if (node.pending) render(node.pending, scope, cc, inner, ns)
            return
          }
          const branch = result.ok ? node.ready : (node.failed[result.error] ?? node.failed.Unexpected)
          bound = [...scope, result.ok ? result.value : result.data]
          if (branch) render(branch, bound, cc, inner, ns)
        })
        return
      }
      case 'each':
        each(node, scope, c, block, ns)
        return
      case 'component':
        component(node, scope, c, block)
        return
      case 'if': {
        const test = () => value({ test: node.test }, scope) === true
        region(
          c,
          block,
          test,
          (cc, inner) => {
            const branch = test() ? node.ifTrue : node.ifFalse
            for (const child of branch) render(child, scope, cc, inner, ns)
          },
          node.motion,
        )
        return
      }
      case 'html': {
        const start = marker(c, '[')
        let end: Node
        if (c.claim) {
          while (c.next && !isComment(c.next, ']')) c.next = c.next.nextSibling
          end = c.next ?? c.parent.appendChild(doc.createComment(']'))
          c.next = end.nextSibling
        } else end = marker(c, ']')
        let last = c.claim ? text(value(node.value, scope)) : null
        bind(block, node.value, scope, (x) => {
          const html = text(x)
          if (html === last) return
          last = html
          clear(start, end)
          const t = doc.createElement('template')
          t.innerHTML = html
          end.parentNode!.insertBefore(t.content, end)
        })
        return
      }
      case 'global': {
        const anchor = marker(c, 'g')
        const target: EventTarget = node.target === 'window' ? (doc.defaultView as EventTarget) : doc
        const stops: (() => void)[] = []
        for (const event in node.on) {
          const send = node.on[event]!
          const listener = (e: Event) =>
            dispatch({ type: 'event', event: send.event, payload: value(send.payload, scope, domField(e)) })
          const opts = passive.has(event) ? { passive: true } : undefined
          target.addEventListener(event, listener, opts)
          stops.push(() => target.removeEventListener(event, listener))
        }
        mounted.add({ el: anchor, stop: () => stops.forEach((s) => s()) })
        return
      }
      default:
        skip(c)
    }
  }

  const styling = (
    el: Element,
    node: Extract<ViewNode, { kind: 'el' | 'component' }>,
    scope: Json[],
    block: Block,
  ) => {
    const toggles = Object.entries(node.toggle)
    if (toggles.length) {
      const cls = () => {
        const active: string[] = []
        for (const [c, v] of toggles) if (value(v, scope) === true) active.push(c)
        return classText(node.class, active)
      }
      let last = cls()
      if (el.getAttribute('class') !== last) el.setAttribute('class', last)
      if (toggles.some(([, v]) => reads(v)))
        block.push(() => {
          const next = cls()
          if (next === last) return
          last = next
          el.setAttribute('class', next)
        })
    }
    for (const name in node.vars)
      bind(block, node.vars[name]!, scope, (x) => {
        const style = (el as HTMLElement).style
        if (x === null || x === '') style.removeProperty(name)
        else if (style.getPropertyValue(name) !== text(x)) style.setProperty(name, text(x))
      })
  }

  const component = (
    node: Extract<ViewNode, { kind: 'component' }>,
    scope: Json[],
    c: Cursor,
    block: Block,
  ) => {
    const name = node.use.component
    const ref = options.components?.[name]
    const tag = ref?.tag ?? 'div'
    let el: HTMLElement
    const claimed = c.claim && c.next?.nodeType === 1 && (c.next as Element).localName === tag
    if (claimed) {
      el = c.next as HTMLElement
      c.next = el.nextSibling
    } else {
      el = doc.createElement(tag)
      if (globalThis.__HOZU_DEV__) el.setAttribute('data-hz', node.id)
      if (node.class) el.setAttribute('class', node.class)
      c.parent.insertBefore(el, c.next)
    }
    styling(el, node, scope, block)
    if (!claimed || node.children.length) {
      const inner: Cursor = { parent: el, next: claimed ? el.firstChild : null, claim: claimed }
      for (const child of node.children) render(child, scope, inner, block, null)
    }
    if (!ref) console.error(`Hozu: component ${name} has no client code (bundleComponents)`)
    if (!ref || !options.loadComponent || !options.mountComponent) return
    options.mountComponent({
      el,
      ref,
      name,
      doc,
      props: () => value(node.props, scope),
      emit: (name, detail) => {
        const send = node.on[name]
        if (send)
          dispatch({
            type: 'event',
            event: send.event,
            payload: value(send.payload, scope, (f) => (f === 'detail' ? (detail as Json) : null)),
          })
      },
      load: options.loadComponent,
      watch: (update) => block.push(update),
      own: (stop) => mounted.add({ el, stop }),
      same: equal,
    })
  }

  const fetching = new Set<string>()
  const request = (key: string, query: string, input: Json) => {
    if (!options.onQuery || fetching.has(key)) return
    fetching.add(key)
    void options.onQuery(query, input).then((result) => {
      fetching.delete(key)
      payload.set(key, result)
      for (const u of root) u()
      sweep()
    })
  }

  const sweep = () => {
    for (let i = root.length - 1; i >= 0; i--) if (detached.delete(root[i]!)) root.splice(i, 1)
    for (const m of mounted)
      if (!m.el.isConnected) {
        m.stop()
        mounted.delete(m)
      }
  }

  const region = (
    c: Cursor,
    block: Block,
    key: () => unknown,
    fill: (c: Cursor, inner: Block) => void,
    motion: string | null = null,
  ) => {
    const start = marker(c, '[')
    let current = key()
    let inner: Block = []
    fill(c, inner)
    const end = marker(c, ']')
    block.push(() => {
      const next = key()
      if (next === current) {
        for (const u of inner) u()
        return
      }
      current = next
      inner = []
      const m = options.motion
      if (!motion || !m || m.reduced(doc)) {
        clear(start, end)
        fill({ parent: end.parentNode!, next: end, claim: false }, inner)
        return
      }
      m.leave(start.nextSibling === end ? [] : range(start.nextSibling!, end.previousSibling!), motion)
      const [a, b] = span({ parent: end.parentNode!, next: end, claim: false }, () =>
        fill({ parent: end.parentNode!, next: end, claim: false }, inner),
      )
      if (a && b && a !== end) m.enter(range(a, b), motion)
    })
  }

  const each = (
    node: Extract<ViewNode, { kind: 'each' }>,
    scope: Json[],
    c: Cursor,
    block: Block,
    ns: string | null,
  ) => {
    const start = marker(c, '[')
    const keyOf = (x: Json) => {
      const k = node.key === null ? x : getIn(x, [node.key])
      return typeof k === 'string' ? `s${k}` : JSON.stringify(k)
    }
    const list = () => {
      const x = value(node.source, scope)
      return Array.isArray(x) ? x : []
    }
    const make = (x: Json, cc: Cursor): Item => {
      const s = [...scope, x]
      const b: Block = []
      const [firstNode, lastNode] = span(cc, () => render(node.item, s, cc, b, ns))
      return { key: keyOf(x), value: x, scope: s, block: b, first: firstNode!, last: lastNode! }
    }
    let items = list().map((x) => make(x, c))
    const end = marker(c, ']')
    block.push(() => {
      const m = options.motion
      const motion = node.motion && m && !m.reduced(doc) ? node.motion : null
      const rects = motion
        ? new Map(
            items.flatMap((i) =>
              i.first.nodeType === 1 ? [[i, (i.first as Element).getBoundingClientRect()]] : [],
            ),
          )
        : null
      const old = new Map(items.map((i) => [i.key, i]))
      const fresh = new Set<Item>()
      const next: Item[] = []
      for (const x of list()) {
        const k = keyOf(x)
        const hit = old.get(k)
        if (hit) {
          old.delete(k)
          hit.value = x
          hit.scope.splice(0, hit.scope.length, ...scope, x)
          for (const u of hit.block) u()
          next.push(hit)
        } else {
          const item = make(x, { parent: doc.createDocumentFragment(), next: null, claim: false })
          fresh.add(item)
          next.push(item)
        }
      }
      for (const gone of old.values())
        if (motion) m!.leave(range(gone.first, gone.last), motion)
        else for (const n of range(gone.first, gone.last)) (n as ChildNode).remove()
      const parent = end.parentNode!
      let at: Node = start.nextSibling ?? end
      for (const item of next) {
        if (item.first === at) at = item.last.nextSibling ?? end
        else for (const n of range(item.first, item.last)) parent.insertBefore(n, at)
      }
      items = next
      if (!motion) return
      for (const item of next)
        if (fresh.has(item)) m!.enter(range(item.first, item.last), motion)
        else {
          const before = rects?.get(item)
          if (before) m!.flip(item.first as HTMLElement, before, motion)
        }
    })
  }

  const effects = (step: Step) => {
    for (const e of step.effects) {
      if (e.type === 'navigate') options.onNavigate?.(e.url)
      else if (e.type === 'timer') {
        const t = setTimeout(() => {
          timers.delete(t)
          dispatch({ type: 'timer', entry: e.entry, ms: e.ms })
        }, e.ms)
        timers.add(t)
      } else
        options
          .onInvoke?.(e.effect, e.input)
          .then((r) =>
            dispatch(
              r.ok
                ? { type: 'done', entry: e.entry, result: r.value }
                : { type: 'failed', entry: e.entry, error: r.error, data: r.data },
            ),
          )
    }
  }

  function dispatch(input: Input) {
    if (!machine || !snapshot) return
    const step = transition(machine, snapshot, input)
    if (!step.taken) return
    snapshot = step.snapshot
    for (const u of root) u()
    sweep()
    effects(step)
  }

  return {
    attach(parent, before, node, scope, claim) {
      const c: Cursor = { parent, next: before, claim }
      const ns = (parent as Element).namespaceURI === SVG_NS ? SVG_NS : null
      const block: Block = []
      const [a, b] = span(c, () => render(node, scope, c, block, ns))
      if (a && b) ranges.push([a, b])
      const connected = a?.isConnected === true
      const update = () => {
        if (connected && !a.isConnected) detached.add(update)
        else for (const u of block) u()
      }
      root.push(update)
    },
    start() {
      if (first) effects(first)
      first = null
    },
    sync: () => {
      for (const u of root) u()
      sweep()
    },
    dispatch,
    snapshot: () => snapshot,
    destroy: () => {
      for (const t of timers) clearTimeout(t)
      timers.clear()
      for (const m of mounted) m.stop()
      mounted.clear()
      root.length = 0
      for (const [a, b] of ranges) for (const n of range(a, b)) (n as ChildNode).remove()
      ranges.length = 0
    },
  }
}
