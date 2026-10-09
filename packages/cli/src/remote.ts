import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, extname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type BuildResult, codes, type Diagnostic, type RemoteContract, remoteContract } from '@hozu/core/ir'
import { importer } from './commands/app.ts'
import { goFingerprints, goWholeContract } from './gen/go.ts'
import type { Loaded } from './load.ts'

export interface RemoteGroup {
  /** The generated contract file, absolute. */
  file: string
  /** The Go package: the contract's folder name. */
  pkg: string
  contract: RemoteContract
  /** Where the app reaches the service: a URL, or the env variable that holds it. */
  url: string
}

interface Data {
  remotesOf(
    set: unknown,
    refOf: (decl: object) => string | undefined,
  ): { options: { contract: { href: string }; url: string | { env: string } }; refs: string[] }[]
}

export const packageOf = (file: string) =>
  basename(dirname(file))
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '') || 'hozu'

/** Every `remote()` group of the app's resolvers with its contract (ADR 0068). */
export async function remoteGroups(
  loaded: Loaded,
  build: BuildResult,
  resolvers: unknown,
): Promise<RemoteGroup[]> {
  const data = await importer(loaded, 'gen')<Data>('@hozu/data')
  return data
    .remotesOf(resolvers, (decl) => build.bindings.refs.get(decl))
    .map(({ options, refs }) => {
      const file = fileURLToPath(options.contract.href)
      const url = typeof options.url === 'string' ? options.url : options.url.env
      return { file, pkg: packageOf(file), contract: remoteContract(build.ir, refs), url }
    })
}

const appLine = (app: string) => {
  try {
    const at = readFileSync(app, 'utf8')
      .split('\n')
      .findIndex((l) => /\bremote\(/.test(l))
    return { file: app, line: at + 1, column: 1 }
  } catch {
    return null
  }
}

/** HZ093 for a contract that is missing, not Go, or generated from other declarations. */
export function remoteDiagnostics(loaded: Loaded, groups: RemoteGroup[], app: string): Diagnostic[] {
  const shown = (file: string) => relative(dirname(loaded.path), file)
  const out: Diagnostic[] = []
  for (const g of groups) {
    const problem = (message: string, cause: string, summary: string) =>
      out.push({
        code: 'HZ093',
        severity: codes.HZ093.severity,
        message,
        location: { feature: null, pointer: '/app', source: appLine(app) },
        cause,
        fix: { summary, snippet: 'npx hozu gen', patch: null },
      })
    if (extname(g.file) !== '.go') {
      problem(
        `remote() names the contract ${shown(g.file)}, but hozu gen writes Go contracts only`,
        'The contract is the generated file the service compiles against.',
        "Name a .go file: contract: new URL('./service/hozu/contract.go', import.meta.url)",
      )
      continue
    }
    if (!existsSync(g.file)) {
      problem(
        `The remote contract ${shown(g.file)} does not exist`,
        'hozu gen writes it from the declarations remote() lists.',
        'Run hozu gen, then implement the Resolvers interface it prints in the service',
      )
      continue
    }
    const text = readFileSync(g.file, 'utf8')
    const found = goFingerprints(text)
    if (!Object.keys(found).length && goWholeContract(text)) {
      problem(
        `The remote contract ${shown(g.file)} was written by an older hozu gen (one fingerprint for the whole contract); run hozu gen and rebuild the service`,
        'Since 0.23 the contract carries one fingerprint per effect, so the service answers 409 for every call.',
        'Run hozu gen, fix the service until go build passes, and rebuild it',
      )
      continue
    }
    const stale = [
      ...g.contract.effects
        .filter((e) => found[e.ref] !== e.fingerprint)
        .map((e) => (found[e.ref] ? `${e.ref} changed` : `${e.ref} is missing`)),
      ...Object.keys(found)
        .filter((ref) => !g.contract.effects.some((e) => e.ref === ref))
        .map((ref) => `${ref} is no longer remote`),
    ]
    if (stale.length)
      problem(
        `The remote contract ${shown(g.file)} is stale: ${stale.join(', ')}`,
        'A declaration remote() lists changed after hozu gen wrote the contract, so the service answers 409 for it.',
        'Run hozu gen, fix the service until go build passes, and rebuild it',
      )
  }
  return out
}
