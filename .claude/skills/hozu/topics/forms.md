# Forms

- **Works without JavaScript** when the submit payload reads only `ui.dom.form('name')`, literals, context, params
  and search (else HZ036 warns): the server runs the same machine for a native post, then redirects or re-renders
  with the result. Put every value the submit needs in a named field (a `<select name="kind">`).
```ts
ui.form({ on: { submit: ui.send(Add, { title: ui.dom.form('title'), kind: ui.dom.form('kind') }) } }, [
  ui.label({ for: 'title' }, ['Title']),
  ui.input({ id: 'title', name: 'title', required: true, minlength: 2, value: ctx.draft,
    'aria-invalid': ctx.fields.title !== null, 'aria-describedby': 'title-error',
    on: { input: ui.send(Draft, { text: ui.dom.value }) } }),
  ui.select({ name: 'kind', 'aria-label': 'Kind' }, kinds.map((k) => ui.option({ value: k, selected: ctx.kind === k }, [k]))),
  ui.button({ type: 'submit' }, ['Add']),
])
ui.p({ id: 'title-error', class: 'text-sm text-rose-600' }, [ctx.fields.title])
```
- **Field errors:** context `fields: z.object({ title: z.string().nullable() })`, reset on submit
  (`ctx.fields = { title: null }`), and `failed.Invalid: { target: 'idle', assign: (e) => { ctx.fields = e.fields } }`.
  Limits live in the mutation's input schema: `z.string().min(2, 'Use at least 2 characters')`.
- **Server error:** a declared error sets `ctx.error`; show `ctx.error !== null && ui.p({ role: 'alert' }, [ctx.error])`.
- **Clear after success:** bind `value: ctx.draft` and reset it in `done`.
- **Per-item actions without JS:** wrap each button in its own small form.
- **Enum from a select:** `ui.dom.form('kind')` or `ui.dom.value` fills an enum field only when every literal
  option value is a member (HZ033).
