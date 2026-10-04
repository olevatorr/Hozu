import { type Bindings, type FeatureIR, hashJson, type Json, join, routeTable } from '@hozu/core/ir'
import { type CompiledMachine, compileMachine } from '@hozu/machine'
import type { Ctx } from '../context.ts'
import { type Coverage, isV2, type LockChange, lockChanges, lockOf, pagesChanges } from './lock.ts'
import { decides, locate, showAssign, showEnters, showFns, showGuard, showValue } from './mechanical.ts'
import type { BehaviorRecord, LockfileV2 } from './record.ts'
import { runContract } from './run.ts'
import { skeleton } from './skeleton.ts'

const transitionPointer = (feature: string, id: string) =>
  join('', 'features', feature, 'machine', 'states', ...id.split('/'))

const machinePointer = (feature: string) => join('', 'features', feature, 'machine')

function compile(ctx: Ctx, feature: FeatureIR, bindings: Bindings): CompiledMachine | null {
  try {
    return compileMachine(feature, bindings.fns, routeTable(ctx.ir))
  } catch (error) {
    ctx.report(
      'HZ015',
      feature.id,
      machinePointer(feature.id),
      `Machine cannot run: ${(error as Error).message}`,
      'Contracts need an executable machine.',
    )
    return null
  }
}

function duplicates(ctx: Ctx, feature: FeatureIR) {
  const seen = new Map<string, string>()
  for (const name of Object.keys(feature.contracts).sort()) {
    const hash = hashJson(feature.contracts[name] as unknown as Json)
    const first = seen.get(hash)
    if (!first) {
      seen.set(hash, name)
      continue
    }
    const pointer = join('', 'features', feature.id, 'contracts', name)
    ctx.report(
      'HZ064',
      feature.id,
      pointer,
      `Contract ${name} is identical to ${first}`,
      'Two contracts with the same IR specify the same behaviour twice; the copy reviews nothing (ADR 0043 G).',
      { summary: `Remove ${name}`, snippet: null, patch: [{ op: 'remove', path: pointer }] },
    )
  }
}

function withoutDecision(ctx: Ctx, feature: FeatureIR, found: { name: string; taken: string[] }[]) {
  if (!found.length) return
  const names = found.map((c) => c.name)
  const shown = names.length > 3 ? `${names.slice(0, 3).join(', ')} …` : names.join(', ')
  const entries = [...new Set(found.flatMap((c) => c.taken))].sort()
  ctx.report(
    'HZ058',
    feature.id,
    join('', 'features', feature.id, 'contracts', names[0]!),
    `${names.length} contract${names.length === 1 ? ' covers' : 's cover'} no decision: ${shown}`,
    [
      'Every transition these contracts fire only copies values, and they evaluate no guard; hozu.lock.json already reviews those transitions (ADR 0043 G).',
      ...found.map((c) => `${c.name}: ${c.taken.join(' → ')}`),
    ].join('\n'),
    {
      summary:
        'Contracts belong where a transition decides (a guard, a navigate, a computed value). The lock entries below review these transitions',
      snippet: entries.map((id) => `hozu.lock.json ${feature.id} ${id}`).join('\n'),
      patch: null,
    },
  )
}

function previousFeature(feature: FeatureIR, id: string, record: BehaviorRecord): FeatureIR {
  const f = structuredClone(feature)
  const { transition } = locate(f, id)
  transition.guard = record.guard
  transition.assign = record.assign
  transition.navigate = record.navigate
  transition.target = record.enters.state
  const target = f.machine!.states[record.enters.state]
  if (target) {
    const { effect, input, timers, final } = record.enters
    if (effect === null) target.invoke = null
    else if (target.invoke && input) target.invoke = { ...target.invoke, effect, input }
    target.after = target.after.filter((a) => timers.includes(a.ms))
    target.final = final
  }
  return f
}

function specified(ctx: Ctx, bindings: Bindings, feature: FeatureIR, change: LockChange): boolean {
  const before = change.before!
  const covering = Object.keys(change.after!.contracts)
  if (!covering.length) return false
  if (change.fields.includes('fns')) {
    const known = new Set(Object.values(before.contracts))
    if (covering.some((c) => !known.has(change.after!.contracts[c]!))) return true
  }
  let machine: CompiledMachine
  try {
    machine = compileMachine(
      previousFeature(feature, change.id, before.fields),
      bindings.fns,
      routeTable(ctx.ir),
    )
  } catch {
    return true
  }
  return covering.some((c) => runContract(machine, feature.contracts[c]!, bindings.checks).failure !== null)
}

const fieldText: Record<keyof BehaviorRecord, (r: BehaviorRecord) => string> = {
  guard: (r) => (r.guard ? showGuard(r.guard) : 'none'),
  assign: (r) => showAssign(r.assign) || 'none',
  navigate: (r) => (r.navigate ? showValue(r.navigate) : 'none'),
  enters: (r) => [r.enters.state, showEnters(r.enters)].filter(Boolean).join(' · '),
  fns: (r) => showFns(r.fns) || 'none',
}

function unspecified(ctx: Ctx, feature: FeatureIR, change: LockChange) {
  const before = change.before!
  const after = change.after!
  const covering = Object.keys(after.contracts)
  ctx.report(
    'HZ018',
    feature.id,
    transitionPointer(feature.id, change.id),
    `Behavior of ${change.id} changed (${change.fields.join(', ')}) and no covering contract specifies it`,
    [
      ...change.fields.map(
        (k) => `${k}: was ${fieldText[k](before.fields)}; now ${fieldText[k](after.fields)}`,
      ),
      `was: ${before.summary}`,
      `now: ${after.summary}`,
      covering.length
        ? `Covered by ${covering.join(', ')}: each passes against the previous behaviour too, so none specifies the change. Renaming or copying a contract does not count.`
        : 'No contract covers it, and it decides (principle 5).',
    ].join('\n'),
    {
      summary:
        'Change or add a contract that fails against the previous behaviour and passes now, then run hozu check --update-lock',
      snippet: skeleton(ctx.ir, feature, change.id),
      patch: null,
    },
  )
}

const lineOf = (c: LockChange): string => {
  const names = (e: LockChange['before']) =>
    Object.entries(e?.contracts ?? {})
      .map(([n, h]) => (c.before?.contracts[n] && c.before.contracts[n] !== h ? `${n}*` : n))
      .join(', ') || 'none'
  switch (c.kind) {
    case 'new':
      return `new ${c.id} · now: ${c.after!.summary}`
    case 'removed':
      return `removed ${c.id} · was: ${c.before!.summary}`
    case 'changed':
      return `changed ${c.id} (${c.fields.join(', ') || 'summary'}) · was: ${c.before!.summary} · now: ${c.after!.summary}`
    default:
      return `contracts ${c.id}: was ${names(c.before)}; now ${names(c.after)}`
  }
}

/** What --update-lock accepts: one line per changed transition (with its now:), then the page table changes (ADR 0056 A7). */
export function lockDiff(previous: unknown, next: LockfileV2): string[] {
  const before = isV2(previous) ? previous : null
  const removed = Object.keys(before?.features ?? {}).filter((f) => !(f in next.features))
  return [
    ...lockChanges(before, next, removed).map((c) => `${c.feature}: ${lineOf(c)}`),
    ...pagesChanges(before, next).map((l) => `pages: ${l}`),
  ]
}

const UPDATE_FIX = {
  summary:
    'If every listed change is intended, run hozu check --update-lock, then list the accepted now: lines in your final summary for the owner to review',
  snippet: 'hozu check --update-lock',
  patch: null,
}

function outOfDate(ctx: Ctx, fid: string, changes: LockChange[], why: 'missing' | 'v1' | null) {
  const states = ctx.ir.features[fid]?.machine?.states ?? {}
  const counts = (['changed', 'new', 'removed', 'contracts'] as const)
    .map((k) => [k, changes.filter((c) => c.kind === k).length] as const)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => (k === 'contracts' ? `${n} contract map${n === 1 ? '' : 's'}` : `${n} ${k}`))
    .join(', ')
  const owner = changes[0]!.id.split('/')[0]!
  const pointer =
    why || !states[owner]
      ? ctx.ir.features[fid]?.machine
        ? machinePointer(fid)
        : join('', 'features', fid)
      : join('', 'features', fid, 'machine', 'states', owner)
  ctx.report(
    'HZ057',
    fid,
    pointer,
    why === 'missing'
      ? `hozu.lock.json is missing; ${fid} has ${changes.length} transitions to review`
      : why === 'v1'
        ? `hozu.lock.json is version 1; ${fid} has ${changes.length} transitions to review in the 0.8 format`
        : `hozu.lock.json is out of date for ${fid}: ${counts}`,
    [
      'The lock must equal the computed lock, so every copy-only change, new or removed transition and contract map is reviewed (ADR 0043 G).',
      ...changes.map(lineOf),
    ].join('\n'),
    UPDATE_FIX,
  )
}

function reviewLock(
  ctx: Ctx,
  bindings: Bindings,
  lock: unknown,
  next: LockfileV2,
  skipped: Set<string>,
  accept: boolean,
) {
  const previous = isV2(lock) ? lock : null
  const why = lock === null ? 'missing' : previous ? null : 'v1'
  if (why === 'missing' && !Object.keys(next.features).length) return
  const removed = Object.keys(previous?.features ?? {}).filter(
    (fid) => !next.features[fid] && !skipped.has(fid),
  )
  const byFeature = new Map<string, LockChange[]>()
  for (const change of lockChanges(previous, next, removed)) {
    if (skipped.has(change.feature)) continue
    const feature = ctx.ir.features[change.feature]
    const deciding = change.kind === 'changed' && (change.before!.decides || change.after!.decides)
    if (feature && deciding && !specified(ctx, bindings, feature, change)) unspecified(ctx, feature, change)
    else byFeature.set(change.feature, [...(byFeature.get(change.feature) ?? []), change])
  }
  if (accept) return
  for (const [fid, changes] of byFeature) outOfDate(ctx, fid, changes, why)
  const pages = pagesChanges(previous, next)
  if (pages.length && why !== 'missing')
    ctx.report(
      'HZ057',
      null,
      '/pages',
      `hozu.lock.json pages are out of date: ${pages.length} change${pages.length === 1 ? '' : 's'}`,
      [
        'Head error maps, endpoint statuses, redirects and who may run each effect (access) are reviewed through the lock (ADR 0043 D, G; ADR 0056 B).',
        ...pages,
      ].join('\n'),
      UPDATE_FIX,
    )
}

export function verifyContracts(ctx: Ctx, bindings: Bindings, lock: unknown, accept = false): LockfileV2 {
  const coverage = new Map<string, Coverage>()
  const skipped = new Set<string>()
  const invalid = new Set(
    ctx.diagnostics.filter((d) => d.severity === 'error').map((d) => d.location.feature),
  )
  for (const feature of Object.values(ctx.ir.features)) {
    if (!feature.machine) continue
    const machine = invalid.has(feature.id) ? null : compile(ctx, feature, bindings)
    if (!machine) {
      skipped.add(feature.id)
      continue
    }
    const cov: Coverage = new Map(machine.transitions.map((id) => [id, new Set<string>()]))
    const noDecision: { name: string; taken: string[] }[] = []
    for (const [name, contract] of Object.entries(feature.contracts).sort(([a], [b]) => a.localeCompare(b))) {
      const run = runContract(machine, contract, bindings.checks)
      for (const id of run.taken) cov.get(id)?.add(name)
      if (run.failure)
        ctx.report(
          run.failure.code,
          feature.id,
          join('', 'features', feature.id, 'contracts', name, ...run.failure.tokens),
          `Contract ${name}: ${run.failure.message}`,
          run.failure.cause,
          {
            summary:
              run.failure.code === 'HZ017'
                ? 'Make the contract data match the declared schema'
                : 'Decide which is intended: fix the machine, or update the contract to specify the new behavior',
            snippet: run.failure.snippet ?? null,
            patch: null,
          },
        )
      else if (run.taken.length && !run.guards.length && !run.taken.some((id) => decides(feature, id)))
        noDecision.push({ name, taken: run.taken })
    }
    duplicates(ctx, feature)
    withoutDecision(ctx, feature, noDecision)
    const source = (id: string) => {
      const pointer = transitionPointer(feature.id, id)
      return bindings.copies[pointer] ?? pointer
    }
    const coveredSources = new Set([...cov].filter(([, c]) => c.size > 0).map(([id]) => source(id)))
    for (const [id, contracts] of cov)
      if (contracts.size === 0 && decides(feature, id) && !coveredSources.has(source(id)))
        ctx.report(
          'HZ016',
          feature.id,
          transitionPointer(feature.id, id),
          `Transition ${id} is not covered by any contract`,
          'It decides (a guard, a navigation, or a fn, comparison or computing operator in its values), so a contract must specify it (ADR 0037, ADR 0043 G). Transitions that only copy values are reviewed through the lock instead.',
          {
            summary: `Add a contract that fires ${id}`,
            snippet: skeleton(ctx.ir, feature, id),
            patch: null,
          },
        )
    coverage.set(feature.id, cov)
  }
  const next = lockOf(ctx.ir, coverage)
  if (lock !== undefined) reviewLock(ctx, bindings, lock, next, skipped, accept)
  return next
}
