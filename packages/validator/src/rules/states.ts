import { type At, at, resolveAt } from '@hozu/core/ir'
import type { Ctx } from '../context.ts'
import { closest, didYouMean } from '../suggest.ts'
import { featurePointer, type TransitionSite, transitionsOf, walkView } from '../walk.ts'

export function reachability(ctx: Ctx) {
  for (const f of Object.values(ctx.ir.features)) {
    const m = f.machine
    if (!m || !Object.hasOwn(m.states, m.initial)) continue
    const edges = new Map<string, string[]>()
    for (const site of transitionsOf(f)) {
      if (site.transition.target === 'previous') continue
      const list = edges.get(site.state)
      if (list) list.push(site.transition.target)
      else edges.set(site.state, [site.transition.target])
    }
    const seen = new Set([m.initial])
    const queue = [m.initial]
    for (let i = 0; i < queue.length; i++)
      for (const next of edges.get(queue[i]!) ?? [])
        if (!seen.has(next) && Object.hasOwn(m.states, next)) {
          seen.add(next)
          queue.push(next)
        }
    for (const state of Object.keys(m.states)) {
      if (seen.has(state)) continue
      const p = featurePointer(f.id, 'machine', 'states', state)
      ctx.report(
        'HZ001',
        f.id,
        p,
        `State "${state}" is unreachable from "${m.initial}"`,
        'No transition from a reachable state targets it (on, invoke done/failed or after).',
        {
          summary: `Add a transition that targets "${state}", or remove the state`,
          snippet: `on(SomeEvent, { target: '${state}' })`,
          patch: [{ op: 'remove', path: resolveAt(p) }],
        },
      )
    }
  }
}

export function deadEnds(ctx: Ctx) {
  for (const f of Object.values(ctx.ir.features))
    for (const [state, s] of Object.entries(f.machine?.states ?? {})) {
      if (s.final || s.invoke || s.after.length || Object.values(s.on).some((l) => l.length)) continue
      const p = featurePointer(f.id, 'machine', 'states', state)
      ctx.report(
        'HZ010',
        f.id,
        p,
        `State "${state}" has no way out`,
        'It is not final and has no on, invoke or after transitions.',
        {
          summary: `Mark "${state}" as final or add a transition out of it`,
          snippet: `${state}: { final: true }`,
          patch: [{ op: 'replace', path: resolveAt(at(p, 'final')), value: true }],
        },
      )
    }
}

/** States whose snapshot can hold a `previous`: entered from a state without invoke, directly or through busy ones. */
function enteredStates(sites: TransitionSite[], states: Record<string, { invoke: unknown }>): Set<string> {
  const busy = (s: string) => !!states[s]?.invoke
  const edges = sites
    .filter((t) => t.transition.target !== 'previous' && t.transition.target !== t.state)
    .map((t) => [t.state, t.transition.target] as const)
  const returning = sites.filter((t) => t.transition.target === 'previous').map((t) => t.state)
  const calm = (to: string) => {
    const found = new Set<string>()
    const seen = new Set([to])
    const queue = [to]
    for (let i = 0; i < queue.length; i++)
      for (const [from, next] of edges)
        if (next === queue[i] && !seen.has(from)) {
          seen.add(from)
          if (busy(from)) queue.push(from)
          else found.add(from)
        }
    return found
  }
  const known = new Set<string>()
  for (let changed = true; changed; ) {
    changed = false
    const add = (s: string) => {
      if (known.has(s)) return
      known.add(s)
      changed = true
    }
    for (const [from, to] of edges) if (!busy(from) || known.has(from)) add(to)
    for (const s of returning) if (known.has(s)) for (const t of calm(s)) add(t)
  }
  return known
}

export function stateNames(ctx: Ctx) {
  for (const f of Object.values(ctx.ir.features)) {
    const m = f.machine
    const names = Object.keys(m?.states ?? {})
    const known = (s: string) => m !== null && Object.hasOwn(m.states, s)
    const dangling = (p: At, name: string, what: string) => {
      const guess = closest(name, names)
      ctx.report(
        'HZ007',
        f.id,
        p,
        `Unknown state "${name}" in ${what}.${didYouMean(guess)}`,
        `States of ${f.id}: ${names.join(', ') || '(no machine)'}.`,
        {
          summary: guess ? `Use "${guess}"` : 'Use one of the declared states',
          snippet: null,
          patch: guess ? [{ op: 'replace', path: resolveAt(p), value: guess }] : null,
        },
      )
    }
    if (m && !known(m.initial)) dangling(featurePointer(f.id, 'machine', 'initial'), m.initial, 'initial')
    const entered = enteredStates(transitionsOf(f), m?.states ?? {})
    for (const site of transitionsOf(f))
      if (site.transition.target === 'previous') {
        if (site.trigger.kind !== 'on' && !entered.has(site.state))
          ctx.report(
            'HZ007',
            f.id,
            site.at('target'),
            `"${site.state}" has no previous state to return to`,
            `No transition enters "${site.state}" from another state, so target: 'previous' never fires there and the machine stays in "${site.state}".`,
            {
              summary: 'Name the target state',
              snippet: null,
              patch: m ? [{ op: 'replace', path: resolveAt(site.at('target')), value: m.initial }] : null,
            },
          )
      } else if (!known(site.transition.target))
        dangling(site.at('target'), site.transition.target, 'a transition target')
    for (const [cid, c] of Object.entries(f.contracts)) {
      if (c.given.previous !== undefined && !known(c.given.previous))
        dangling(
          featurePointer(f.id, 'contracts', cid, 'given', 'previous'),
          c.given.previous,
          'contract given',
        )
      else if (c.given.previous !== undefined && m?.states[c.given.previous]?.invoke)
        ctx.report(
          'HZ007',
          f.id,
          featurePointer(f.id, 'contracts', cid, 'given', 'previous'),
          `given.previous "${c.given.previous}" invokes ${m.states[c.given.previous]!.invoke!.effect}`,
          'previous is the last state without invoke the machine left, so a busy state is never it.',
          { summary: 'Name the state the person was in before the busy states', snippet: null, patch: null },
        )
      if (!known(c.given.state))
        dangling(featurePointer(f.id, 'contracts', cid, 'given', 'state'), c.given.state, 'contract given')
      if (!known(c.expect.state))
        dangling(featurePointer(f.id, 'contracts', cid, 'expect', 'state'), c.expect.state, 'contract expect')
    }
    for (const [vid, view] of Object.entries(f.views)) {
      if (view.machine !== null && view.machine !== f.id)
        ctx.report(
          'HZ006',
          f.id,
          featurePointer(f.id, 'views', vid, 'machine'),
          `View ${f.id}.${vid} is bound to the machine of "${view.machine}"`,
          'A view may only bind to its own feature machine.',
          {
            summary: 'Bind the view to this feature machine',
            snippet: null,
            patch: [
              {
                op: 'replace',
                path: resolveAt(featurePointer(f.id, 'views', vid, 'machine')),
                value: m ? f.id : null,
              },
            ],
          },
        )
      else if (view.machine === f.id && !m)
        ctx.report(
          'HZ007',
          f.id,
          featurePointer(f.id, 'views', vid, 'machine'),
          `View ${f.id}.${vid} is bound to a machine but ${f.id} has none`,
          'Add the machine to feature({ declarations }) or remove machine from the view.',
          {
            summary: 'Unbind the view',
            snippet: null,
            patch: [
              { op: 'replace', path: resolveAt(featurePointer(f.id, 'views', vid, 'machine')), value: null },
            ],
          },
        )
      walkView(ctx.ir, f, vid, view, ({ node, pointer }) => {
        if (node.kind !== 'when') return
        node.states.forEach((s, i) => {
          if (!known(s)) dangling(at(pointer, 'states', i), s, 'when()')
        })
      })
    }
  }
}

const firstShadowed = (list: readonly { guard: unknown }[]): number => {
  for (let i = 0; i < list.length - 1; i++) if (list[i]!.guard === null) return i
  return -1
}

export function shadowing(ctx: Ctx) {
  const check = (feature: string, base: At, list: readonly { guard: unknown }[], label: string) => {
    const first = firstShadowed(list)
    if (first < 0) return
    const shadowed = list.map((_, i) => i).filter((i) => i > first)
    for (const i of shadowed)
      ctx.report(
        'HZ009',
        feature,
        at(base, i),
        `Transition ${i} for ${label} can never run`,
        `Transition ${first} has no guard and is tried first.`,
        {
          summary: 'Move the guardless transition last, or give it a guard',
          snippet: null,
          patch: [...shadowed]
            .reverse()
            .map((j) => ({ op: 'remove' as const, path: resolveAt(at(base, j)) })),
        },
      )
  }
  for (const f of Object.values(ctx.ir.features)) {
    const states = f.machine?.states
    if (!states) continue
    for (const state in states) {
      const s = states[state]!
      const base = featurePointer(f.id, 'machine', 'states', state)
      for (const event in s.on) {
        const list = s.on[event]!
        if (firstShadowed(list) >= 0) check(f.id, at(base, 'on', event), list, `${event} in "${state}"`)
      }
      if (s.invoke) {
        if (firstShadowed(s.invoke.done) >= 0)
          check(f.id, at(base, 'invoke', 'done'), s.invoke.done, `done in "${state}"`)
        for (const error in s.invoke.failed) {
          const list = s.invoke.failed[error]!
          if (firstShadowed(list) >= 0)
            check(f.id, at(base, 'invoke', 'failed', error), list, `failed.${error} in "${state}"`)
        }
      }
      for (let i = 1; i < s.after.length; i++) {
        const a = s.after[i]!
        const unguarded = s.after.findIndex((b) => b.ms === a.ms && b.transition.guard === null)
        if (unguarded < 0 || unguarded >= i) continue
        const shadowed = s.after
          .map((b, j) => (b.ms === a.ms && j > unguarded ? j : -1))
          .filter((j) => j >= 0)
        ctx.report(
          'HZ009',
          f.id,
          at(base, 'after', i),
          `after(${a.ms}) transition ${i} in "${state}" can never run`,
          `after entry ${unguarded} has the same delay and no guard.`,
          {
            summary: 'Remove the shadowed entry or guard the earlier one',
            snippet: null,
            patch: shadowed
              .reverse()
              .map((j) => ({ op: 'remove' as const, path: resolveAt(at(base, 'after', j)) })),
          },
        )
      }
    }
  }
}
