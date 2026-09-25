import { codes, type Diagnostic, hashJson, type Json, join, resolveSource } from '@tenon/core/ir'
import { validate } from '@tenon/validator'
import type { ValidateOutput } from '../contract.ts'
import type { Loaded } from '../load.ts'
import { relativize } from '../output.ts'

function firstDifference(a: Json, b: Json, pointer = ''): string | null {
  if (a === b) return null
  if (
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    a === null ||
    b === null ||
    Array.isArray(a) !== Array.isArray(b)
  )
    return pointer
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of [...keys].sort()) {
    const diff = firstDifference(
      (a as Record<string, Json>)[key] ?? null,
      (b as Record<string, Json>)[key] ?? null,
      join(pointer, key),
    )
    if (diff !== null) return diff
  }
  return null
}

export function runValidate(loaded: Loaded, feature: string | undefined, cwd: string): ValidateOutput {
  const first = loaded.build(false)
  const second = loaded.build(false)
  const hash = hashJson(first.ir)
  let diagnostics: Diagnostic[] = [...first.diagnostics, ...validate(first.ir)]
  if (hash !== hashJson(second.ir)) {
    const pointer = firstDifference(first.ir as unknown as Json, second.ir as unknown as Json) ?? ''
    const featureId = pointer.startsWith('/features/') ? (pointer.split('/')[2] ?? null) : null
    diagnostics.push({
      code: 'TN011',
      severity: codes.TN011.severity,
      message: 'Building the project twice produced different IR',
      location: { feature: featureId, pointer, source: null },
      cause:
        'A builder callback depends on something that changes between runs (time, randomness, mutable state).',
      fix: {
        summary: 'Make the callback a pure function of its reference arguments',
        snippet: null,
        patch: null,
      },
    })
  }
  if (diagnostics.length) {
    const traced = loaded.build(true)
    diagnostics = diagnostics.map((d) => ({
      ...d,
      location: { ...d.location, source: resolveSource(traced.sources, d.location.pointer) },
    }))
  }
  const selected = feature ? diagnostics.filter((d) => d.location.feature === feature) : diagnostics
  const errors = selected.filter((d) => d.severity === 'error').length
  return {
    ok: errors === 0,
    hash,
    summary: { errors, warnings: selected.length - errors },
    diagnostics: relativize(selected, cwd),
  }
}
