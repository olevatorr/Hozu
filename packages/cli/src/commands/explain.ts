import type { FeatureIR, TransitionIR, ViewNode } from '@tenon/core/ir'
import { closest, verify } from '@tenon/validator'
import type { ExplainOutput, ExplainSend, ExplainTransition } from '../contract.ts'
import { TenonCliError } from '../errors.ts'
import { type Loaded, requireFeature } from '../load.ts'
import { renderAssign, renderGuard, renderValue } from '../render.ts'

const local = (ref: string) => ref.slice(ref.indexOf('.') + 1)

function transitionsOf(feature: FeatureIR, coveredBy: (id: string) => string[]): ExplainTransition[] {
  const out: ExplainTransition[] = []
  const add = (from: string, id: string, trigger: string, t: TransitionIR) =>
    out.push({
      id,
      from,
      to: t.target,
      trigger,
      guard: t.guard ? renderGuard(t.guard) : null,
      assign: t.assign.map(renderAssign),
      navigate: t.navigate,
      coveredBy: coveredBy(id),
    })
  for (const [name, s] of Object.entries(feature.machine?.states ?? {})) {
    for (const [event, list] of Object.entries(s.on))
      list.forEach((t, i) => add(name, `${name}/on/${event}/${i}`, `on ${local(event)}`, t))
    s.invoke?.done.forEach((t, i) => add(name, `${name}/invoke/done/${i}`, 'done', t))
    for (const [error, list] of Object.entries(s.invoke?.failed ?? {}))
      list.forEach((t, i) => add(name, `${name}/invoke/failed/${error}/${i}`, `failed.${error}`, t))
    s.after.forEach((a, i) => add(name, `${name}/after/${i}`, `after ${a.ms}ms`, a.transition))
  }
  return out
}

function sendsIn(feature: FeatureIR, state: string): ExplainSend[] {
  const out: ExplainSend[] = []
  const states = feature.machine!.states
  const walk = (node: ViewNode, view: string, visible: boolean) => {
    if (!visible) return
    switch (node.kind) {
      case 'el':
      case 'widget':
        for (const send of Object.values(node.on))
          out.push({
            view,
            node: node.id,
            event: send.event,
            handled: Boolean(states[state]!.on[send.event]?.length),
          })
        for (const c of node.children) walk(c, view, visible)
        return
      case 'when':
        for (const c of node.children) walk(c, view, node.states.includes(state))
        return
      case 'each':
        walk(node.item, view, visible)
        return
      case 'query':
        for (const c of [node.ready, ...(node.pending ? [node.pending] : []), ...Object.values(node.failed)])
          walk(c, view, visible)
        return
      default:
        return
    }
  }
  for (const [vid, view] of Object.entries(feature.views))
    if (view.machine === feature.id) walk(view.root, `${feature.id}.${vid}`, true)
  return out
}

export function runExplain(loaded: Loaded, target: string | undefined): ExplainOutput {
  if (!target?.includes('.'))
    throw new TenonCliError('usage', 'Expected <feature>.<state>, e.g. tenon explain cart.idle')
  const [fid, state] = [target.slice(0, target.indexOf('.')), target.slice(target.indexOf('.') + 1)]
  const build = loaded.build()
  const feature = requireFeature(build.ir, fid)
  const m = feature.machine
  if (!m) throw new TenonCliError('unknown-feature', `Feature "${fid}" has no machine`)
  const s = m.states[state]
  if (!s) {
    const guess = closest(state, Object.keys(m.states))
    throw new TenonCliError(
      'unknown-feature',
      `Unknown state "${state}" in ${fid}`,
      guess ? [`${fid}.${guess}`] : Object.keys(m.states).map((n) => `${fid}.${n}`),
    )
  }
  const { lock } = verify(build.ir, { bindings: build.bindings })
  const entries = lock?.features[fid] ?? {}
  const all = transitionsOf(feature, (id) => Object.keys(entries[id]?.contracts ?? {}))
  const effect = s.invoke ? build.ir.features[s.invoke.effect.split('.')[0]!] : undefined
  const effectSymbol = s.invoke ? local(s.invoke.effect) : ''
  const declared = effect?.queries[effectSymbol]?.errors ?? effect?.mutations[effectSymbol]?.errors ?? {}
  return {
    feature: fid,
    state,
    initial: m.initial === state,
    final: s.final,
    invoke: s.invoke
      ? {
          effect: s.invoke.effect,
          input: renderValue(s.invoke.input),
          errors: [...Object.keys(declared), 'Unexpected'],
        }
      : null,
    outgoing: all.filter((t) => t.from === state),
    incoming: all.filter((t) => t.to === state),
    sends: sendsIn(feature, state),
  }
}

export function describeExplain(out: ExplainOutput): string {
  const line = (t: ExplainTransition, dir: 'out' | 'in') => {
    const guard = t.guard ? ` [${t.guard}]` : ''
    const effects = [...t.assign, ...(t.navigate ? [`navigate(${t.navigate})`] : [])]
    const body = effects.length ? `  { ${effects.join('; ')} }` : ''
    const covered = t.coveredBy.length ? `  ✓ ${t.coveredBy.join(', ')}` : '  ✗ uncovered'
    return dir === 'out'
      ? `  ${t.trigger}${guard} → ${t.to}${body}${covered}`
      : `  ${t.from} --${t.trigger}${guard}--> ${out.state}`
  }
  const flags = [out.initial && 'initial', out.final && 'final'].filter(Boolean).join(', ')
  return [
    `${out.feature}.${out.state}${flags ? `  (${flags})` : ''}`,
    `invoke: ${out.invoke ? `${out.invoke.effect}(${out.invoke.input})  errors: ${out.invoke.errors.join(', ')}` : 'none'}`,
    'outgoing:',
    ...(out.outgoing.length ? out.outgoing.map((t) => line(t, 'out')) : ['  (none)']),
    'incoming:',
    ...(out.incoming.length ? out.incoming.map((t) => line(t, 'in')) : ['  (none)']),
    'views can send:',
    ...(out.sends.length
      ? out.sends.map((s) => `  ${local(s.event)} from ${s.node}${s.handled ? '' : '  ✗ not handled here'}`)
      : ['  (nothing)']),
    '',
  ].join('\n')
}
