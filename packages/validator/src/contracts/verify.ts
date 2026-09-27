import { type Bindings, type FeatureIR, join, routeTable } from '@hozu/core/ir'
import { type CompiledMachine, compileMachine } from '@hozu/machine'
import type { Ctx } from '../context.ts'
import { type Coverage, drift, type Lockfile, lockOf } from './lock.ts'
import { isMechanical } from './mechanical.ts'
import { runContract } from './run.ts'
import { skeleton } from './skeleton.ts'

const transitionPointer = (feature: string, id: string) =>
  join('', 'features', feature, 'machine', 'states', ...id.split('/'))

function compile(ctx: Ctx, feature: FeatureIR, bindings: Bindings): CompiledMachine | null {
  try {
    return compileMachine(feature, bindings.fns, routeTable(ctx.ir))
  } catch (error) {
    ctx.report(
      'HZ015',
      feature.id,
      join('', 'features', feature.id, 'machine'),
      `Machine cannot run: ${(error as Error).message}`,
      'Contracts need an executable machine.',
    )
    return null
  }
}

export function verifyContracts(
  ctx: Ctx,
  bindings: Bindings,
  lock: Lockfile | null,
  accept = false,
): Lockfile {
  const coverage = new Map<string, Coverage>()
  const invalid = new Set(
    ctx.diagnostics.filter((d) => d.severity === 'error').map((d) => d.location.feature),
  )
  for (const feature of Object.values(ctx.ir.features)) {
    if (!feature.machine || invalid.has(feature.id)) continue
    const machine = compile(ctx, feature, bindings)
    if (!machine) continue
    const cov: Coverage = new Map(machine.transitions.map((id) => [id, new Set<string>()]))
    for (const [name, contract] of Object.entries(feature.contracts)) {
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
    }
    for (const [id, contracts] of cov)
      if (contracts.size === 0 && !isMechanical(feature, id))
        ctx.report(
          'HZ016',
          feature.id,
          transitionPointer(feature.id, id),
          `Transition ${id} is not covered by any contract`,
          'It makes a decision (a guard, a navigation or a computed value), so a contract must specify it (ADR 0037). Transitions that only copy values are reviewed through the lock instead.',
          {
            summary: `Add a contract that fires ${id}`,
            snippet: skeleton(ctx.ir, feature, id),
            patch: null,
          },
        )
    coverage.set(feature.id, cov)
  }
  const next = lockOf(ctx.ir, coverage)
  if (lock)
    for (const d of drift(lock, next)) {
      const feature = ctx.ir.features[d.feature]!
      const mechanical = d.contracts.length === 0 && isMechanical(feature, d.id)
      if (mechanical && accept) continue
      const change = d.before ? `was: ${d.before}; now: ${d.after}` : `now: ${d.after}`
      ctx.report(
        'HZ018',
        d.feature,
        transitionPointer(d.feature, d.id),
        mechanical
          ? `Transition ${d.id} changed (${change})`
          : `Behavior of ${d.id} changed but none of its contracts did`,
        mechanical
          ? 'Principle 5: a behavior change must be reviewed. This transition only copies values, so accepting it into the lock is the review.'
          : `Covered by ${d.contracts.join(', ') || 'no contract'}; principle 5 requires every behavior change that makes a decision to change a contract (${change}).`,
        {
          summary: mechanical
            ? 'If the change is intended, run hozu validate --update-lock'
            : 'Update or add a contract that specifies the new behavior, then run hozu validate --update-lock',
          snippet: null,
          patch: null,
        },
      )
    }
  return next
}
