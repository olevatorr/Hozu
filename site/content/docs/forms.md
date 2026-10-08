---
title: Forms
description: Read submitted values so a form works with and without JavaScript, and show field errors from the mutation's schema.
order: 6
---

## Read what was submitted

A form's submit reads its values with `ui.dom.form('name')`. The same payload then arrives whether the page has hydrated or not: without JavaScript the browser posts the form, and the server runs the same machine for that post, then redirects or renders the result.

```ts
ui.form({ on: { submit: ui.send(Add, { title: ui.dom.form('title'), kind: ui.dom.form('kind') }) } }, [
  ui.label({ for: 'title' }, ['Title']),
  ui.input({
    id: 'title', name: 'title', required: true, minlength: 2, value: ctx.draft,
    'aria-invalid': ctx.fields.title !== null, 'aria-describedby': 'title-error',
    on: { input: ui.set(ctx.draft, ui.dom.value) },
  }),
  ui.p({ id: 'title-error', class: 'text-sm text-rose-600' }, [ctx.fields.title]),
  ui.select({ name: 'kind', 'aria-label': 'Kind' }, [
    ui.option({ value: 'article' }, ['Article']),
    ui.option({ value: 'video' }, ['Video']),
  ]),
  ui.button({ type: 'submit' }, ['Add']),
])
```

- Name every field. A submit that reads anything else than form values, context, params, search or literals cannot run without JavaScript: HZ036 warns.
- **Several values:** `ui.dom.formAll('ids')` is every value of a name in tree order (`[]` when none), for checkbox groups, `select multiple` and controls inside `ui.each`. `ui.dom.form` reads only the first, so using it on a repeated name is HZ054.
- **Which button:** give submit buttons a `name` and a literal `value` and read `ui.dom.form('action')`. A submit button that also sends on click is HZ056.
- **Controls outside the form** (forms cannot nest): `const bulk = ui.formRef()` at module level, `ui.form({ ref: bulk, … })` and `ui.input({ form: bulk, … })`. A read naming no control of the form is HZ055.
- **A checkbox** posts `'on'` only while checked: read it with `formAll` into `z.array(z.string())`, or use a radio pair.

## Enums, numbers and limits

Form values are text. `ui.dom.form` fills an enum field only when it comes from a `<select>`, radios or submit buttons whose literal values are all members of the enum; otherwise it is HZ033. Send numbers as text and parse them in the mutation's input with `z.coerce.number()`.

Limits belong in the mutation's input schema, with their messages: `z.string().min(2, 'Use at least 2 characters')`. An event payload fed by a form that declares limits is HZ061, because the server checks the mutation's input, not the event.

## Field errors and declared errors

Every mutation has the framework error `Invalid` `{ message, fields }`: input that fails its schema, or a resolver's `fail('Invalid', { message, fields: { title: 'Taken' } })`. Keep a `fields` object in context, reset it on submit and fill it in `failed`:

```ts
on(Add, { target: 'adding', assign: (e) => { ctx.draft = e.title; ctx.fields = { title: null } } })
// in the adding state's invoke:
failed: {
  Invalid: { target: 'idle', assign: (e) => { ctx.fields = e.fields } },
  Duplicate: { target: 'idle', assign: () => { ctx.error = 'duplicate' } },
  Unexpected: { target: 'idle', assign: () => { ctx.error = 'Could not save. Try again.' } },
}
```

A failure you expect, such as a duplicate or a row that is gone, is a declared error of the mutation, shown as `ctx.error !== null && ui.p({ role: 'alert' }, [ctx.error])`. Both render the same with and without JavaScript: a native post whose input fails answers 400 and re-renders through `failed.Invalid`. In an app with several languages, store a code and choose the message in the view ([Languages](/docs/i18n)).

## Steps without JavaScript

A form of several steps (address, then payment, then confirm) is one machine with a state per step. After a native post, every form Hozu posts carries the machine's state in a hidden `__hozu_state` field, and the next post continues from it, so earlier fields are not posted again.

The sealed state is bound to the visitor's session and to the machine's shape, lasts a day, is checked against the context schema, and is signed with `SESSION_SECRET` when the server has one. Forms with your own `method` or `action` do not carry it.

## Uploads

An `<input type="file">` gives `ui.dom.files` in its `change` event: a list of `{ name, size, type, token }`. Send the tokens in the event payload and the mutation's input; the mutation resolver reads the bytes with `file(token)` from its context, which returns `{ name, type, size, bytes }` or `null`. A resolver in Go reads it with `ctx.File(token)`.

## Check a form

```sh
npx hozu get /items --forms
npx hozu browse /items --js both --do 'fill Title=Milk' --do 'press Enter'
```

`--forms` lists each form's fields, defaults, groups and submit buttons. `--js both` runs the steps with and without JavaScript side by side and marks a step whose result differs. See [Verify and test](/docs/testing), and `npx hozu docs forms` for your agent.
