import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { type BuildResult, buildProject, type ProjectIR } from '@tenon/core/ir'
import { closest } from '@tenon/validator'
import { TenonCliError } from './errors.ts'

export interface Loaded {
  path: string
  project: unknown
  build: (sources?: boolean) => BuildResult
}

export async function load(config: string | undefined, cwd: string): Promise<Loaded> {
  const path = resolve(cwd, config ?? 'tenon.config.ts')
  if (!existsSync(path))
    throw new TenonCliError('config', `No config found at ${path}`, [
      'Create tenon.config.ts exporting project({...}) as default, or pass --config <path>',
    ])
  let mod: { default?: unknown }
  try {
    mod = await import(pathToFileURL(path).href)
  } catch (error) {
    throw new TenonCliError(
      'config',
      `Failed to load ${path}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  const project = mod.default
  return {
    path,
    project,
    build: (sources = false) => {
      try {
        return buildProject(project, { sources })
      } catch (error) {
        throw new TenonCliError('config', error instanceof Error ? error.message : String(error))
      }
    },
  }
}

export function requireFeature(ir: ProjectIR, id: string | undefined) {
  const ids = Object.keys(ir.features)
  if (!id) throw new TenonCliError('usage', 'Missing <feature> argument', ids)
  const feature = ir.features[id]
  if (feature) return feature
  const guess = closest(id, ids)
  throw new TenonCliError('unknown-feature', `Unknown feature "${id}"`, guess ? [guess] : ids)
}
