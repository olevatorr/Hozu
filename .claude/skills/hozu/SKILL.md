---
name: hozu
description: Build or change an app with the Hozu framework (packages @hozu/*, files like hozu.config.ts, features/*/model.ts, views.ts). Use it before writing any Hozu code. It is the complete authoring reference, so you do not need to read the framework source.
---

# Hozu

Hozu is not in your training data; this file and `hozu docs <topic>` are the whole API (skip `node_modules/@hozu`).
- **Building:** read this file, run `hozu add feature <name> --page / --with …`, then edit what it lists.
- **Changing:** read `changing.md`, then only the lines `hozu map` points to.
- **Anything else:** `hozu docs <topic>` prints one short topic (index below). Diagnostics name the topic too.

## How it works
- A feature is **declarations**: events, queries / mutations (the only side effects), one machine, views,
  contracts. Builders record them as data (an IR) that is validated, then rendered on the server. Only views bound
  to the machine ship JS.
- **Callbacks are ordinary TypeScript** (`render`, `guard`, `assign`, `navigate`, `ui.each` / `ui.query`
  callbacks): `===`, `!==`, `<`, `&&`, `||`, `!`, `??`, `c ? a : b`, template strings, `+`, `-`, `.length`, and in
  `assign`, `ctx.x = v`, `ctx.n += 1`, `ctx.list.push(v)`, `ctx.list = ctx.list.filter((i) => i.id !== e.id)`.
  Methods on data (`.map`, `.toUpperCase()`…) are not: use `ui.each` for lists and a `fn()` for computation.
- A mutation runs when the machine **enters** a state whose `invoke` calls it; that state drops other events, and
  `done` / `failed` leave it. Contracts are needed only where a transition decides (a guard, `navigate`, a `fn`).
- A filter in the URL starts the machine: `seed: ({ search }) => ({ q: search.q })` on the view, then read `ctx.q`.
  `machine({ on })` holds transitions every idle state shares; `fn` bodies may call helpers from the same module.

## Files and commands
```
hozu.config.ts  project({ schema, site, routes, pages, features })      routes.ts  route() declarations
features/<name>/model.ts  schemas, events, effects, fns, machine        views.ts  views, contracts
features/<name>/feature.ts  feature({ declarations: [model, views] })    server.ts  implement(...) resolvers
```
```
npx hozu check                      # after every edit: types, rules, contracts
npx hozu check --update-lock        # accept an intended behaviour change
npx hozu add feature items --page / --with auth,detail,toggle,filter,remove
npx hozu map                        # outline with file:line
npx hozu get / --select button --forms          # a page, no server needed
npx hozu post / --field title=A --next /        # a no-JS form post, cookies shown
npx hozu browse / --do 'fill Search=a' --do 'click Save'   # real browser: errors, widgets, text
npx hozu docs views                 # one topic
```
`get` / `post` / `browse` replace a running server for checks; `npm start` runs the app. Relative imports end in `.ts`.

## A feature in one screen
```ts
// model.ts
export const Item = z.object({ id: z.string(), title: z.string(), done: z.boolean() })
export const Add = event({ payload: z.object({ title: z.string() }) })
export const itemsTag = tag({ param: null })
export const listItems = query({ input: z.object({}), output: z.array(Item), scope: 'public',
  freshness: 'static', tags: () => [itemsTag()] })
export const addItem = mutation({ input: z.object({ title: z.string().min(2, 'Too short') }), output: Item,
  errors: { Duplicate: z.object({ title: z.string() }) }, invalidates: () => [itemsTag()] })
export const items = machine({
  context: z.object({ draft: z.string(), error: z.string().nullable() }),
  initialContext: { draft: '', error: null },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: { on: [on(Add, { target: 'adding', assign: (e) => { ctx.draft = e.title; ctx.error = null } })] },
    adding: {
      invoke: invoke(addItem, {
        input: { title: ctx.draft },
        done: { target: 'idle', assign: () => { ctx.draft = '' } },
        failed: {
          Duplicate: { target: 'idle', assign: () => { ctx.error = 'Already listed' } },
          Unexpected: { target: 'idle', assign: (e) => { ctx.error = e.message } },
        },
      }),
    },
  }),
})
// views.ts
export const Board = ui.view({
  machine: items,
  render: ({ ctx, when }) =>
    ui.main({ class: 'mx-auto max-w-xl' }, [
      ui.form({ on: { submit: ui.send(Add, { title: ui.dom.form('title') }) } }, [
        ui.input({ name: 'title', required: true, value: ctx.draft }),
        ui.button({ type: 'submit' }, ['Add']),
      ]),
      ctx.error !== null && ui.p({ role: 'alert' }, [ctx.error]),
      when(['adding'], [ui.p({ 'aria-busy': 'true' }, [`Adding ${ctx.draft}…`])]),
      ui.query(listItems, {}, {
        ready: (list) => ui.ul({}, [ui.each(list, 'id', (i) => ui.li({}, [i.title, i.done ? ' ✓' : '']))]),
        failed: { Unexpected: () => ui.p({ role: 'alert' }, ['Unavailable']) },
      }),
    ]),
})
// feature.ts
import * as model from './model.ts'
import * as views from './views.ts'
export const todos = feature({ id: 'todos', intent: { summary: 'A to-do list' }, declarations: [model, views] })
```
Every declaration a listed module exports is registered under its name; schemas and helpers are ignored. Resolvers:
`implement(addItem, ({ title }, { fail }) => exists ? fail('Duplicate', { title }) : save(title))`.

## Topics (`hozu docs <topic>`)
| Task | Topic |
|---|---|
| elements, attributes, classes, events, DOM fields, lists, links | `views` |
| states, events, invoke, timers, guards, updates | `machine` |
| queries, mutations, tags, errors, `fn()`, resolvers | `data` |
| writing and checking contracts | `contracts` |
| routes, params, search, pages, `head`, 404, sitemap | `pages` |
| forms without JS, field errors, selects | `forms` |
| sign-in, sessions, per-user data | `auth` |
| common UI: filters, search in the URL, modes, per-item actions, load more | `patterns` |
| worked changes: enum field, bulk action, detail field / page | `recipes` |
| webhooks and JSON APIs | `endpoints` |
| browser APIs and DOM libraries (maps, charts) | `widgets` |
| languages, env, HTTP, Markdown, images, preview, PWA, tests, deployment | `i18n`, `env`, `http`, `content`, `testing`, `deploy` |
| a diagnostic code | `diagnostics` |
