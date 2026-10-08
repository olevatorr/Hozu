import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, extname, relative } from 'node:path'
import type { GenOutput } from '../contract.ts'
import { HozuCliError } from '../errors.ts'
import { goContract, goNotes } from '../gen/go.ts'
import type { Loaded } from '../load.ts'
import { remoteGroups } from '../remote.ts'
import { inspectApp } from './app.ts'

/** Writes the contract of every `remote()` in app.ts (ADR 0068). */
export async function runGen(loaded: Loaded, cwd: string): Promise<GenOutput> {
  const build = loaded.build()
  const { module } = await inspectApp(loaded, build)
  if (!module)
    throw new HozuCliError('config', 'hozu gen needs the app module: run hozu check for the reason')
  const groups = await remoteGroups(loaded, build, module.options.resolvers)
  if (!groups.length)
    throw new HozuCliError('usage', 'app.ts lists no remote() resolvers, so there is no contract to write', [
      "...remote({ url: { env: 'NOTES_SERVICE_URL' }, contract: new URL('./service/hozu/contract.go', import.meta.url) }, [listNotes, addNote]),",
      'hozu docs data --more   # resolvers in another language',
    ])
  const contracts: GenOutput['contracts'] = []
  for (const g of groups) {
    const file = relative(cwd, g.file)
    if (extname(g.file) !== '.go')
      throw new HozuCliError('usage', `${file}: hozu gen writes Go contracts only (a .go file)`)
    const text = goContract(g.contract, g.pkg)
    const written = !existsSync(g.file) || readFileSync(g.file, 'utf8') !== text
    if (written) {
      mkdirSync(dirname(g.file), { recursive: true })
      writeFileSync(g.file, text)
    }
    contracts.push({
      file,
      package: g.pkg,
      effects: g.contract.effects.map((e) => ({ ref: e.ref, fingerprint: e.fingerprint })),
      written,
      problems: g.contract.problems.map((p) => p.message),
      notes: goNotes(g.contract),
    })
  }
  return { contracts }
}

export function describeGen(out: GenOutput): string {
  const lines: string[] = []
  for (const c of out.contracts) {
    lines.push(
      `${c.written ? 'wrote' : 'unchanged'} ${c.file} (package ${c.package}): ${c.effects.length} ${c.effects.length === 1 ? 'effect' : 'effects'}`,
    )
    const width = Math.max(...c.effects.map((e) => e.ref.length))
    for (const e of c.effects) lines.push(`  ${e.ref.padEnd(width)}  ${e.fingerprint}`)
    for (const p of c.problems) lines.push(`  ✖ ${p}`)
    for (const n of c.notes) lines.push(`  note: ${n}`)
  }
  lines.push('', 'next: implement the Resolvers interface (go build), restart the service, then hozu check')
  return `${lines.join('\n')}\n`
}
