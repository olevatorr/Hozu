# Machine (one per feature)

```ts
export const m = machine({
  context: z.object({ draft: z.string(), error: z.string().nullable(), target: z.string() }),
  initialContext: { draft: '', error: null, target: '' },
  initial: 'idle',
  states: ({ ctx }) => ({
    idle: {
      on: [
        on(Draft, { target: 'idle', assign: (e) => { ctx.draft = e.text } }),
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
- **assign** writes context: `ctx.x = v`, `ctx.n += 1`, `ctx.list.push(item)`,
  `ctx.list = ctx.list.filter((i) => i.id !== e.id)`. Values are event (`e`), result (`r`) or error fields,
  context, literals, operators and `fn()` calls.
- **guard** returns a condition: comparisons, `&&`, `||`, `!`, or a boolean `fn()`.
- **navigate** sends the browser to `ui.link(route, params, search)` after the transition.
- `done` and each `failed` entry take a state name, one transition, or a list of guarded transitions.
- A transition to the same state re-enters it and re-runs its `invoke`: do not handle the busy event in the busy
  state. Machines never hold translated text (store a code, choose the message in the view).
- Events: `export const Add = event({ payload: z.object({ title: z.string() }) })`.
