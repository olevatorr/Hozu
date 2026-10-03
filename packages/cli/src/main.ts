import { existsSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { describeAdd, runAddFeature } from './commands/add.ts'
import { describeAddComponent, runAddComponent } from './commands/add-component.ts'
import { BuildFailed } from './commands/app.ts'
import {
  type BrowseJs,
  type BrowseOptions,
  browseFailed,
  describeBrowse,
  runBrowse,
} from './commands/browse.ts'
import { runBuild } from './commands/build.ts'
import { describeCall, runCall } from './commands/call.ts'
import { runCheck, startTypes } from './commands/check.ts'
import { describeComponent, describeComponentImpact } from './commands/components.ts'
import { runDev } from './commands/dev.ts'
import { runDocs } from './commands/docs.ts'
import { describeEnv, runEnv } from './commands/env.ts'
import { describeExplain, runExplain } from './commands/explain.ts'
import { describeImpact, runImpact } from './commands/impact.ts'
import { runInspect } from './commands/inspect.ts'
import { describeAddKit, runAddKit } from './commands/kits.ts'
import { describeLocate, runLocate } from './commands/locate.ts'
import { describeMap, runMap } from './commands/map.ts'
import { describeMigrate, runMigrate } from './commands/migrate.ts'
import { describePlan, runPlan } from './commands/plan.ts'
import { describeRender, runRender } from './commands/render.ts'
import { describeRequest, runRequest } from './commands/request.ts'
import { describeRequests, runRequests } from './commands/requests.ts'
import { runServe } from './commands/serve.ts'
import { runSkill } from './commands/skill.ts'
import { featuresCreated, seedLockIsolated } from './commands/validate.ts'
import { deprecated, describeWhy, runWhy } from './commands/why.ts'
import { HozuCliError } from './errors.ts'
import { load } from './load.ts'
import { human, json } from './output.ts'
import { describeOverrides } from './uses.ts'

const usage = `Usage: hozu <command> [options]

Commands:
  inspect <feature|id>      Print a feature's canonical IR and summary, or a component (ui.Button) with its uses
  why <target>              What it is, where (file:line), what uses it and what it affects: a declaration
                            (cart.addItem), a component (ui.Button), a state (cart.idle) with its transitions
                            and contracts, a view node (DevTools id or IR pointer) or a page (page:home)
  explain | locate | impact Deprecated: hozu why answers each (removed in 0.15)
  plan <route>              Derived render plan: regions, cache modes, hydration islands
  build                     Write dist/public, dist/server/render.js and dist/manifest.json for deployment
  serve                     Start the app module (project({ app })) on PORT with adapter-node: what npm start runs
  dev                       Start the dev server: reload on edits, hot CSS and Hozu DevTools
                            (--devtools builder|developer picks its mode, --no-devtools hides it)
  requests [done <n>]       The change requests saved from DevTools (--full: all open ones as one prompt);
                            done <n> --result "<what changed>" removes one
  docs [topic] [--more]     Print one topic of the guide, its short form (--more: options and edge cases too);
                            no topic lists them; docs HZ083 prints one diagnostic; docs components adds the app's list
  migrate [--dry-run]       Upgrade the app from Hozu 0.10 or later: rewrite, raise the dependencies, then (run
                            again after installing) compare the IR and check; never writes the lock
  render <id>               Render one component alone (ui.Button): HTML, root class, owned properties, diagnostics
  skill                     Rewrite the agent skill for this Hozu version (--agent claude|agents|both)
  check [--no-types]        Type-check the app and validate it: the one command to run after every edit
                            (--no-types: rules and contracts only)
  map                       Outline the app (routes, queries, mutations, events, states, views) with file:line
  get <path>...             Request pages in-process (no server): status, title, alerts, visible text, forms
  env [--example]           Every env variable the app reads: side, required, default, set now, internal URL;
                            --example writes .env.example
  call <feature>.<effect>   Run one query or mutation in-process (no server) through the app's own handler:
                            --input '<json>', --session '<json>'; a mutation writes real data and needs --write
  browse <path> --do <step> Run the steps in headless Chrome with and without JS (no server): what each step changed
  add feature <name>        Scaffold a working feature (model, views, contracts, resolvers) and wire it in
  add component <kit|feature> <Name> [--client]
                            Add a component to a kit or a feature; --client adds the client module, the app.ts
                            bundle and the @hozu/bundle dependency
  add kit <id> [--sync]     Add a component kit: <id>/kit.ts, <id>/tv.ts (tailwind-merge config from the design
                            system) and project({ kits }); --sync regenerates only the config block

Options:
  --json               Machine-readable output (schemas in @hozu/cli/schema)
  --config <path>      Config file (default: hozu.config.ts)
  --update-lock        check: rewrite hozu.lock.json when there are no errors
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
  --with <parts>       add feature: any of detail,toggle,filter,remove,auth (comma-separated)
  --sync               add kit: rewrite the generated block of <id>/tv.ts from the current design system
  --client             add component: a client component (browser code in its own module)
  --variant <k=v>      render: a variant value (repeatable)
  --props <json>       render: the props, a JSON object
  --slot <name=text>   render: a slot's text (repeatable)
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
        'no-types': { type: 'boolean', default: false },
        more: { type: 'boolean', default: false },
        out: { type: 'string' },
        agent: { type: 'string' },
        session: { type: 'string' },
        input: { type: 'string' },
        write: { type: 'boolean', default: false },
        example: { type: 'boolean', default: false },
        full: { type: 'boolean', default: false },
        page: { type: 'string' },
        with: { type: 'string' },
        sync: { type: 'boolean', default: false },
        client: { type: 'boolean', default: false },
        variant: { type: 'string', multiple: true },
        props: { type: 'string' },
        slot: { type: 'string', multiple: true },
        select: { type: 'string', multiple: true },
        forms: { type: 'boolean', default: false },
        do: { type: 'string', multiple: true },
        as: { type: 'string', multiple: true },
        js: { type: 'string' },
        screenshot: { type: 'string' },
        'reduced-motion': { type: 'boolean', default: false },
        result: { type: 'string' },
        'no-devtools': { type: 'boolean', default: false },
        devtools: { type: 'string' },
        'dry-run': { type: 'boolean', default: false },
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
      'check',
      'map',
      'get',
      'call',
      'env',
      'browse',
      'add',
      'inspect',
      'why',
      'explain',
      'locate',
      'impact',
      'plan',
      'render',
      'build',
      'serve',
      'dev',
      'requests',
      'skill',
    ]
    if (command === 'validate')
      throw new HozuCliError('usage', 'hozu validate was replaced by hozu check (ADR 0053 B)', [
        'hozu check   # types, rules and contracts',
        'hozu check --no-types   # rules and contracts only',
      ])
    if (command === 'graph')
      throw new HozuCliError('usage', 'hozu graph was removed in 0.14 (ADR 0053 F)', [
        'hozu why <feature>.<state>   # a state, its transitions and contracts',
        'hozu inspect <feature> --json   # the whole IR',
      ])
    if (command === 'post')
      throw new HozuCliError(
        'usage',
        'hozu post was replaced by hozu browse, which posts forms with JS off too',
        [
          "hozu browse / --do 'fill Title=Milk' --do 'press Enter'   # runs with and without JS",
          'hozu browse / --js off --do \'click Delete in "Milk"\'',
        ],
      )
    if (command === 'migrate') {
      const result = await runMigrate(cwd, { config: values.config, dryRun: values['dry-run'] === true })
      out(asJson ? json(result) : describeMigrate(result))
      return result.ok ? 0 : 1
    }
    if (!commands.includes(command)) throw new HozuCliError('usage', `Unknown command "${command}"`, commands)
    if (command === 'docs') {
      const result = await runDocs(cwd, target, values.config, values.more === true)
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
    if (command === 'add') {
      if (target === 'widget')
        throw new HozuCliError(
          'usage',
          'hozu add widget was replaced by hozu add component --client: widgets are client components in 0.9',
          [`hozu add component ${positionals[2] ?? 'stations'} ${positionals[3] ?? 'StationMap'} --client`],
        )
      if (target === 'component') {
        const client = values.client === true
        const result = await runAddComponent(cwd, values.config, positionals[2], positionals[3], client)
        out(asJson ? json(result) : describeAddComponent(result, positionals[3]!, client))
        return 0
      }
      if (target === 'kit') {
        const sync = values.sync === true
        const result = await runAddKit(values.config, cwd, positionals[2], sync)
        out(asJson ? json(result) : describeAddKit(result, positionals[2]!, sync))
        return 0
      }
      if (target !== 'feature')
        throw new HozuCliError('usage', 'hozu add supports: feature, component, kit', [
          'hozu add feature tasks --page /',
          'hozu add component tasks Chart --client',
          'hozu add kit ui',
        ])
      const result = await runAddFeature(cwd, values.config, positionals[2], values.page, values.with)
      const lock = await seedLockIsolated(values.config, cwd, featuresCreated(result.created))
      if (lock) (lock.created ? result.created : result.edited).push(relative(cwd, lock.path))
      out(asJson ? json(result) : describeAdd(result))
      return 0
    }
    if (command === 'requests') {
      const result = runRequests(cwd, target, positionals[2], values.result, values.full === true)
      out(asJson ? json(result) : describeRequests(result))
      return 0
    }
    const configPath = resolve(cwd, values.config ?? 'hozu.config.ts')
    const typeRun =
      command !== 'check' || !existsSync(configPath)
        ? undefined
        : values['no-types'] === true
          ? Promise.resolve({ types: { ok: true, skipped: true, errors: [] }, ms: 0 })
          : startTypes(configPath)
    const loading = performance.now()
    const loaded = await load(values.config, cwd)
    const loadMs = performance.now() - loading
    if (command === 'dev') {
      await runDev(loaded, values['no-devtools'] === true ? false : (values.devtools ?? 'builder'), (line) =>
        out(`${line}\n`),
      )
      return 0
    }
    if (command === 'check') {
      const result = await runCheck(loaded, cwd, values['update-lock'] === true, typeRun, loadMs)
      if (asJson) out(json(result))
      else {
        for (const e of result.types.errors) out(`${e.file}:${e.line}:${e.column}  ${e.code}  ${e.message}\n`)
        if (result.types.errors.length) out('\n')
        for (const d of result.validate.diagnostics) out(`${human(d)}\n\n`)
        for (const a of result.validate.accepted) out(`accepted ${a.code} at ${a.at}: ${a.reason}\n`)
        for (const o of result.overrides) out(`${describeOverrides(o)}\n`)
        if (result.overrides.length) out('\n')
        const v = result.validate
        const types = result.types.skipped
          ? values['no-types'] === true
            ? 'types not checked (--no-types)'
            : 'types skipped (npm install -D typescript)'
          : `types ${result.types.ok ? 'ok' : `${result.types.errors.length} errors`}`
        out(
          `${result.ok ? '✔' : '✖'} ${types} · ${v.summary.errors} errors, ${v.summary.warnings} warnings${v.summary.accepted ? ` (${v.summary.accepted} accepted)` : ''} · contracts ${Object.values(v.coverage).reduce((n, c) => n + c.covered, 0)}/${Object.values(v.coverage).reduce((n, c) => n + c.total, 0)} decisions · lock ${v.lock}\n`,
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
    if (command === 'env') {
      const result = runEnv(loaded, values.example === true)
      out(asJson ? json(result) : describeEnv(result))
      return 0
    }
    if (command === 'call') {
      const result = await runCall(loaded, {
        target,
        input: values.input,
        session: values.session,
        write: values.write === true,
      })
      out(asJson ? json(result) : describeCall(result))
      return result.result.ok ? 0 : 1
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
    if (command === 'inspect') {
      const result = runInspect(loaded, target, cwd)
      if (asJson) out(json(result))
      else if ('component' in result) out(describeComponent(loaded.build(true), cwd, result))
      else out(json({ feature: result.feature, hash: result.hash, summary: result.summary }))
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
    if (command === 'why') {
      const result = runWhy(loaded, target, cwd)
      out(asJson ? json(result) : describeWhy(result))
      return 0
    }
    if (command === 'impact' || command === 'locate' || command === 'explain')
      process.stderr.write(deprecated(command, target))
    if (command === 'impact') {
      const result = runImpact(loaded, target, cwd)
      out(
        asJson
          ? json(result)
          : result.kind === 'component'
            ? describeComponentImpact(result)
            : describeImpact(result),
      )
      return 0
    }
    if (command === 'render') {
      const result = await runRender(loaded, cwd, target, {
        variant: values.variant ?? [],
        props: values.props,
        slot: values.slot ?? [],
      })
      out(asJson ? json(result) : describeRender(result))
      return result.ok ? 0 : 1
    }
    if (command === 'locate') {
      const result = runLocate(loaded, target)
      out(asJson ? json(result) : describeLocate(result))
      return 0
    }
    if (command === 'explain') {
      const result = runExplain(loaded, target)
      out(asJson ? json(result) : describeExplain(result))
      return 0
    }
    return 2
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
