import { parseArgs } from 'node:util'
import { mermaid, runGraph } from './commands/graph.ts'
import { runInspect } from './commands/inspect.ts'
import { runValidate } from './commands/validate.ts'
import { TenonCliError } from './errors.ts'
import { load } from './load.ts'
import { human, json } from './output.ts'

const usage = `Usage: tenon <command> [options]

Commands:
  validate [feature]   Build the IR and report diagnostics (exit 1 on errors)
  inspect <feature>    Print a feature's canonical IR and summary
  graph <feature>      Print a feature's state/effect/view graph (Mermaid, or --json)

Options:
  --json               Machine-readable output (schemas in @tenon/cli/schema)
  --config <path>      Config file (default: tenon.config.ts)
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
        help: { type: 'boolean', short: 'h' },
      },
    })
    asJson = values.json === true
    const [command, target] = positionals
    if (values.help || !command) {
      out(usage)
      return command || values.help ? 0 : 2
    }
    const commands = ['validate', 'inspect', 'graph']
    if (!commands.includes(command))
      throw new TenonCliError('usage', `Unknown command "${command}"`, commands)
    const loaded = await load(values.config, cwd)
    if (command === 'validate') {
      const result = runValidate(loaded, target, cwd)
      if (asJson) out(json(result))
      else {
        for (const d of result.diagnostics) out(`${human(d)}\n\n`)
        out(
          `${result.ok ? '✔' : '✖'} ${result.summary.errors} errors, ${result.summary.warnings} warnings (ir ${result.hash.slice(0, 12)})\n`,
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
    const graph = runGraph(loaded, target)
    out(asJson ? json(graph) : mermaid(graph))
    return 0
  } catch (error) {
    const e =
      error instanceof TenonCliError
        ? error
        : new TenonCliError('usage', error instanceof Error ? error.message : String(error))
    if (asJson) out(json(e.toJSON()))
    else
      process.stderr.write(
        `tenon: ${e.message}${e.suggestions.length ? `\n  ${e.suggestions.join('\n  ')}` : ''}\n`,
      )
    return 2
  }
}
