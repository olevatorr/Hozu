import { type Bindings, type FeatureIR, join } from '@tenon/core/ir'
import { type CompiledMachine, compileMachine } from '@tenon/machine'
import type { Ctx } from '../context.ts'
import { type Coverage, drift, type Lockfile, lockOf } from './lock.ts'
import { runContract } from './run.ts'
import { skeleton } from './skeleton.ts'

const transitionPointer = (feature: string, id: string) =>
  join('', 'features', feature, 'machine', 'states', ...id.split('/'))

function compile(ctx: Ctx, feature: FeatureIR, bindings: Bindings): CompiledMachine | null {
  try {
    return compileMachine(feature, bindings.fns)
  } catch (error) {
    ctx.report(
      'TN015',
      feature.id,
      join('', 'features', feature.id, 'machine'),
      `Machine cannot run: ${(error as Error).message}`,
      'Contracts need an executable machine.',
    )
    return null
  }
}

export function verifyContracts(ctx: Ctx, bindings: Bindings, lock: Lockfile | null): Lockfile {
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
              run.failure.code === 'TN017'
                ? 'Make the contract data match the declared schema'
                : 'Decide which is intended: fix the machine, or update the contract to specify the new behavior',
            snippet: null,
            patch: null,
          },
        )
    }
    for (const [id, contracts] of cov)
      if (contracts.size === 0)
        ctx.report(
          'TN016',
          feature.id,
          transitionPointer(feature.id, id),
          `Transition ${id} is not covered by any contract`,
          'Every transition must be exercised by at least one contract (ADR 0004).',
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
    for (const d of drift(lock, next))
      ctx.report(
        'TN018',
        d.feature,
        transitionPointer(d.feature, d.id),
        `Behavior of ${d.id} changed but none of its contracts did`,
        `Covered by ${d.contracts.join(', ') || 'no contract'}; principle 5 requires every behavior change to change a contract.`,
        {
          summary:
            'Update or add a contract that specifies the new behavior, then run tenon validate --update-lock',
          snippet: null,
          patch: null,
        },
      )
  return next
}
