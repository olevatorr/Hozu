import { parseArgs } from 'node:util'
import { describeAdd, runAddFeature } from './commands/add.ts'
import { runBuild } from './commands/build.ts'
import { runCheck } from './commands/check.ts'
import { describeExplain, runExplain } from './commands/explain.ts'
import { mermaid, runGraph } from './commands/graph.ts'
import { describeImpact, runImpact } from './commands/impact.ts'
import { runInspect } from './commands/inspect.ts'
import { describeMap, runMap } from './commands/map.ts'
import { describePlan, runPlan } from './commands/plan.ts'
import { describeRequest, runRequest } from './commands/request.ts'
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
  check                     Type-check the app and validate it: the one command to run after every edit
  map                       Outline the app (routes, queries, mutations, events, states, views) with file:line
  get <path>...             Request pages in-process (no server): status, title, alerts, visible text
  post <path> --field k=v   Submit the page's form like a browser, follow the redirect (--next <path> after)
  add feature <name>        Scaffold a working feature (model, views, contracts, resolvers) and wire it in

Options:
  --json               Machine-readable output (schemas in @hozu/cli/schema)
  --config <path>      Config file (default: hozu.config.ts)
  --update-lock        validate: rewrite hozu.lock.json when there are no errors
  --out <dir>          build: output directory (default: dist)
  --agent <agent>      skill: claude, agents or both (default: the folders that exist)
  --field <name=value> post: a form field (repeatable); other fields keep their defaults
  --button <label>     post: the form whose submit button reads <label> (for forms without fields)
  --next <step>        post: next '<path>', 'GET <path>', 'POST <path> a=1&b=2' or 'POST <path> @Label' (repeatable)
  --session <json>     get/post: the session value for user-scoped queries
  --full               get/post: print the whole visible text
  --page <path>        add feature: also add a route and a page at this path
  --with <parts>       add feature: any of detail,toggle,filter,remove (comma-separated)
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
        field: { type: 'string', multiple: true },
        next: { type: 'string', multiple: true },
        session: { type: 'string' },
        full: { type: 'boolean', default: false },
        page: { type: 'string' },
        with: { type: 'string' },
        button: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    })
    asJson = values.json === true
    const [command, target] = positionals
    if (values.help || !command) {
      out(usage)
      return command || values.help ? 0 : 2
    }
    const commands = [
      'validate',
      'check',
      'map',
      'get',
      'post',
      'add',
      'inspect',
      'graph',
      'explain',
      'impact',
      'plan',
      'build',
      'skill',
    ]
    if (!commands.includes(command)) throw new HozuCliError('usage', `Unknown command "${command}"`, commands)
    if (command === 'skill') {
      const result = await runSkill(cwd, values.agent)
      out(asJson ? json(result) : `✔ wrote ${result.written.join(', ')}\n`)
      return 0
    }
    if (command === 'add') {
      if (target !== 'feature')
        throw new HozuCliError('usage', 'hozu add supports: feature', ['hozu add feature tasks --page /'])
      const result = await runAddFeature(cwd, values.config, positionals[2], values.page, values.with)
      out(asJson ? json(result) : describeAdd(result))
      return 0
    }
    const loaded = await load(values.config, cwd)
    if (command === 'check') {
      const result = await runCheck(loaded, cwd, values['update-lock'] === true)
      if (asJson) out(json(result))
      else {
        for (const e of result.types.errors) out(`${e.file}:${e.line}:${e.column}  ${e.code}  ${e.message}\n`)
        if (result.types.errors.length) out('\n')
        for (const d of result.validate.diagnostics) out(`${human(d)}\n\n`)
        const v = result.validate
        const types = result.types.skipped
          ? 'types skipped (npm install -D typescript)'
          : `types ${result.types.ok ? 'ok' : `${result.types.errors.length} errors`}`
        out(
          `${result.ok ? '✔' : '✖'} ${types} · ${v.summary.errors} errors, ${v.summary.warnings} warnings · contracts ${Object.values(v.coverage).reduce((n, c) => n + c.covered, 0)}/${Object.values(v.coverage).reduce((n, c) => n + c.total, 0)} · lock ${v.lock}\n`,
        )
      }
      return result.ok ? 0 : 1
    }
    if (command === 'map') {
      const result = runMap(loaded, cwd)
      out(asJson ? json(result) : describeMap(result))
      return 0
    }
    if (command === 'get' || command === 'post') {
      const result = await runRequest(loaded, {
        method: command === 'get' ? 'GET' : 'POST',
        paths: positionals.slice(1),
        fields: values.field ?? [],
        next: values.next ?? [],
        button: values.button,
        session: values.session,
        full: values.full === true,
      })
      out(asJson ? json(result) : describeRequest(result))
      return 0
    }
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
