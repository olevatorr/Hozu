# A new feature: the files and a complete example

Start with `npx hozu add feature <name> --page / --with auth,detail,toggle,filter,remove` and edit the texts it
lists. It writes the files below and the first `hozu.lock.json`.

## How it works
- A feature is **declarations**: events, queries / mutations (the only side effects), one machine, views,
  contracts. Builders record them as data (an IR) that is validated, then rendered on the server. Only views bound
  to the machine ship JS.
- **Callbacks are ordinary TypeScript** (`render`, `guard`, `assign`, `navigate`, `ui.each` / `ui.query`
  callbacks): `===`, `!==`, `<`, `&&`, `||`, `!`, `??`, `c ? a : b`, template strings, `+`, `-`, `.length`, and in
  `assign`, `ctx.x = v`, `ctx.n += 1`, `ctx.list.push(v)`, `ctx.list = ctx.list.filter((i) => i.id !== e.id)`.
  Methods on data (`.map`, `.toUpperCase()`…) are not: use `ui.each` for lists and a `fn()` for computation.
- A mutation runs when the machine **enters** a state whose `invoke` calls it; that state drops other events, and
  `done` / `failed` leave it.
- A filter in the URL starts the machine: `seed: ({ search }) => ({ q: search.q })` on the view, then read `ctx.q`.
  `machine({ on })` holds transitions every idle state shares; `fn` bodies may call helpers from the same module.
- Reusable view logic is a `part((…) => …)`, inlined where it is used (`hozu docs views`).

## Files
```
hozu.config.ts  project({ schema, app, site, routes, pages, features })  routes.ts  route() declarations
features/<name>/model.ts  schemas, events, effects, fns, machine        views.ts  views, contracts
features/<name>/feature.ts  feature({ declarations: [model, views] })    app.ts  app({ resolvers })
ui/kit.ts  ui.kit({ id: 'ui', components }) — Button, Input, Field…      ui/*.ts  one component each
```
Relative imports end in `.ts`. The example below uses plain elements so it runs in any app; with a kit the input
and button are `ui.use(Input, …)` and `ui.use(Button, …)`, as in `example/` (`hozu docs components`).

## A feature in one screen
```ts
// model.ts
export const Item = z.object({ id: z.string(), title: z.string(), done: z.boolean() })
export const Add = event({ payload: z.object({ title: z.string() }) })
export const itemsTag = tag({ param: null })
export const listItems = query({ input: z.object({}), output: z.array(Item), scope: 'public',
  freshness: 'static', tags: () => [itemsTag()], runs: 'server' })        // resolvers in app.ts
export const addItem = mutation({ input: z.object({ title: z.string().min(2, 'Too short') }), output: Item,
  errors: { Duplicate: z.object({ title: z.string() }) }, invalidates: () => [itemsTag()], runs: 'server' })
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
