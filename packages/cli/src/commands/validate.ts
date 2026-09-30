import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join as joinPath } from 'node:path'
import { codes, type Diagnostic, hashJson, type Json, join, resolveSource } from '@hozu/core/ir'
import { decides, verify } from '@hozu/validator'
import type { Coverage, ValidateOutput } from '../contract.ts'
import { HozuCliError } from '../errors.ts'
import type { Loaded } from '../load.ts'
import { json, relativize } from '../output.ts'
import { unknownClasses } from '../styles.ts'

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

function readLock(path: string): unknown {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown
  } catch (error) {
    throw new HozuCliError('config', `Cannot read ${path}: ${(error as Error).message}`)
  }
}

export async function runValidate(
  loaded: Loaded,
  feature: string | undefined,
  cwd: string,
  updateLock = false,
): Promise<ValidateOutput> {
  const first = loaded.build(false)
  const second = loaded.build(false)
  const hash = hashJson(first.ir)
  const lockPath = joinPath(dirname(loaded.path), 'hozu.lock.json')
  const previous = readLock(lockPath)
  const unknown = await unknownClasses(loaded.path, first)
  const verified = verify(first.ir, {
    bindings: first.bindings,
    lock: previous,
    accept: updateLock,
    unknownClasses: unknown,
  })
  const traced = loaded.build(true)
  let diagnostics: Diagnostic[] = [...first.diagnostics, ...verified.diagnostics]
  if (hash !== hashJson(second.ir)) {
    const pointer = firstDifference(first.ir as unknown as Json, second.ir as unknown as Json) ?? ''
    const featureId = pointer.startsWith('/features/') ? (pointer.split('/')[2] ?? null) : null
    diagnostics.push({
      code: 'HZ011',
      severity: codes.HZ011.severity,
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
  diagnostics = diagnostics.map((d) =>
    d.location.source
      ? d
      : { ...d, location: { ...d.location, source: resolveSource(traced.sources, d.location.pointer) } },
  )
  const clean = !diagnostics.some((d) => d.severity === 'error')
  const machines = Object.keys(verified.lock?.features ?? {}).length > 0
  const current = previous !== null && json(previous) === json(verified.lock)
  let lock: ValidateOutput['lock'] =
    previous === null && !machines ? 'missing' : current ? 'current' : 'stale'
  if (updateLock && !current && (previous !== null || machines)) {
    lock = clean && verified.lock ? 'updated' : 'skipped'
    if (lock === 'updated') writeFileSync(lockPath, json(verified.lock))
  }
  const coverage: Record<string, Coverage> = {}
  for (const [fid, entries] of Object.entries(verified.lock?.features ?? {})) {
    if (feature && fid !== feature) continue
    const decisions = Object.entries(entries).filter(([id]) => decides(first.ir.features[fid]!, id))
    coverage[fid] = {
      covered: decisions.filter(([, e]) => Object.keys(e.contracts).length > 0).length,
      total: decisions.length,
      transitions: Object.keys(entries).length,
    }
  }
  const selected = feature ? diagnostics.filter((d) => d.location.feature === feature) : diagnostics
  const errors = selected.filter((d) => d.severity === 'error').length
  return {
    ok: errors === 0,
    hash,
    summary: { errors, warnings: selected.length - errors },
    coverage,
    lock,
    styles: unknown ? 'checked' : 'unavailable',
    diagnostics: relativize(selected, cwd),
  }
}
