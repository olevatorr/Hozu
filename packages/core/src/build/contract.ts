import type { ContractDef, Step } from '../builders/contract.ts'
import { tagUseOf } from '../builders/tag.ts'
import { canonicalStringify } from '../canonical/stringify.ts'
import type { ContractIR, Json, StepIR } from '../ir/types.ts'
import { type Decl, defOf } from '../model/decl.ts'
import { type At, at, type FeatureScope } from './scope.ts'

function tagKey(scope: FeatureScope, u: unknown, p: At): string {
  const use = tagUseOf(u)
  if (!use) return '?'
  const ref = scope.ref(use.tag, ['tag'], p)
  return use.param === null ? ref : `${ref}(${canonicalStringify(scope.json(use.param))})`
}

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

const plain = (x: unknown): x is Record<string, Json> =>
  typeof x === 'object' && x !== null && !Array.isArray(x)

function merge(base: Json, changes: Json | undefined): Json {
  if (changes === undefined) return base
  if (!plain(base) || !plain(changes)) return changes
  const out: Record<string, Json> = { ...base }
  for (const [k, v] of Object.entries(changes)) out[k] = merge(base[k] ?? null, v)
  return out
}

export function buildContract(scope: FeatureScope, symbol: string, decl: Decl): ContractIR {
  const p = scope.at('contracts', symbol)
  const d = defOf<ContractDef>(decl)
  const owner = scope.project.owners.get(d.machine)
  if (owner?.feature !== scope.id)
    scope.report(
      'HZ006',
      p,
      'Contract targets a machine outside this feature',
      'Contracts specify the behavior of their own feature machine.',
    )
  const fallback: ContractIR = {
    given: { state: '?', context: null },
    when: [],
    expect: { state: '?', context: null, effects: null },
  }
  const initial = defOf<{ initialContext?: unknown }>(d.machine as Decl)?.initialContext
  const given = merge(
    scope.json(initial ?? null),
    d.given.context === undefined ? undefined : scope.json(d.given.context),
  )
  return scope.attempt(
    p,
    () => ({
      given: {
        state: String(d.given.state),
        context: given,
        ...(d.given.previous === undefined ? {} : { previous: String(d.given.previous) }),
      },
      when: d.when.map((s, i) => step(scope, s, at(p, 'when', i))),
      expect: {
        state: String(d.expect.state),
        context: merge(given, d.expect.changes === undefined ? undefined : scope.json(d.expect.changes)),
        effects: (d.expect.effects ?? []).map((e, i) =>
          'navigate' in e
            ? { navigate: String(e.navigate) }
            : 'copy' in e
              ? { copy: String(e.copy) }
              : 'refresh' in e
                ? {
                    refresh: e.refresh.map((u, j) =>
                      tagKey(scope, u, at(p, 'expect', 'effects', i, 'refresh', j)),
                    ),
                  }
                : {
                    effect: scope.ref(e.effect, ['query', 'mutation'], at(p, 'expect', 'effects', i)),
                    input: scope.json(e.input),
                  },
        ),
      },
    }),
    fallback,
  )
}
