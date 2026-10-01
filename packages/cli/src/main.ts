import { relative } from 'node:path'
import { parseArgs } from 'node:util'
import { describeAdd, runAddFeature } from './commands/add.ts'
import { describeAddWidget, runAddWidget } from './commands/add-widget.ts'
import { BuildFailed } from './commands/app.ts'
import {
  type BrowseJs,
  type BrowseOptions,
  browseFailed,
  describeBrowse,
  runBrowse,
} from './commands/browse.ts'
import { runBuild } from './commands/build.ts'
import { runCheck } from './commands/check.ts'
import { runDocs } from './commands/docs.ts'
import { describeExplain, runExplain } from './commands/explain.ts'
import { mermaid, runGraph } from './commands/graph.ts'
import { describeImpact, runImpact } from './commands/impact.ts'
import { runInspect } from './commands/inspect.ts'
import { describeMap, runMap } from './commands/map.ts'
import { describeMigrate, runMigrate } from './commands/migrate.ts'
import { describePlan, runPlan } from './commands/plan.ts'
import { describeRequest, runRequest } from './commands/request.ts'
import { runServe } from './commands/serve.ts'
import { runSkill } from './commands/skill.ts'
import { featuresCreated, runValidate, seedLockIsolated } from './commands/validate.ts'
import { HozuCliError } from './errors.ts'
import { load } from './load.ts'
import { human, json } from './output.ts'
import { describeOverrides } from './uses.ts'

const usage = `Usage: hozu <command> [options]

Commands:
  validate [feature]        Build the IR, run contracts, report diagnostics (exit 1 on errors)
  inspect <feature>         Print a feature's canonical IR and summary
  graph <feature>           Print a feature's state/effect/view graph (Mermaid, or --json)
  explain <feature>.<state> Explain a state: transitions, guards, effects, covering contracts
  impact <feature>.<symbol> What a query, mutation, tag, event, fn or view affects
  plan <route>              Derived render plan: regions, cache modes, hydration islands
  build                     Write dist/public, dist/server/render.js and dist/manifest.json for deployment
  serve                     Start the app module (project({ app })) on PORT with adapter-node: what npm start runs
  docs [topic]              Print one topic of the guide (no topic: list them)
  skill                     Rewrite the agent skill for this Hozu version (--agent claude|agents|both)
  check                     Type-check the app and validate it: the one command to run after every edit
  map                       Outline the app (routes, queries, mutations, events, states, views) with file:line
  get <path>...             Request pages in-process (no server): status, title, alerts, visible text, forms
  browse <path> --do <step> Run the steps in headless Chrome with and without JS (no server): what each step changed
  add feature <name>        Scaffold a working feature (model, views, contracts, resolvers) and wire it in
  add widget <feature> <Name>  Add a widget: declaration, client module, app.ts bundle, @hozu/bundle dependency
  migrate 0.8               Upgrade a 0.7 app: list the lock entries stale under 0.7, rewrite the source, then check

Options:
  --json               Machine-readable output (schemas in @hozu/cli/schema)
  --config <path>      Config file (default: hozu.config.ts)
  --update-lock        validate: rewrite hozu.lock.json when there are no errors
  --out <dir>          build: output directory (default: dist)
  --agent <agent>      skill: claude, agents or both (default: the folders that exist)
  --session <json>     get/browse: start signed in with this session (a real one: sign-out works); after --as, that actor's
  --full               get/browse: print the whole visible text and every changed line
  --select <selector>  get/browse: print matching elements with their attributes: button, #id, [role=alert], a[href]
  --forms              get: list the page's forms: fields with defaults, checkbox groups, form= controls, submit buttons
  --do <step>          browse: 'fill <label>=<value>', 'select <label>=<option>', 'check <label>', 'uncheck <label>',
                       'click <name>', 'submit "<form>"', 'press <key>', 'wait <ms>', 'goto <path>' (repeatable, in
                       order); a target may end with in "<text>" (the list item, table row or form containing it)
  --js <on|off|both>   browse: run the steps with JS, without JS, or both side by side (default both)
  --as <name>          browse: the steps after it are this actor's, in its own browser; repeat to switch actors
  --screenshot <file>  browse: save a PNG of the viewport after the steps
  --reduced-motion     browse: emulate prefers-reduced-motion: reduce
  --page <path>        add feature: also add a route and a page at this path
  --with <parts>       add feature: any of detail,toggle,filter,remove (comma-separated)
  -h, --help           Show this help
`

const browseJs = (value: string | undefined): BrowseJs => {
  if (value === undefined) return 'both'
  if (value === 'on' || value === 'off' || value === 'both') return value
  throw new HozuCliError('usage', `--js takes on, off or both, not "${value}"`, ['--js both'])
}

type Token = { kind: string; name?: string; value?: string | undefined }

export function browsePlan(tokens: Token[]): Pick<BrowseOptions, 'actors' | 'plan'> {
  const actors: BrowseOptions['actors'] = []
  const plan: BrowseOptions['plan'] = []
  const named = tokens.some((t) => t.kind === 'option' && t.name === 'as')
  if (!named) {
    const session = tokens.filter((t) => t.kind === 'option' && t.name === 'session').at(-1)?.value
    actors.push({ name: null, session })
    plan.push({ open: 0 })
  }
  let current = named ? -1 : 0
  for (const t of tokens) {
    if (t.kind !== 'option') continue
    if (t.name === 'as') {
      const name = t.value ?? ''
      current = actors.findIndex((a) => a.name === name)
      if (current < 0) {
        current = actors.push({ name, session: undefined }) - 1
        plan.push({ open: current })
      }
    } else if (named && (t.name === 'do' || t.name === 'session') && current < 0)
      throw new HozuCliError('usage', `--${t.name} comes after the --as <name> it belongs to`, [
        "hozu browse / --as ada --session '{\"user\":\"ada\"}' --do 'click Share' --as bob --do 'wait 500'",
      ])
    else if (t.name === 'session' && named) {
      const actor = actors[current]!
      if (actor.session !== undefined || plan.some((p) => 'actor' in p && p.actor === current))
        throw new HozuCliError(
          'usage',
          `--session for ${actor.name} must come right after its first --as`,
          [],
        )
      actor.session = t.value
    } else if (t.name === 'do') plan.push({ actor: current, step: t.value ?? '' })
  }
  return { actors, plan }
}

export async function main(
  argv: string[],
  cwd = process.cwd(),
  out: (s: string) => void = (s) => process.stdout.write(s),
): Promise<number> {
  let asJson = false
  try {
    const { values, positionals, tokens } = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      tokens: true,
      options: {
        json: { type: 'boolean', default: false },
        config: { type: 'string' },
        'update-lock': { type: 'boolean', default: false },
        out: { type: 'string' },
        agent: { type: 'string' },
        session: { type: 'string' },
        full: { type: 'boolean', default: false },
        page: { type: 'string' },
        with: { type: 'string' },
        select: { type: 'string', multiple: true },
        forms: { type: 'boolean', default: false },
        do: { type: 'string', multiple: true },
        as: { type: 'string', multiple: true },
        js: { type: 'string' },
        screenshot: { type: 'string' },
        'reduced-motion': { type: 'boolean', default: false },
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
      'docs',
      'validate',
      'check',
      'map',
      'get',
      'browse',
      'add',
      'inspect',
      'graph',
      'explain',
      'impact',
      'plan',
      'build',
      'serve',
      'skill',
      'migrate',
    ]
    if (command === 'post')
      throw new HozuCliError(
        'usage',
        'hozu post was replaced by hozu browse, which posts forms with JS off too',
        [
          "hozu browse / --do 'fill Title=Milk' --do 'press Enter'   # runs with and without JS",
          'hozu browse / --js off --do \'click Delete in "Milk"\'',
        ],
      )
    if (!commands.includes(command)) throw new HozuCliError('usage', `Unknown command "${command}"`, commands)
    if (command === 'docs') {
      const result = await runDocs(cwd, target)
      out(asJson ? json(result) : result.text)
      return 0
    }
    if (command === 'skill') {
      const result = await runSkill(cwd, values.agent)
      if (asJson) out(json(result))
      else {
        out(`✔ wrote ${result.written.join(', ')}\n`)
        for (const c of result.custom)
          out(
            `\n✖ ${c.guide} has its own text and no hozu markers. Replace its Hozu instructions with this block:\n\n${c.block}`,
          )
      }
      return result.custom.length ? 1 : 0
    }
    if (command === 'migrate') {
      const result = await runMigrate(cwd, values.config, target)
      out(asJson ? json(result) : describeMigrate(result))
      return result.ok ? 0 : 1
    }
    if (command === 'add') {
      if (target === 'widget') {
        const result = await runAddWidget(cwd, values.config, positionals[2], positionals[3])
        out(asJson ? json(result) : describeAddWidget(result, positionals[3]!))
        return 0
      }
      if (target !== 'feature')
        throw new HozuCliError('usage', 'hozu add supports: feature, widget', [
          'hozu add feature tasks --page /',
          'hozu add widget tasks Chart',
        ])
      const result = await runAddFeature(cwd, values.config, positionals[2], values.page, values.with)
      const lock = await seedLockIsolated(values.config, cwd, featuresCreated(result.created))
      if (lock) (lock.created ? result.created : result.edited).push(relative(cwd, lock.path))
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
        for (const o of result.overrides) out(`${describeOverrides(o)}\n`)
        if (result.overrides.length) out('\n')
        const v = result.validate
        const types = result.types.skipped
          ? 'types skipped (npm install -D typescript)'
          : `types ${result.types.ok ? 'ok' : `${result.types.errors.length} errors`}`
        out(
          `${result.ok ? '✔' : '✖'} ${types} · ${v.summary.errors} errors, ${v.summary.warnings} warnings · contracts ${Object.values(v.coverage).reduce((n, c) => n + c.covered, 0)}/${Object.values(v.coverage).reduce((n, c) => n + c.total, 0)} decisions · lock ${v.lock}\n`,
        )
      }
      return result.ok ? 0 : 1
    }
    if (command === 'serve') {
      await runServe(loaded, (line) => out(`${line}\n`))
      return 0
    }
    if (command === 'map') {
      const result = runMap(loaded, cwd)
      out(asJson ? json(result) : describeMap(result))
      return 0
    }
    if (command === 'get') {
      const result = await runRequest(loaded, {
        paths: positionals.slice(1),
        select: values.select ?? [],
        forms: values.forms === true,
        session: values.session,
        full: values.full === true,
      })
      out(asJson ? json(result) : describeRequest(result))
      return 0
    }
    if (command === 'browse') {
      const result = await runBrowse(loaded, {
        path: target,
        ...browsePlan(tokens),
        js: browseJs(values.js),
        select: values.select ?? [],
        screenshot: values.screenshot,
        reducedMotion: values['reduced-motion'] === true,
        full: values.full === true,
      })
      out(asJson ? json(result) : describeBrowse(result, values.full === true))
      return browseFailed(result) ? 1 : 0
    }
    if (command === 'validate') {
      const result = await runValidate(loaded, target, cwd, values['update-lock'] === true)
      if (asJson) out(json(result))
      else {
        for (const d of result.diagnostics) out(`${human(d)}\n\n`)
        const coverage = Object.entries(result.coverage)
          .map(([f, c]) => `${f} ${c.covered}/${c.total} decisions (${c.transitions} transitions)`)
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
    return e instanceof BuildFailed ? 1 : 2
  }
}
