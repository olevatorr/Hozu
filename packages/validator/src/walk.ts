import {
  type At,
  at,
  type FeatureIR,
  join,
  type ProjectIR,
  type TransitionIR,
  UNEXPECTED_ERROR_SCHEMA,
  type ViewIR,
  type ViewNode,
} from '@hozu/core/ir'
import { contextEnv, type Env, effectSchemas, type schemaIn, valueSchema } from './env.ts'
import { resolveRef } from './resolve.ts'
import { itemsOf } from './schema.ts'

export type Trigger =
  | { kind: 'on'; event: string }
  | { kind: 'done'; effect: string }
  | { kind: 'failed'; effect: string; error: string }
  | { kind: 'after'; ms: number }

export class TransitionSite {
  readonly feature: string
  readonly state: string
  readonly trigger: Trigger
  readonly index: number
  readonly transition: TransitionIR
  readonly envKey: string

  constructor(feature: string, state: string, trigger: Trigger, index: number, transition: TransitionIR) {
    this.feature = feature
    this.state = state
    this.trigger = trigger
    this.index = index
    this.transition = transition
    this.envKey =
      trigger.kind === 'on'
        ? `${feature}|on|${trigger.event}`
        : trigger.kind === 'after'
          ? `${feature}|after`
          : `${feature}|${trigger.kind}|${trigger.effect}|${trigger.kind === 'failed' ? trigger.error : ''}`
  }

  get pointer(): string {
    const base = join('', 'features', this.feature, 'machine', 'states', this.state)
    const t = this.trigger
    switch (t.kind) {
      case 'on':
        return join(base, 'on', t.event, this.index)
      case 'done':
        return join(base, 'invoke', 'done', this.index)
      case 'failed':
        return join(base, 'invoke', 'failed', t.error, this.index)
      default:
        return join(base, 'after', this.index, 'transition')
    }
  }

  at(...tokens: (string | number)[]): At {
    return () => join(this.pointer, ...tokens)
  }
}

export const featurePointer =
  (id: string, ...tokens: (string | number)[]): At =>
  () =>
    join('', 'features', id, ...tokens)

const cache = new WeakMap<FeatureIR, TransitionSite[]>()

export function transitionsOf(feature: FeatureIR): TransitionSite[] {
  const hit = cache.get(feature)
  if (hit) return hit
  const sites: TransitionSite[] = []
  const id = feature.id
  for (const [state, s] of Object.entries(feature.machine?.states ?? {})) {
    for (const [event, list] of Object.entries(s.on)) {
      const trigger: Trigger = { kind: 'on', event }
      for (let i = 0; i < list.length; i++) sites.push(new TransitionSite(id, state, trigger, i, list[i]!))
    }
    if (s.invoke) {
      const effect = s.invoke.effect
      const done: Trigger = { kind: 'done', effect }
      for (let i = 0; i < s.invoke.done.length; i++)
        sites.push(new TransitionSite(id, state, done, i, s.invoke.done[i]!))
      for (const [error, list] of Object.entries(s.invoke.failed)) {
        const trigger: Trigger = { kind: 'failed', effect, error }
        for (let i = 0; i < list.length; i++) sites.push(new TransitionSite(id, state, trigger, i, list[i]!))
      }
    }
    for (let i = 0; i < s.after.length; i++) {
      const a = s.after[i]!
      sites.push(new TransitionSite(id, state, { kind: 'after', ms: a.ms }, i, a.transition))
    }
  }
  cache.set(feature, sites)
  return sites
}

export interface NodeSite {
  node: ViewNode
  pointer: At
  visible: string[] | null
  env: Env
}

export function walkView(
  ir: ProjectIR,
  feature: FeatureIR,
  viewId: string,
  view: ViewIR,
  visit: (site: NodeSite) => void,
) {
  const bound = view.machine === feature.id && feature.machine !== null
  const root: Env = bound ? contextEnv(feature) : { feature, sources: {}, bindings: [] }
  const base: Env = {
    ...root,
    sources: {
      ...root.sources,
      ...(bound ? { state: { type: 'string', enum: Object.keys(feature.machine!.states) } } : {}),
      locale: { type: 'string' },
      alternate: null,
      env: ir.env?.public ?? { type: 'object', properties: {}, additionalProperties: false },
    },
  }
  const env: Env =
    view.route && view.route !== '?'
      ? {
          ...base,
          sources: {
            ...base.sources,
            params: ir.routes[view.route]?.params ?? null,
            search: ir.routes[view.route]?.search ?? null,
          },
        }
      : base
  const all = bound ? Object.keys(feature.machine!.states) : null
  const walk = (node: ViewNode, pointer: At, visible: string[] | null, env: Env) => {
    visit({ node, pointer, visible, env })
    const bind = (schema: ReturnType<typeof schemaIn>): Env => ({
      ...env,
      bindings: [...env.bindings, schema],
    })
    switch (node.kind) {
      case 'el':
      case 'component':
        node.children.forEach((c, i) => walk(c, at(pointer, 'children', i), visible, env))
        return
      case 'if':
        node.ifTrue.forEach((c, i) => walk(c, at(pointer, 'ifTrue', i), visible, env))
        node.ifFalse.forEach((c, i) => walk(c, at(pointer, 'ifFalse', i), visible, env))
        return
      case 'when': {
        const narrowed = visible ? visible.filter((s) => node.states.includes(s)) : null
        node.children.forEach((c, i) => walk(c, at(pointer, 'children', i), narrowed, env))
        return
      }
      case 'each':
        walk(node.item, at(pointer, 'item'), visible, bind(itemsOf(valueSchema(ir, env, node.source))))
        return
      case 'query': {
        const q = resolveRef(ir, node.query, 'query')
        const schemas = q ? effectSchemas(ir, node.query) : null
        walk(node.ready, at(pointer, 'ready'), visible, bind(schemas?.output ?? null))
        if (node.pending) walk(node.pending, at(pointer, 'pending'), visible, env)
        for (const [name, child] of Object.entries(node.failed))
          walk(
            child,
            at(pointer, 'failed', name),
            visible,
            bind(schemas ? schemas.error(name) : name === 'Unexpected' ? UNEXPECTED_ERROR_SCHEMA : null),
          )
        return
      }
      default:
        return
    }
  }
  walk(view.root, featurePointer(feature.id, 'views', viewId, 'root'), all, env)
}
