import { canonicalStringify } from '@tenon/core/canonical'
import type { GuardExpr, Json, ValueExpr, ViewIR, ViewNode } from '@tenon/core/ir'
import {
  type CompiledMachine,
  compileValue,
  type Env,
  type Getter,
  getIn,
  type Input,
  init,
  type Snapshot,
  type Step,
  transition,
} from '@tenon/machine'
import { attrText, classText, domField, passive, properties, SVG_NS, text } from './dom.ts'

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
  snapshot?: Snapshot
  onInvoke?: (effect: string, input: Json) => Promise<Result>
  onNavigate?: (route: string) => void
}

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
    ? v.ref === 'context'
    : 'object' in v
      ? Object.values(v.object).some(reads)
      : 'fn' in v
        ? reads(v.arg)
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
  const { machine, fns = {}, params = null } = options
  const { data: payload, versions } = store(options.payload)
  const ranges: [Node, Node][] = []
  const timers = new Set<ReturnType<typeof setTimeout>>()
  let first: Step | null = machine ? (options.snapshot ? null : init(machine)) : null
  let snapshot: Snapshot | null = options.snapshot ?? first?.snapshot ?? null
  const root: Block = []
  const getters = new WeakMap<ValueExpr, Getter>()

  const value = (v: ValueExpr, scope: Json[], dom?: Env['dom']): Json => {
    let get = getters.get(v)
    if (!get) {
      get = compileValue(v, fns)
      getters.set(v, get)
    }
    return get({ context: snapshot?.context ?? null, bindings: scope, params, ...(dom ? { dom } : {}) })
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
        region(c, block, visible, (cc, inner) => {
          if (visible()) for (const child of node.children) render(child, scope, cc, inner, ns)
        })
        return
      }
      case 'query': {
        const key = () => {
          const k = payloadKey(node.query, value(node.input, scope))
          return `${k}#${versions.get(k) ?? 0}`
        }
        region(c, block, key, (cc, inner) => {
          const result = payload.get(payloadKey(node.query, value(node.input, scope)))
          if (!result) {
            if (node.pending) render(node.pending, scope, cc, inner, ns)
          } else if (result.ok) render(node.ready, [...scope, result.value], cc, inner, ns)
          else {
            const branch = node.failed[result.error] ?? node.failed.Unexpected
            if (branch) render(branch, [...scope, result.data], cc, inner, ns)
          }
        })
        return
      }
      case 'each':
        each(node, scope, c, block, ns)
        return
      default:
        skip(c)
    }
  }

  const region = (c: Cursor, block: Block, key: () => unknown, fill: (c: Cursor, inner: Block) => void) => {
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
      clear(start, end)
      inner = []
      fill({ parent: end.parentNode!, next: end, claim: false }, inner)
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
      const k = getIn(x, [node.key])
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
      const old = new Map(items.map((i) => [i.key, i]))
      const next: Item[] = []
      for (const x of list()) {
        const k = keyOf(x)
        const hit = old.get(k)
        if (hit) {
          old.delete(k)
          if (hit.value !== x) {
            hit.value = x
            hit.scope[hit.scope.length - 1] = x
          }
          for (const u of hit.block) u()
          next.push(hit)
        } else next.push(make(x, { parent: doc.createDocumentFragment(), next: null, claim: false }))
      }
      for (const gone of old.values()) for (const n of range(gone.first, gone.last)) (n as ChildNode).remove()
      const parent = end.parentNode!
      let at: Node = start.nextSibling ?? end
      for (const item of next) {
        if (item.first === at) at = item.last.nextSibling ?? end
        else for (const n of range(item.first, item.last)) parent.insertBefore(n, at)
      }
      items = next
    })
  }

  const effects = (step: Step) => {
    for (const e of step.effects) {
      if (e.type === 'navigate') options.onNavigate?.(e.route)
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
    effects(step)
  }

  return {
    attach(parent, before, node, scope, claim) {
      const c: Cursor = { parent, next: before, claim }
      const ns = parent instanceof Element && parent.namespaceURI === SVG_NS ? SVG_NS : null
      const [a, b] = span(c, () => render(node, scope, c, root, ns))
      if (a && b) ranges.push([a, b])
    },
    start() {
      if (first) effects(first)
      first = null
    },
    sync: () => {
      for (const u of root) u()
    },
    dispatch,
    snapshot: () => snapshot,
    destroy: () => {
      for (const t of timers) clearTimeout(t)
      timers.clear()
      root.length = 0
      for (const [a, b] of ranges) for (const n of range(a, b)) (n as ChildNode).remove()
      ranges.length = 0
    },
  }
}
