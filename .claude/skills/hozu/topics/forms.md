# Forms

- **Submitted values:** read them with `ui.dom.form('name')` / `ui.dom.formAll('name')` (plus literals, context,
  params, search), so a submit before the page has loaded still arrives (HZ036 otherwise). Name every field.
```ts
ui.form({ on: { submit: ui.send(Add, { title: ui.dom.form('title'), kind: ui.dom.form('kind') }) } }, [
  ui.label({ for: 'title' }, ['Title']),
  ui.input({ id: 'title', name: 'title', required: true, minlength: 2, value: ctx.draft,
    'aria-invalid': ctx.fields.title !== null, 'aria-describedby': 'title-error',
    on: { input: ui.set(ctx.draft, ui.dom.value) } }),
  ui.select({ name: 'kind', 'aria-label': 'Kind' }, kinds.map((k) => ui.option({ value: k, selected: ctx.kind === k }, [k]))),
  ui.button({ type: 'submit' }, ['Add']),
])
ui.p({ id: 'title-error', class: 'text-sm text-rose-600' }, [ctx.fields.title])
```
- **Field errors:** context `fields: z.object({ title: z.string().nullable() })`, reset on submit
  (`ctx.fields = { title: null }`), and `failed.Invalid: { target: 'idle', assign: (e) => { ctx.fields = e.fields } }`.
  Limits live in the mutation's input schema (`z.string().min(2, '…')`), never in the event payload (HZ061).
- **Server error:** a declared error sets `ctx.error`; show `ctx.error !== null && ui.p({ role: 'alert' }, [ctx.error])`.
- **Enum from a select:** fills an enum field only when every literal option value is a member (HZ033).

<!-- more -->

- **Without JavaScript,** the server runs the same machine for a native post, then redirects or re-renders with the
  result (e.g. a `<select name="kind">` carries the kind).
- **With the app's kit** (as in `example/`): a `Field` with a `control` slot holds the label, the input and its error.
```ts
ui.use(Field, { props: { for: 'title', label: 'Title', error: ctx.fields.title, errorId: 'title-error' },
  slots: { control: ui.use(Input, { props: { id: 'title', name: 'title', value: ctx.draft, required: true,
    invalid: ctx.fields.title !== null, describedby: 'title-error' }, on: { input: ui.set(ctx.draft, ui.dom.value) } }) } }),
ui.use(Button, { props: { type: 'submit' } }, ['Add']),
```
- **Limit messages:** `z.string().min(2, 'Use at least 2 characters')`.
- **Clear after success:** bind `value: ctx.draft` and reset it in `done`.
- **Per-item actions:** wrap each button in its own small form.
- **Enum source:** `ui.dom.form('kind')` or `ui.dom.value`.
- **Several values:** `ui.dom.formAll('ids')` is every value of the name in tree order (`[]` when none) for checkbox
  groups, `select multiple` and controls inside `ui.each`, into a list field; `ui.dom.form(name)` is the first (HZ054).
- **Which button:** give submit buttons `name` and a literal `value` and read `ui.dom.form('action')` in the form's
  submit; JS and no-JS read the same value. Into an enum only when every submit button of the form has that name and
  a member value, else make the field nullable (HZ033). No `on.click` on a submit button (HZ056).
- **Controls outside the form** (forms cannot nest): `const bulk = ui.formRef()` at module level,
  `ui.form({ ref: bulk, … })`, `ui.input({ form: bulk, … })`; a string `form` is HZ014, a name no control has HZ055.
- **A flag or a number:** a checkbox posts `'on'` only while checked: `ui.dom.formAll('remember')` into
  `z.array(z.string())`, or a radio pair. Send numbers as text and parse them in the mutation input (`z.coerce.number()`).
- **An invalid native post:** a native post whose payload or mutation input fails re-renders with 400 through
  `failed.Invalid`, like the JS submit.
