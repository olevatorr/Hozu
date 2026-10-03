import { existsSync } from 'node:fs'
import { register } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { type BuildResult, buildProject, envFilesOf, type ProjectIR } from '@hozu/core/ir'
import { closest } from '@hozu/validator'
import { HozuCliError } from './errors.ts'

export interface Loaded {
  path: string
  project: unknown
  /** The env files that existed and were read, relative to the config (ADR 0052). */
  envFiles: string[]
  build: (sources?: boolean) => BuildResult
}

export async function load(config: string | undefined, cwd: string): Promise<Loaded> {
  const path = resolve(cwd, config ?? 'hozu.config.ts')
  if (!existsSync(path))
    throw new HozuCliError('config', `No config found at ${path}`, [
      'Create hozu.config.ts exporting project({ ... }) as default, or pass --config <path>',
    ])
  let mod: { default?: unknown }
  registerTransform(
    process.env.HOZU_TRANSFORM_CACHE === '0' ? undefined : join(dirname(path), '.hozu/transform'),
  )
  try {
    mod = await import(pathToFileURL(path).href)
  } catch (error) {
    throw new HozuCliError(
      'config',
      `Failed to load ${path}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  const project = mod.default
  return {
    path,
    project,
    envFiles: loadEnvFiles(dirname(path), envFilesOf(project)),
    build: (sources = false) => {
      try {
        return buildProject(project, { sources })
      } catch (error) {
        throw new HozuCliError('config', error instanceof Error ? error.message : String(error))
      }
    },
  }
}

export function requireFeature(ir: ProjectIR, id: string | undefined) {
  const ids = Object.keys(ir.features)
  if (!id) throw new HozuCliError('usage', 'Missing <feature> argument', ids)
  const feature = ir.features[id]
  if (feature) return feature
  const guess = closest(id, ids)
  throw new HozuCliError('unknown-feature', `Unknown feature "${id}"`, guess ? [guess] : ids)
}

let registered = false
/** Registers the transform once per process; `cache` keeps its output for the next run (ADR 0050 D). */
export function registerTransform(cache?: string) {
  if (registered) return
  registered = true
  register('@hozu/transform/hook', import.meta.url, cache ? { data: { cache } } : undefined)
}

/**
 * Reads `project({ env: { files } })` into `process.env`: a later file wins over an earlier one and the shell wins
 * over every file (`process.loadEnvFile` never overwrites a set variable). Missing files are skipped.
 */
export function loadEnvFiles(dir: string, files: string[]): string[] {
  const read: string[] = []
  for (const file of [...files].reverse()) {
    const path = resolve(dir, file)
    if (!existsSync(path)) continue
    try {
      process.loadEnvFile(path)
    } catch (error) {
      throw new HozuCliError(
        'config',
        `Cannot read ${file}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    read.unshift(file)
  }
  return read
}
