import { type At, at, type FeatureIR, type GuardExpr, type ProjectIR, type ValueExpr } from '@tenon/core/ir'
import type { RefKind } from './resolve.ts'
import { featurePointer, transitionsOf, walkView } from './walk.ts'

export interface RefSite {
  feature: FeatureIR
  pointer: At
  ref: string
  kind: RefKind
  key: boolean
}

export const hasRefs = (value: ValueExpr): boolean => 'fn' in value || 'object' in value || 'test' in value

export const guardHasRefs = (guard: GuardExpr): boolean =>
  'left' in guard ? hasRefs(guard.left) || hasRefs(guard.right) : true

export function valueRefs(value: ValueExpr, pointer: At, out: (ref: string, pointer: At) => void) {
  if ('fn' in value) {
    out(value.fn, at(pointer, 'fn'))
    valueRefs(value.arg, at(pointer, 'arg'), out)
  } else if ('object' in value) {
    for (const [k, v] of Object.entries(value.object)) valueRefs(v, at(pointer, 'object', k), out)
  } else if ('test' in value) guardRefs(value.test, at(pointer, 'test'), out)
}

export function guardRefs(guard: GuardExpr, pointer: At, out: (ref: string, pointer: At) => void) {
  switch (guard.op) {
    case 'and':
    case 'or':
      guard.args.forEach((g, i) => guardRefs(g, at(pointer, 'args', i), out))
      return
    case 'not':
      guardRefs(guard.arg, at(pointer, 'arg'), out)
      return
    case 'fn':
      out(guard.fn, at(pointer, 'fn'))
      valueRefs(guard.arg, at(pointer, 'arg'), out)
      return
    default:
      valueRefs(guard.left, at(pointer, 'left'), out)
      valueRefs(guard.right, at(pointer, 'right'), out)
  }
}

export function refSites(ir: ProjectIR): RefSite[] {
  const sites: RefSite[] = []
  for (const f of Object.values(ir.features)) {
    const add = (ref: string, pointer: At, kind: RefKind, key = false) =>
      sites.push({ feature: f, pointer, ref, kind, key })
    const fnRef = (ref: string, pointer: At) => add(ref, pointer, 'fn')
    for (const [sym, q] of Object.entries(f.queries))
      q.tags.forEach((t, i) => {
        const p = featurePointer(f.id, 'queries', sym, 'tags', i)
        add(t.tag, at(p, 'tag'), 'tag')
        if (t.param && hasRefs(t.param)) valueRefs(t.param, at(p, 'param'), fnRef)
      })
    for (const [sym, m] of Object.entries(f.mutations))
      m.invalidates.forEach((t, i) => {
        const p = featurePointer(f.id, 'mutations', sym, 'invalidates', i)
        add(t.tag, at(p, 'tag'), 'tag')
        if (t.param && hasRefs(t.param)) valueRefs(t.param, at(p, 'param'), fnRef)
      })
    for (const [state, s] of Object.entries(f.machine?.states ?? {})) {
      const base = featurePointer(f.id, 'machine', 'states', state)
      for (const event of Object.keys(s.on)) add(event, at(base, 'on', event), 'event', true)
      if (s.invoke) {
        add(s.invoke.effect, at(base, 'invoke', 'effect'), 'effect')
        if (hasRefs(s.invoke.input)) valueRefs(s.invoke.input, at(base, 'invoke', 'input'), fnRef)
      }
    }
    for (const site of transitionsOf(f)) {
      if (site.transition.guard && guardHasRefs(site.transition.guard))
        guardRefs(site.transition.guard, site.at('guard'), fnRef)
      site.transition.assign.forEach(
        (a, i) => hasRefs(a.value) && valueRefs(a.value, site.at('assign', i, 'value'), fnRef),
      )
    }
    for (const [vid, view] of Object.entries(f.views))
      walkView(ir, f, vid, view, ({ node, pointer }) => {
        switch (node.kind) {
          case 'el':
            for (const [dom, send] of Object.entries(node.on)) {
              add(send.event, at(pointer, 'on', dom, 'event'), 'event')
              if (hasRefs(send.payload)) valueRefs(send.payload, at(pointer, 'on', dom, 'payload'), fnRef)
            }
            for (const key of ['attrs', 'toggle', 'vars'] as const)
              for (const [name, v] of Object.entries(node[key]))
                if (hasRefs(v)) valueRefs(v, at(pointer, key, name), fnRef)
            return
          case 'text':
            if (hasRefs(node.value)) valueRefs(node.value, at(pointer, 'value'), fnRef)
            return
          case 'each':
            if (hasRefs(node.source)) valueRefs(node.source, at(pointer, 'source'), fnRef)
            return
          case 'query':
            add(node.query, at(pointer, 'query'), 'query')
            if (hasRefs(node.input)) valueRefs(node.input, at(pointer, 'input'), fnRef)
            return
          case 'embed':
            add(node.view, at(pointer, 'view'), 'view')
            return
          default:
            return
        }
      })
    for (const [cid, c] of Object.entries(f.contracts)) {
      c.when.forEach((step, i) => {
        const p = featurePointer(f.id, 'contracts', cid, 'when', i)
        if ('send' in step) add(step.send, at(p, 'send'), 'event')
        else if ('done' in step) add(step.done, at(p, 'done'), 'effect')
        else if ('failed' in step) add(step.failed, at(p, 'failed'), 'effect')
      })
      c.expect.effects?.forEach((e, i) =>
        add(e.effect, featurePointer(f.id, 'contracts', cid, 'expect', 'effects', i, 'effect'), 'effect'),
      )
    }
  }
  return sites
}
