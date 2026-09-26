import { parseArgs } from 'node:util'
import { runBuild } from './commands/build.ts'
import { describeExplain, runExplain } from './commands/explain.ts'
import { mermaid, runGraph } from './commands/graph.ts'
import { describeImpact, runImpact } from './commands/impact.ts'
import { runInspect } from './commands/inspect.ts'
import { describePlan, runPlan } from './commands/plan.ts'
import { runSkill } from './commands/skill.ts'
import { runValidate } from './commands/validate.ts'
import { HozuCliError } from './errors.ts'
import { load } from './load.ts'
import { human, json } from './output.ts'

const usage = `Usage: hozu <command> [options]

Commands:
  validate [feature]        Build the IR, run contracts, report diagnostics (exit 1 on errors)
  inspect <feature>         Print a feature's canonical IR and summary
  graph <feature>           Print a feature's state/effect/view graph (Mermaid, or --json)
  explain <feature>.<state> Explain a state: transitions, guards, effects, covering contracts
  impact <feature>.<symbol> What a query, mutation, tag, event, fn or view affects
  plan <route>              Derived render plan: regions, cache modes, hydration islands
  build                     Write dist/public, dist/server/render.js and dist/manifest.json for deployment
  skill                     Rewrite the agent skill for this Hozu version (--agent claude|agents|both)

Options:
  --json               Machine-readable output (schemas in @hozu/cli/schema)
  --config <path>      Config file (default: hozu.config.ts)
  --update-lock        validate: rewrite hozu.lock.json when there are no errors
  --out <dir>          build: output directory (default: dist)
  --agent <agent>      skill: claude, agents or both (default: the folders that exist)
  -h, --help           Show this help
`

export async function main(
  argv: string[],
  cwd = process.cwd(),
  out: (s: string) => void = (s) => process.stdout.write(s),
): Promise<number> {
  let asJson = false
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        json: { type: 'boolean', default: false },
        config: { type: 'string' },
        'update-lock': { type: 'boolean', default: false },
        out: { type: 'string' },
        agent: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    })
    asJson = values.json === true
    const [command, target] = positionals
    if (values.help || !command) {
      out(usage)
      return command || values.help ? 0 : 2
    }
    const commands = ['validate', 'inspect', 'graph', 'explain', 'impact', 'plan', 'build', 'skill']
    if (!commands.includes(command)) throw new HozuCliError('usage', `Unknown command "${command}"`, commands)
    if (command === 'skill') {
      const result = await runSkill(cwd, values.agent)
      out(asJson ? json(result) : `✔ wrote ${result.written.join(', ')}\n`)
      return 0
    }
    const loaded = await load(values.config, cwd)
    if (command === 'validate') {
      const result = await runValidate(loaded, target, cwd, values['update-lock'] === true)
      if (asJson) out(json(result))
      else {
        for (const d of result.diagnostics) out(`${human(d)}\n\n`)
        const coverage = Object.entries(result.coverage)
          .map(([f, c]) => `${f} ${c.covered}/${c.total}`)
          .join(', ')
        out(
          `${result.ok ? '✔' : '✖'} ${result.summary.errors} errors, ${result.summary.warnings} warnings · contracts cover ${coverage || 'n/a'} · styles ${result.styles} · lock ${result.lock} (ir ${result.hash.slice(0, 12)})\n`,
        )
      }
      return result.ok ? 0 : 1
    }
    if (command === 'inspect') {
      const result = runInspect(loaded, target)
      out(
        asJson
          ? json(result)
          : `${json({ feature: result.feature, hash: result.hash, summary: result.summary })}`,
      )
      return 0
    }
    if (command === 'build') {
      const result = await runBuild(loaded, values.out, cwd)
      out(asJson ? json(result) : `✔ wrote ${result.files.length} static files and ${result.manifest}\n`)
      return 0
    }
    if (command === 'plan') {
      const result = runPlan(loaded, target)
      out(asJson ? json(result) : describePlan(result))
      return 0
    }
    if (command === 'impact') {
      const result = runImpact(loaded, target)
      out(asJson ? json(result) : describeImpact(result))
      return 0
    }
    if (command === 'explain') {
      const result = runExplain(loaded, target)
      out(asJson ? json(result) : describeExplain(result))
      return 0
    }
    const graph = runGraph(loaded, target)
    out(asJson ? json(graph) : mermaid(graph))
    return 0
  } catch (error) {
    const e =
      error instanceof HozuCliError
        ? error
        : new HozuCliError('usage', error instanceof Error ? error.message : String(error))
    if (asJson) out(json(e.toJSON()))
    else
      process.stderr.write(
        `hozu: ${e.message}${e.suggestions.length ? `\n  ${e.suggestions.join('\n  ')}` : ''}\n`,
      )
    return 2
  }
}
