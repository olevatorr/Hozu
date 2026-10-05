# Machine (one per feature)

```ts
export const m = machine({
  context: z.object({ draft: z.string(), error: z.string().nullable() }),
  initialContext: { draft: '', error: null },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: { on: [on(Add, { target: 'adding', assign: (e) => { ctx.draft = e.title } })] },
    adding: {
      invoke: invoke(addItem, {
        input: { title: ctx.draft },
        done: { target: 'idle', assign: () => { ctx.draft = '' } },
        failed: { Unexpected: { target: 'idle', assign: (e) => { ctx.error = e.message } } },
      }),
    },
  }),
})
```
- Events: `export const Add = event({ payload: z.object({ title: z.string() }) })`.
- **assign** writes context: `ctx.x = v`, `ctx.n += 1`, `ctx.list.push(item)`,
  `ctx.list = ctx.list.filter((i) => i.id !== e.id)`.
- **guard** returns a condition: `on(Add, { target: 'adding', guard: (e) => e.title.length >= 2 })`; the first
  matching guard wins.
- **invoke** runs a mutation on entry; the state drops events it does not handle. `failed` lists every declared error
  of the mutation plus `Unexpected` (`Invalid` optional, `hozu docs forms`).
- Do not handle the busy event in the busy state: a transition to the same state re-runs its `invoke`.
- `target: 'previous'` (or `done: 'previous'`) returns to the state the machine came from, so a busy state entered
  from two modes (viewing, editing) needs no copy per mode.

<!-- more -->

The full form: shared transitions, guards, `navigate`, errors, a timer.

```ts
export const m = machine({
  context: z.object({ draft: z.string(), error: z.string().nullable(), target: z.string() }),
  initialContext: { draft: '', error: null, target: '' },
  initial: 'idle',
  on: ({ ctx }) => [on(Draft, { assign: (e) => { ctx.draft = e.text } })],   // shared by every state without invoke
  states: ({ ctx }) => ({
    idle: {
      on: [
        on(Add, { target: 'adding', guard: (e) => e.title.length >= 2 }),   // first matching guard wins
        on(Add, { target: 'idle', assign: () => { ctx.error = 'Too short' } }),
        on(Remove, { target: 'removing', assign: (e) => { ctx.target = e.id } }),
      ],
    },
    adding: {                                   // runs addItem on entry; drops events it does not handle
      invoke: invoke(addItem, {
        input: { title: ctx.draft },
        done: { target: 'idle', assign: () => { ctx.draft = '' }, navigate: (r) => ui.link(itemPage, { id: r.id }) },
        failed: {                               // every declared error + Unexpected (+ optional Invalid)
          Duplicate: { target: 'idle', assign: () => { ctx.error = 'Already exists' } },
          Unexpected: { target: 'idle', assign: (e) => { ctx.error = e.message } },
        },
      }),
    },
    removing: { invoke: invoke(removeItem, { input: { id: ctx.target }, done: 'idle', failed: { Unexpected: 'idle' } }) },
    flash: { after: [{ ms: 3000, target: 'idle' }], ignore: [Add] },    // timers; ignore only without invoke
  }),
})
```
- **assign** values are event (`e`), result (`r`) or error fields, context, literals, operators and `fn()` calls.
- **guard** conditions: comparisons, `&&`, `||`, `!`, or a boolean `fn()`.
- **navigate** sends the browser to `ui.link(route, params, search?)` after the transition. It returns one link: to
  choose between links, write one guarded transition per link (`[{ guard: () => …, navigate: … }, { navigate: … }]`);
  a `?:` inside `navigate` is HZ014.
- `done` and each `failed` entry take a state name, one transition, or a list of guarded transitions.
- **Shared transitions:** `machine({ on })` entries are copied into every state that has no `invoke`, is not final,
  and neither handles nor ignores the event itself. Without `target` they stay in the state they fire in; one
  contract covers every copy.
- **Start from the URL:** a view with a `route` may declare `seed: ({ params, search }) => ({ q: search.q })`; the
  page's machine then starts with those context fields (server render, hydration and no-JS posts alike). One view
  per page may seed a machine (HZ048).
- A transition to the same state re-enters it. In an app with `site.locales`, machines never hold
  translated text (HZ041): store a code (`ctx.error = 'duplicate'`) and choose the message in the view. The
  scaffold does this in every app.
