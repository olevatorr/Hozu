import { canonicalStringify } from '@tenon/core/canonical'
import type { Json, ValueExpr, ViewIR, ViewNode } from '@tenon/core/ir'
import {
  type CompiledMachine,
  getIn,
  type Input,
  init,
  type Snapshot,
  type Step,
  transition,
} from '@tenon/machine'

export type Result = { ok: true; value: Json } | { ok: false; error: string; data: Json }

export type Payload = Map<string, Result>

export interface MountOptions {
  view: ViewIR
  machine: CompiledMachine | null
  payload: Payload
  fns?: Record<string, (input: never) => unknown>
  snapshot?: Snapshot
  onInvoke?: (effect: string, input: Json) => Promise<Result>
  onNavigate?: (route: string) => void
}

export interface Mounted {
  dispatch(input: Input): void
  snapshot(): Snapshot | null
  destroy(): void
}

type Block = (() => void)[]

const text = (v: Json) =>
  v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)

const reads = (v: ValueExpr): boolean =>
  'ref' in v
    ? v.ref === 'context'
    : 'object' in v
      ? Object.values(v.object).some(reads)
      : 'fn' in v && reads(v.arg)

export const payloadKey = (query: string, input: Json) => query + canonicalStringify(input)

export function mount(target: Element, options: MountOptions): Mounted {
  const { machine, payload, fns = {} } = options
  const doc = target.ownerDocument
  const timers = new Set<ReturnType<typeof setTimeout>>()
  let first: Step | null = machine ? (options.snapshot ? null : init(machine)) : null
  let snapshot: Snapshot | null = options.snapshot ?? first?.snapshot ?? null
  const root: Block = []
  let queue: (() => void)[] = []

  const value = (v: ValueExpr, scope: Json[]): Json => {
    if ('literal' in v) return v.literal
    if ('object' in v) {
      const out: Record<string, Json> = {}
      for (const k in v.object) out[k] = value(v.object[k]!, scope)
      return out
    }
    if ('fn' in v) return (fns[v.fn] as (x: Json) => Json)(value(v.arg, scope))
    if (v.ref === 'binding') return getIn(scope[v.depth], v.path)
    return v.ref === 'context' ? getIn(snapshot?.context, v.path) : null
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

  const region = (
    block: Block,
    parent: Node,
    id: string,
    fill: (into: DocumentFragment, inner: Block) => void,
    key: () => unknown,
  ) => {
    const start = parent.appendChild(doc.createComment(id))
    const end = parent.appendChild(doc.createComment(`/${id}`))
    let inner: Block = []
    let current: unknown = {}
    const sync = () => {
      const next = key()
      if (next === current) {
        for (const u of inner) u()
        return
      }
      current = next
      while (start.nextSibling && start.nextSibling !== end) start.nextSibling.remove()
      inner = []
      const outer = queue
      queue = []
      const frag = doc.createDocumentFragment()
      fill(frag, inner)
      end.before(frag)
      const nested = queue
      queue = outer
      for (const n of nested) n()
    }
    block.push(sync)
    queue.push(sync)
  }

  const render = (node: ViewNode, scope: Json[], parent: Node, block: Block): void => {
    switch (node.kind) {
      case 'text': {
        const t = doc.createTextNode('')
        bind(block, node.value, scope, (x) => {
          t.data = text(x)
        })
        parent.appendChild(t)
        return
      }
      case 'el': {
        const el = doc.createElement(node.tag)
        el.setAttribute('data-t', node.id)
        if (node.class) el.className = node.class
        for (const [name, v] of Object.entries(node.attrs))
          bind(block, v, scope, (x) =>
            x === null || x === false
              ? el.removeAttribute(name)
              : el.setAttribute(name, x === true ? '' : text(x)),
          )
        for (const [dom, send] of Object.entries(node.on))
          el.addEventListener(dom, (e) => {
            if (dom === 'submit') e.preventDefault()
            dispatch({ type: 'event', event: send.event, payload: value(send.payload, scope) })
          })
        for (const c of node.children) render(c, scope, el, block)
        parent.appendChild(el)
        return
      }
      case 'when': {
        const fill = (into: DocumentFragment, inner: Block) => {
          if (snapshot && node.states.includes(snapshot.state))
            for (const c of node.children) render(c, scope, into, inner)
        }
        region(block, parent, node.id, fill, () => (snapshot ? node.states.includes(snapshot.state) : false))
        return
      }
      case 'each': {
        const fill = (into: DocumentFragment, inner: Block) => {
          const items = value(node.source, scope)
          if (Array.isArray(items)) for (const item of items) render(node.item, [...scope, item], into, inner)
        }
        region(block, parent, node.id, fill, () => value(node.source, scope))
        return
      }
      case 'query': {
        const fill = (into: DocumentFragment, inner: Block) => {
          const result = payload.get(payloadKey(node.query, value(node.input, scope)))
          if (!result) {
            if (node.pending) render(node.pending, scope, into, inner)
          } else if (result.ok) render(node.ready, [...scope, result.value], into, inner)
          else {
            const branch = node.failed[result.error] ?? node.failed.Unexpected
            if (branch) render(branch, [...scope, result.data], into, inner)
          }
        }
        region(block, parent, node.id, fill, () => payloadKey(node.query, value(node.input, scope)))
        return
      }
      default:
        parent.appendChild(doc.createComment(`embed ${node.view}`))
    }
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

  render(options.view.root, [], target, root)
  const initial = queue
  queue = []
  for (const sync of initial) sync()
  if (first) effects(first)
  first = null

  return {
    dispatch,
    snapshot: () => snapshot,
    destroy: () => {
      for (const t of timers) clearTimeout(t)
      timers.clear()
      root.length = 0
      target.replaceChildren()
    },
  }
}
