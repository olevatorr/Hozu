import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, extname, join as joinPath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import { codes, type Diagnostic, hashJson, type Json, join, resolveSource } from '@hozu/core/ir'
import { decides, type LockfileV2, verify } from '@hozu/validator'
import type { Coverage, ValidateOutput } from '../contract.ts'
import { HozuCliError } from '../errors.ts'
import type { Loaded } from '../load.ts'
import { json, relativize } from '../output.ts'
import { projectStyles } from '../styles.ts'

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
  const styles = await projectStyles(loaded.path, first)
  const verified = verify(first.ir, {
    bindings: first.bindings,
    lock: previous,
    accept: updateLock,
    unknownClasses: styles?.unknown ?? null,
    classes: styles?.classes ?? null,
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
    summary: { errors, warnings: selected.length - errors, accepted: 0 },
    coverage,
    lock,
    styles: styles ? 'checked' : 'unavailable',
    diagnostics: relativize(selected, cwd),
    accepted: [],
  }
}

/** The scaffold's first lock: the whole lock when none exists, else only the created features' entries. */
export function seedLock(loaded: Loaded, features: string[]): { path: string; created: boolean } | null {
  const build = loaded.build(false)
  const lockPath = joinPath(dirname(loaded.path), 'hozu.lock.json')
  const previous = readLock(lockPath) as LockfileV2 | { version?: unknown } | null
  const verified = verify(build.ir, { bindings: build.bindings })
  const failed = [...build.diagnostics, ...verified.diagnostics].some((d) => d.severity === 'error')
  if (failed || !verified.lock || !Object.keys(verified.lock.features).length) return null
  if (previous !== null && previous.version !== 2) return null
  const next = verified.lock
  const sorted = <T>(o: Record<string, T>) =>
    Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)))
  const old = previous as LockfileV2 | null
  const lock: LockfileV2 = old
    ? {
        version: 2,
        features: sorted({
          ...old.features,
          ...Object.fromEntries(features.filter((f) => next.features[f]).map((f) => [f, next.features[f]!])),
        }),
        pages: {
          head: sorted({ ...next.pages.head, ...old.pages.head }),
          endpoints: sorted({ ...next.pages.endpoints, ...old.pages.endpoints }),
          redirects: sorted({ ...next.pages.redirects, ...old.pages.redirects }),
        },
      }
    : next
  writeFileSync(lockPath, json(lock))
  return { path: lockPath, created: previous === null }
}

export const featuresCreated = (created: string[]): string[] =>
  created.flatMap((f) => /(?:^|[\\/])features[\\/]([^\\/]+)[\\/]feature\.ts$/.exec(f)?.[1] ?? [])

type Seeded = { path: string; created: boolean } | null

/** Runs in a worker so the app modules it imports never enter this process's module cache. */
export const seedLockIsolated = (
  config: string | undefined,
  cwd: string,
  features: string[],
): Promise<Seeded> =>
  new Promise((resolve) => {
    const self = fileURLToPath(import.meta.url)
    const worker = new Worker(joinPath(dirname(self), `seed-lock${extname(self)}`), {
      workerData: { config, cwd, features },
    })
    worker.once('message', (seeded: Seeded) => resolve(seeded))
    worker.once('error', () => resolve(null))
    worker.once('exit', () => resolve(null))
  })
