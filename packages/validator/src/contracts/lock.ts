import { hashJson, type Json, type ProjectIR, pageTables } from '@hozu/core/ir'
import { decides, summaryOf } from './mechanical.ts'
import {
  type BehaviorRecord,
  behaviorOf,
  contractHash,
  type LockEntryV2,
  type LockfileV2,
  recordOf,
} from './record.ts'

export type Coverage = Map<string, Set<string>>

export function lockOf(ir: ProjectIR, coverage: Map<string, Coverage>): LockfileV2 {
  const features: LockfileV2['features'] = {}
  for (const [fid, cov] of [...coverage].sort(([a], [b]) => a.localeCompare(b))) {
    const feature = ir.features[fid]!
    const initial = feature.machine!.initialContext
    const entries: Record<string, LockEntryV2> = {}
    for (const [id, contracts] of [...cov].sort(([a], [b]) => a.localeCompare(b))) {
      const fields = recordOf(ir, feature, id)
      entries[id] = {
        behavior: behaviorOf(id, fields),
        summary: summaryOf(feature, id, fields),
        decides: decides(feature, id),
        fields,
        contracts: Object.fromEntries(
          [...contracts].sort().map((c) => [c, contractHash(feature.contracts[c]!, initial)]),
        ),
      }
    }
    features[fid] = entries
  }
  return { version: 2, features, pages: pageTables(ir) }
}

export type ChangeKind = 'new' | 'removed' | 'changed' | 'contracts'

export interface LockChange {
  feature: string
  id: string
  kind: ChangeKind
  before: LockEntryV2 | null
  after: LockEntryV2 | null
  fields: (keyof BehaviorRecord)[]
}

const same = (a: unknown, b: unknown) => hashJson(a as Json) === hashJson(b as Json)

export const isV2 = (lock: unknown): lock is LockfileV2 =>
  typeof lock === 'object' && lock !== null && (lock as { version?: unknown }).version === 2

const recordKeys: (keyof BehaviorRecord)[] = ['guard', 'assign', 'navigate', 'enters', 'fns']

export function changedFields(before: BehaviorRecord, after: BehaviorRecord): (keyof BehaviorRecord)[] {
  return recordKeys.filter((k) => !same(before[k], after[k]))
}

/** Every difference between the lock on disk and the computed one, for the features that were computed. */
export function lockChanges(
  previous: LockfileV2 | null,
  next: LockfileV2,
  removedFeatures: string[],
): LockChange[] {
  const out: LockChange[] = []
  const features = [...new Set([...Object.keys(next.features), ...removedFeatures])].sort()
  for (const fid of features) {
    const before = previous?.features[fid] ?? {}
    const after = next.features[fid] ?? {}
    for (const id of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
      const b = before[id] ?? null
      const a = after[id] ?? null
      if (!b) out.push({ feature: fid, id, kind: 'new', before: null, after: a, fields: [] })
      else if (!a) out.push({ feature: fid, id, kind: 'removed', before: b, after: null, fields: [] })
      else if (b.behavior !== a.behavior || !same(b.fields, a.fields) || b.summary !== a.summary)
        out.push({
          feature: fid,
          id,
          kind: 'changed',
          before: b,
          after: a,
          fields: changedFields(b.fields, a.fields),
        })
      else if (!same(b.contracts, a.contracts) || b.decides !== a.decides)
        out.push({ feature: fid, id, kind: 'contracts', before: b, after: a, fields: [] })
    }
  }
  return out
}

export function pagesChanges(previous: LockfileV2 | null, next: LockfileV2): string[] {
  const out: string[] = []
  const prev = previous?.pages ?? { head: {}, endpoints: {}, redirects: {} }
  for (const section of ['head', 'endpoints', 'redirects'] as const) {
    const b = prev[section] as Record<string, Json>
    const a = next.pages[section] as Record<string, Json>
    for (const key of [...new Set([...Object.keys(b), ...Object.keys(a)])].sort())
      if (!same(b[key] ?? null, a[key] ?? null))
        out.push(
          `${section} ${key}: ${b[key] === undefined ? 'new' : `was ${JSON.stringify(b[key])}`}; ${a[key] === undefined ? 'removed' : `now ${JSON.stringify(a[key])}`}`,
        )
  }
  return out
}
