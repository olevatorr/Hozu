# Tenon

**An AI-first web framework.** Invalid programs are hard to express, and valid programs are cheap to verify, so a
coding agent can build and change an app with checks instead of guesses.

[![npm](https://img.shields.io/npm/v/@tenonkit/core?label=%40tenonkit%2Fcore)](https://www.npmjs.com/package/@tenonkit/core)
[![create-tenon](https://img.shields.io/npm/v/create-tenon?label=create-tenon)](https://www.npmjs.com/package/create-tenon)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

```sh
npm create tenon@latest my-app
```

## What makes it different
- **The app is data.** Typed builders record an intermediate representation (IR). A validator checks the IR,
  a compiler derives how each part renders, and a runtime serves it.
- **Every diagnostic is structured:** JSON with a location, a cause and a suggested fix, which an agent can apply
  directly.
- **Behaviour is specified.** Each feature has one state machine, and every transition is covered by a contract
  (given / when / expect). A behaviour change without a contract change is an error, and a lock file catches
  silent drift.
- **Rendering is derived, never chosen.** Queries declare `scope` and `freshness`; the compiler decides static, ISR,
  SWR, streamed or client rendering per node. User data can never reach a cacheable region. Only views bound to a
  machine ship JavaScript.
- **Closed world.**
  - Views are typed element trees, not functions: every HTML attribute and DOM event is typed, and Tailwind
    classes are checked.
  - Side effects happen only through declared queries and mutations.
  - Links are typed route values.

## Quick start
```sh
npm create tenon@latest my-app      # or: pnpm create tenon my-app
cd my-app
npm install
npm start                            # http://localhost:3000
```

`create-tenon` asks which coding agent will work on the app. To skip the question, pass `--agent`:

| `--agent` | Writes | For |
|---|---|---|
| `claude` | `CLAUDE.md` + `.claude/skills/tenon/` | Claude Code (loads it as the `tenon` skill) |
| `agents` | `AGENTS.md` + `.agents/skills/tenon/` | Codex, Cursor, Copilot and other agents that read `AGENTS.md` |
| `both` | both | teams that use several agents |

The skill is the whole authoring reference, with a verified example app. It is versioned with the framework:
after upgrading, `npx tenon skill` rewrites it for the installed version.

Checks, which an agent runs after every change:
```sh
npx tsc --noEmit -p .
npx tenon validate          # every rule and every contract; --json for agents
```

## A feature, end to end
```ts
// features/todos/model.ts
const Todo = z.object({ id: z.string(), title: z.string() })
export const Add = event({ payload: z.object({ title: z.string() }) })
export const todosTag = tag({ param: null })
export const listTodos = query({
  input: z.object({}), output: z.array(Todo),
  scope: 'public', freshness: 'static', tags: () => [todosTag()],
})
export const addTodo = mutation({
  input: z.object({ title: z.string().min(2) }), output: Todo,
  invalidates: () => [todosTag()],
})
export const todos = machine({
  context: z.object({ draft: z.string() }),
  initialContext: { draft: '' },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: { on: [on(Add, { target: 'adding', assign: (e) => [op.set(ctx.draft, e.title)] })] },
    adding: {
      ignore: [Add],
      invoke: invoke(addTodo, {
        input: { title: ctx.draft },
        done: [{ target: 'idle', assign: () => [op.set(ctx.draft, '')] }],
        failed: { Unexpected: [{ target: 'idle' }] },
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
      ui.query(listTodos, {}, {
        ready: (items) => ui.ul({}, [ui.each(items, 'id', (t) => ui.li({}, [t.title]))]),
        pending: null,
        failed: { Unexpected: () => ui.p({ role: 'alert' }, ['Unavailable']) },
      }),
    ]),
})

export const adds = contract(todos, {
  given: { state: 'idle' },
  when: [{ send: Add, payload: { title: 'Ship' } }, { done: addTodo, result: { id: 't1', title: 'Ship' } }],
  expect: { state: 'idle', effects: [{ effect: addTodo, input: { title: 'Ship' } }] },
})
```
- **The form works without JavaScript too:** the server runs the same machine for a native post.
- **The list refreshes in place after the mutation,** because the mutation invalidates the query's tag.
- **Only the parts bound to the machine or to that refresh ship JavaScript.** The rest of the page is plain HTML.

## Measured
**Same model and same task, Tenon against Nuxt:** a task board built from a spec, then changed. Each app was checked
by a hidden acceptance test ([trial 0007](docs/trials/0007-after-adr-0022.md)).

| | Tenon | Nuxt |
|---|---|---|
| Correctness (build, change, regression) | 12/12, 6/6, 12/12 | 12/12, 6/6, 12/12 |
| Agent cost to change the app | 1.07× | 1× |
| Agent cost to build it | 1.75× | 1× |

**Rendering, against React, Vue, Preact and Svelte:** the same 100-item page, 4× CPU throttling
([benchmarks](docs/benchmarks/0001-frameworks.md), sixth run).

| | Tenon | Best of the others |
|---|---|---|
| Initial JS (gzip) | 7.5 KB | Preact 5.4 KB |
| Interactive at | 27.8 ms | Preact 26.7 ms |
| 200 clicks | 10.6 ms | Svelte 8.7 ms |
| Server renders per second | 52.6 k | Svelte 94.2 k |
| HTML | 12.1 KB | 12.6 KB |

## Packages
| Package | What it is |
|---|---|
| [`create-tenon`](https://www.npmjs.com/package/create-tenon) | Creates an app, set up for Claude Code or `AGENTS.md` agents |
| [`@tenonkit/core`](https://www.npmjs.com/package/@tenonkit/core) | IR types and the builders you write apps with |
| [`@tenonkit/cli`](https://www.npmjs.com/package/@tenonkit/cli) | `tenon validate`, `inspect`, `graph`, `explain`, `impact`, `plan`, `build`, `skill` (all `--json`) |
| [`@tenonkit/schema-zod`](https://www.npmjs.com/package/@tenonkit/schema-zod) | Zod schemas (the default adapter) |
| [`@tenonkit/data`](https://www.npmjs.com/package/@tenonkit/data) | Resolvers, cache, tags, invalidation |
| [`@tenonkit/adapter-node`](https://www.npmjs.com/package/@tenonkit/adapter-node) | Node server with an ISR page cache |
| [`@tenonkit/adapter-static`](https://www.npmjs.com/package/@tenonkit/adapter-static) | Static export |
| [`@tenonkit/runtime-server`](https://www.npmjs.com/package/@tenonkit/runtime-server) | Streaming SSR and a web-standard `Request → Response` handler (Bun, Deno, Workers, Vercel) |
| [`@tenonkit/runtime-client`](https://www.npmjs.com/package/@tenonkit/runtime-client) | The DOM runtime for islands |
| [`@tenonkit/css`](https://www.npmjs.com/package/@tenonkit/css) | Tailwind CSS v4, compiled from the classes the IR declares |
| [`@tenonkit/validator`](https://www.npmjs.com/package/@tenonkit/validator) · [`@tenonkit/compiler`](https://www.npmjs.com/package/@tenonkit/compiler) · [`@tenonkit/machine`](https://www.npmjs.com/package/@tenonkit/machine) | Used by the packages above |
| [`@tenonkit/content`](https://www.npmjs.com/package/@tenonkit/content) | Markdown collections with typed front matter |
| [`@tenonkit/image`](https://www.npmjs.com/package/@tenonkit/image) | Optional WebP `srcset` and share-image cards (uses sharp) |
| [`@tenonkit/testing`](https://www.npmjs.com/package/@tenonkit/testing) | Render assertions through the real handler |
| [`@tenonkit/dev`](https://www.npmjs.com/package/@tenonkit/dev) · [`@tenonkit/bundle`](https://www.npmjs.com/package/@tenonkit/bundle) | Development server; widget bundling |

## Also included
- Soft navigation that keeps UI alive between pages.
- Typed search parameters, and forms that work without JavaScript.
- Field errors, and a pattern for optimistic updates.
- i18n with typed messages.
- Sessions, CSP and cross-site POST protection.
- ISR and SWR with tag revalidation, and live queries.
- A derived head: title, canonical, Open Graph, JSON-LD, sitemap and `robots.txt`.
- Preview mode, PWA and an offline page.
- Widgets, which wrap third-party DOM libraries.

The capability comparison with Next.js, Nuxt, SvelteKit, Astro and React Router is in
[ADR 0011](docs/adr/0011-mainstream-gap-analysis.md).

## Requirements and status
- **Node 22.18 or newer.** Config and app code are TypeScript run with Node's type stripping.
- **Version 0.1.0 is the first public release.** The API may change before 1.0. Every design decision is recorded in
  [`docs/adr`](docs/adr).

## Developing Tenon
```sh
pnpm install
pnpm gate            # lint, typecheck, tests and performance budgets
```
Guides for agents working on this repository: [`CLAUDE.md`](CLAUDE.md) and [`AGENTS.md`](AGENTS.md).

## License
[MIT](LICENSE) © olevatorr. Tenon is an independent project, not affiliated with other products named Tenon.
