<p align="center"><img src="docs/assets/logo.png" alt="Hozu logo" width="140"></p>

<h1 align="center">Hozu</h1>

*Hozu (ほぞ) is the Japanese word for a tenon: the part of a joint that fits exactly into its mortise.*

**An AI-first web framework.** Invalid programs are hard to express, and valid programs are cheap to verify, so a
coding agent can build and change an app with checks instead of guesses.

[![npm](https://img.shields.io/npm/v/@hozu/core?label=%40hozu%2Fcore)](https://www.npmjs.com/package/@hozu/core)
[![create-hozu](https://img.shields.io/npm/v/create-hozu?label=create-hozu)](https://www.npmjs.com/package/create-hozu)
[![downloads](https://img.shields.io/npm/dm/create-hozu?label=downloads)](https://www.npmjs.com/package/create-hozu)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

[Website](https://hozu.org) · [Docs](https://hozu.org/docs/getting-started/) ·
[DevTools](https://hozu.org/devtools/) · [Trials](https://hozu.org/trials/) · [Changelog](CHANGELOG.md)

```sh
npm create hozu@latest my-app
```

## What makes it different
- **The app is data.** Typed builders record an intermediate representation (IR). A validator checks the IR,
  a compiler derives how each part renders, and a runtime serves it.
- **Ordinary TypeScript.** Views and machines are written with `===`, `? :`, `&&`, template strings and plain
  assignments; `@hozu/transform` lowers them to the checked data form, so the rules stay out of your way.
- **Every diagnostic is structured:** JSON with a location, a cause and a suggested fix, which an agent can apply
  directly.
- **Behaviour is specified.** Each feature has one state machine. Every transition that decides something (a guard,
  a navigation, a computed value) is covered by a contract (given / when / expect); the lock file records every
  transition in readable form, so no behaviour change goes unreviewed.
- **Rendering is derived, never chosen.** Queries declare `scope` and `freshness`; the compiler decides static, ISR,
  SWR, streamed or client rendering per node. User data can never reach a cacheable region. Only views bound to a
  machine ship JavaScript.
- **Where data runs is declared, too.** A query or mutation says what its implementation needs: `runs: 'server'`
  for a database or a secret, `'browser'` for the visitor's own token, or `'either'` for an API the browser may
  call; there is no default. `'either'` renders on the server first and calls the API from the browser afterwards, without
  a second hop through your server; a front end with no server of its own exports to a static host.
- **Closed world.**
  - Views are typed element trees, not functions: every HTML attribute and DOM event is typed, and Tailwind
    classes are checked.
  - Side effects happen only through declared queries and mutations.
  - Links are typed route values.

## Quick start
```sh
npm create hozu@latest my-app      # or: pnpm create hozu my-app
cd my-app
npm install
npm run dev                          # http://localhost:3000, with Hozu DevTools
```

New to the terminal? [Getting started](https://hozu.org/docs/getting-started/) has a prompt to paste into your
agent: it checks Node, creates the app, reads the skill and builds your first page.

**Hozu DevTools** comes with `npm run dev`: choose Select in the dock, click what should change and describe it.
The request you copy or save names the file, line and the Hozu way to make the change; it can preview other
states, styles and wording first, in an exact-size Workbench too. Give it to your agent, or tell the agent
"do the open Hozu requests" (`npx hozu requests --full`). Its **API** drawer runs the page's queries, mutations
and endpoints with your own input, so you can test the API while you build it.

`create-hozu` asks which coding agent will work on the app. To skip the question, pass `--agent`:

| `--agent` | Writes | For |
|---|---|---|
| `claude` | `CLAUDE.md` + `.claude/skills/hozu/` | Claude Code (loads it as the `hozu` skill) |
| `agents` | `AGENTS.md` + `.agents/skills/hozu/` | Codex, Cursor, Copilot and other agents that read `AGENTS.md` |
| `both` | both | teams that use several agents |

The skill is the whole authoring reference, with a verified example app. It is versioned with the framework.
To upgrade an app (from 0.10.0 on), run `npx -p @hozu/cli@latest hozu migrate`, then the `next:` lines it prints:
it rewrites the source, raises `@hozu/*`, checks the IR did not change and refreshes the skill.

The one check an agent runs after every change:
```sh
npx hozu check             # types, every rule and every contract; --json for agents
```

## A feature, end to end
```ts
// features/todos/model.ts
const Todo = z.object({ id: z.string(), title: z.string() })
export const Add = event({ payload: z.object({ title: z.string() }) })
export const todosTag = tag({ param: null })
export const listTodos = query({
  input: z.object({}), output: z.array(Todo),
  scope: 'public', freshness: 'static', tags: () => [todosTag()], runs: 'server',
})
export const addTodo = mutation({
  input: z.object({ title: z.string().min(2) }), output: Todo,
  invalidates: () => [todosTag()], runs: 'server',
})
export const todos = machine({
  context: z.object({ draft: z.string(), error: z.string().nullable() }),
  initialContext: { draft: '', error: null },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: { on: [on(Add, { target: 'adding', assign: (e) => { ctx.draft = e.title; ctx.error = null } })] },
    adding: {
      invoke: invoke(addTodo, {
        input: { title: ctx.draft },
        done: { target: 'idle', assign: () => { ctx.draft = '' } },
        failed: { Unexpected: { target: 'idle', assign: (e) => { ctx.error = e.message } } },
      }),
    },
  }),
})

// features/todos/views.ts
export const Board = ui.view({
  machine: todos,
  render: ({ ctx }) =>
    ui.main({ class: 'mx-auto max-w-xl' }, [
      ui.form({ on: { submit: ui.send(Add, { title: ui.dom.form('title') }) } }, [
        ui.input({ name: 'title', required: true, value: ctx.draft }),
        ui.button({ type: 'submit' }, ['Add']),
      ]),
      ctx.error !== null && ui.p({ role: 'alert' }, [ctx.error]),
      ui.query(listTodos, {}, {
        ready: (items) => ui.ul({}, [ui.each(items, 'id', (t) => ui.li({}, [t.title]))]),
        failed: { Unexpected: () => ui.p({ role: 'alert' }, ['Unavailable']) },
      }),
    ]),
})
```
- **A second Add while saving is dropped:** a state with `invoke` ignores the events it does not handle.
- **No contract is needed here,** because every transition only copies values; `hozu.lock.json` lists them
  (`idle --Add--> adding · draft := event.title · invoke addTodo({ title: ctx.draft })`), and a change shows up
  as a diff to accept. A guard or a navigation would need a contract.
- **Both run on the server** (`runs: 'server'`): the resolvers in `app.ts` hold the list.
- **The form works without JavaScript too:** the server runs the same machine for a native post.
- **The list refreshes in place after the mutation,** because the mutation invalidates the query's tag.
- **Only the parts bound to the machine or to that refresh ship JavaScript.** The rest of the page is plain HTML.

## Measured
**Same model and same task, Hozu against Nuxt:** a notes app with accounts, built from a spec, then changed. Each app
was checked by a hidden acceptance test covering per-user isolation, double submit, forms without JavaScript,
`HttpOnly` sessions, and a regression pass after the change ([trial 0016](docs/trials/0016-0-5-four-runs.md),
[trial 0012](docs/trials/0012-correctness-notes.md)). Measured on 0.5; every later trial is on
[hozu.org/trials](https://hozu.org/trials/).

| | Hozu 0.5 | Nuxt |
|---|---|---|
| Checks passed (build, change, regression) | 180/180 over 5 runs, including one by Codex | 67/72 over 2 runs; one change silently broke three features |
| Agent cost to build the app | 1.38× | 1× |
| Agent cost to change it | 1.45× | 1× |

On a longer run (sixteen sequential changes to the same app, eight of them held out), 0.8 measured 1.34–1.72× Nuxt per
change, depending on how one Nuxt step is counted ([trial 0021](docs/trials/0021-0-8-long-run.md)).

**Why the comparison is with Nuxt:**
- **Nuxt is the model's home ground.** It is in every model's training data, and models write it well. Hozu is not:
  each session learns it from the guide ([trial 0020](docs/trials/0020-long-run.md)).
- **Only the framework differs:** the same model, the same spec and the same hidden acceptance.
- **Most of the extra cost is that learning** ([ADR 0038](docs/adr/0038-cost-anatomy.md)). It is expected to shrink
  as the guide gets shorter (0.14 halves what `hozu docs` prints) and once models know Hozu. The correctness gap
  comes from structure, so it is not expected to shrink.

**Rendering, against React, Vue, Preact and Svelte:** the same 100-item page, 4× CPU throttling
([benchmarks](docs/benchmarks/0001-frameworks.md), sixth run).

| | Hozu | Best of the others |
|---|---|---|
| Initial JS (gzip) | 7.5 KB | Preact 5.4 KB |
| Interactive at | 27.8 ms | Preact 26.7 ms |
| 200 clicks | 10.6 ms | Svelte 8.7 ms |
| Server renders per second | 52.6 k | Svelte 94.2 k |
| HTML | 12.1 KB | 12.6 KB |

**At scale:** generated apps of 50 and 500 features, each with a machine, a contract, queries, mutations and a
100-row list ([benchmark 0003](docs/benchmarks/0003-scale.md), 0.12).

| | 50 features | 500 features |
|---|---|---|
| `hozu check` after a one-line edit | 0.41 s | 1.91 s |
| A page's payload | 11.1 KB | 11.1 KB |
| `fn` code that page loads | 237 B | 237 B |

The data cache keeps at most 10,000 entries by default: one million distinct keys hold 5.3 MB, not 702 MB.

## Packages
| Package | What it is |
|---|---|
| [`create-hozu`](https://www.npmjs.com/package/create-hozu) | Creates an app, set up for Claude Code or `AGENTS.md` agents |
| [`@hozu/core`](https://www.npmjs.com/package/@hozu/core) | IR types and the builders you write apps with |
| [`@hozu/cli`](https://www.npmjs.com/package/@hozu/cli) | `hozu check`, `get`, `browse`, `map`, `add`, `requests`, `why`, `plan`, `build`, `dev`, `serve`, `docs`, `skill` (all `--json`) |
| [`@hozu/transform`](https://www.npmjs.com/package/@hozu/transform) | Lowers the ordinary TypeScript in views and machines to the checked IR form |
| [`@hozu/schema-zod`](https://www.npmjs.com/package/@hozu/schema-zod) | Zod schemas (the default adapter) |
| [`@hozu/data`](https://www.npmjs.com/package/@hozu/data) | Resolvers, cache, tags, invalidation |
| [`@hozu/adapter-node`](https://www.npmjs.com/package/@hozu/adapter-node) | Node server with an ISR page cache |
| [`@hozu/adapter-static`](https://www.npmjs.com/package/@hozu/adapter-static) | Static export |
| [`@hozu/runtime-server`](https://www.npmjs.com/package/@hozu/runtime-server) | Streaming SSR and a web-standard `Request → Response` handler (Bun, Deno, Workers, Vercel) |
| [`@hozu/runtime-client`](https://www.npmjs.com/package/@hozu/runtime-client) | The DOM runtime for islands |
| [`@hozu/css`](https://www.npmjs.com/package/@hozu/css) | Tailwind CSS v4, compiled from the classes the IR declares |
| [`@hozu/validator`](https://www.npmjs.com/package/@hozu/validator) · [`@hozu/compiler`](https://www.npmjs.com/package/@hozu/compiler) · [`@hozu/machine`](https://www.npmjs.com/package/@hozu/machine) | Used by the packages above |
| [`@hozu/content`](https://www.npmjs.com/package/@hozu/content) | Markdown collections with typed front matter |
| [`@hozu/image`](https://www.npmjs.com/package/@hozu/image) | Optional WebP `srcset` and share-image cards (uses sharp) |
| [`@hozu/testing`](https://www.npmjs.com/package/@hozu/testing) | Render assertions through the real handler |
| [`@hozu/dev`](https://www.npmjs.com/package/@hozu/dev) · [`@hozu/devtools`](https://www.npmjs.com/package/@hozu/devtools) | Development server; Hozu DevTools (select, preview, request) |
| [`@hozu/bundle`](https://www.npmjs.com/package/@hozu/bundle) | Client component bundling |
| [`@hozu/variants`](https://www.npmjs.com/package/@hozu/variants) | tailwind-variants for component styles, run at build time (0 B in the browser) |

## Also included
- Document navigation with prerender and cross-document view transitions.
- Typed search parameters, and forms that work without JavaScript.
- Field errors, and a pattern for optimistic updates.
- i18n with typed messages.
- Sessions, CSP and cross-site POST protection.
- ISR and SWR with tag revalidation, and live queries.
- A derived head: title, canonical, Open Graph, JSON-LD, sitemap and `robots.txt`.
- Preview mode, PWA and an offline page.
- Components in kits, with variants and owned classes; client components wrap third-party DOM libraries.
- Queries and mutations that call an API from the browser (`runs`, a feature's `fetch.ts`), checked against their
  schemas there too; `examples/stars` is a GitHub client exported to a static directory.
- Bounded LRU caches, and an invalidation bus so several instances drop the same pages and push to their own live
  clients (`httpBus` built in, or a few lines against Redis or NATS).
- `hozu call` runs one query or mutation without a page. Under `npm run dev`, the DevTools API drawer runs the
  page's queries, mutations and endpoints with your own input and headers, shows the requests each call really sent
  (copy as curl), and can act as any session user.
- Environment declared once (`project({ env: { files, server, public, internal } })`): `hozu env` lists what is set,
  secrets stay on the server, and the server can call an API at its internal URL while the browser uses the public
  one. The origins browser code calls are declared (`feature({ connect })`) and go into the CSP.

The capability comparison with Next.js, Nuxt, SvelteKit, Astro and React Router is in
[ADR 0011](docs/adr/0011-mainstream-gap-analysis.md).

## Requirements and status
- **Node 22.18 or newer.** Config and app code are TypeScript run with Node's type stripping.
- **Version 0.13.0.** The API may change before 1.0, which follows a feedback round with engineers, non-engineers
  and designers and the trial that checks DevTools requests. Every design decision is recorded in
  [`docs/adr`](docs/adr).

## Developing Hozu
```sh
pnpm install
pnpm gate            # lint, typecheck, tests and performance budgets
```
Pull requests are welcome: read [`CONTRIBUTING.md`](CONTRIBUTING.md) first; security reports go through
[`SECURITY.md`](SECURITY.md). Guides for agents working on this repository: [`CLAUDE.md`](CLAUDE.md) and [`AGENTS.md`](AGENTS.md).

## License
[MIT](LICENSE) © olevatorr.
