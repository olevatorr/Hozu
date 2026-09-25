import type { ContractDef, Step } from '../builders/contract.ts'
import type { ContractIR, StepIR } from '../ir/types.ts'
import { type Decl, defOf } from '../model/decl.ts'
import { type At, at, type FeatureScope } from './scope.ts'

function step(scope: FeatureScope, s: Step, p: At): StepIR {
  if ('send' in s) return { send: scope.ref(s.send, ['event'], p), payload: scope.json(s.payload) }
  if ('done' in s) return { done: scope.ref(s.done, ['query', 'mutation'], p), result: scope.json(s.result) }
  if ('failed' in s)
    return {
      failed: scope.ref(s.failed, ['query', 'mutation'], p),
      error: String(s.error),
      data: scope.json(s.data),
    }
  return { elapse: s.elapse }
}

export function buildContract(scope: FeatureScope, symbol: string, decl: Decl): ContractIR {
  const p = scope.at('contracts', symbol)
  const d = defOf<ContractDef>(decl)
  const owner = scope.project.owners.get(d.machine)
  if (owner?.feature !== scope.id)
    scope.report(
      'TN006',
      p,
      'Contract targets a machine outside this feature',
      'Contracts specify the behavior of their own feature machine.',
    )
  const fallback: ContractIR = {
    given: { state: '?', context: null },
    when: [],
    expect: { state: '?', context: null, effects: null },
  }
  return scope.attempt(
    p,
    () => ({
      given: { state: String(d.given.state), context: scope.json(d.given.context) },
      when: d.when.map((s, i) => step(scope, s, at(p, 'when', i))),
      expect: {
        state: String(d.expect.state),
        context: d.expect.context === null ? null : scope.json(d.expect.context),
        effects:
          d.expect.effects === null
            ? null
            : d.expect.effects.map((e, i) => ({
                effect: scope.ref(e.effect, ['query', 'mutation'], at(p, 'expect', 'effects', i)),
                input: scope.json(e.input),
              })),
      },
    }),
    fallback,
  )
}
