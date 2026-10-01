import { existsSync, readFileSync } from 'node:fs'
import { createRequire, register } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveFrom, type Stale07, staleEntries } from './migrate-stale.ts'

export type On08 = Omit<Stale07, 'routes'>

type Lock = Parameters<typeof staleEntries>[0]

/** Runs in its own process: loads the app with its installed 0.8 packages (ADR 0045 L, step 1). */
export async function on08(config: string): Promise<On08> {
  const req = createRequire(config)
  const empty = (skipped: string, core: string | null = null, irVersion: number | null = null): On08 => ({
    core,
    irVersion,
    skipped,
    stale: [],
    errors: [],
    ir: null,
  })
  const corePath = resolveFrom(req, '@hozu/core/ir')
  if (!corePath) return empty('@hozu/core is not installed')
  const version = JSON.parse(readFileSync(join(dirname(corePath), '../package.json'), 'utf8'))
    .version as string
  const validatorPath = resolveFrom(req, '@hozu/validator')
  const hook = resolveFrom(req, '@hozu/transform/hook')
  if (!validatorPath || !hook) return empty('@hozu/validator or @hozu/transform is not installed', version)
  register(pathToFileURL(hook))
  const core = await import(pathToFileURL(corePath).href)
  const validator = await import(pathToFileURL(validatorPath).href)
  const built = core.buildProject((await import(pathToFileURL(config).href)).default, { sources: false })
  if (built.ir.irVersion !== 2)
    return empty(
      built.ir.irVersion === 3
        ? 'the installed Hozu already builds IR v3 (0.9): the stale check runs on 0.8, before the upgrade'
        : `the installed Hozu builds IR v${built.ir.irVersion}: run hozu migrate 0.8 first`,
      version,
      built.ir.irVersion,
    )
  const lockPath = join(dirname(config), 'hozu.lock.json')
  const committed = existsSync(lockPath) ? (JSON.parse(readFileSync(lockPath, 'utf8')) as Lock) : null
  const verified = validator.verify(built.ir, { bindings: built.bindings, lock: null, accept: true })
  const errors = [...built.diagnostics, ...verified.diagnostics]
    .filter((d: { severity: string }) => d.severity === 'error')
    .map((d: { code: string; message: string }) => `${d.code} ${d.message}`)
  return {
    core: version,
    irVersion: 2,
    skipped: committed ? null : 'no hozu.lock.json',
    stale: committed && verified.lock ? staleEntries(committed, verified.lock) : [],
    errors,
    ir: built.ir,
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const result = await on08(process.argv[2]!).catch(
    (error: unknown): On08 => ({
      core: null,
      irVersion: null,
      skipped: `the 0.8 app did not load: ${error instanceof Error ? error.message : String(error)}`,
      stale: [],
      errors: [],
      ir: null,
    }),
  )
  process.stdout.write(JSON.stringify(result), () => process.exit(0))
}
