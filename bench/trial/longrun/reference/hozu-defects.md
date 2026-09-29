# Hozu defects found while building the trial 0020 reference

Framework code was not changed. Each entry: symptom, minimal repro, workaround, the step where it was met.

## D1 — HZ018 fires with identical `was` / `now` when a `navigate` link gains `{}` (step 06)
- **Symptom:** giving `home` a `search` schema makes `ui.link(home, null)` a type error (the third argument becomes
  required), and `ui.link(home, null, {})` then changes the IR of every transition that navigates to it. `hozu check`
  reports HZ018 on `signingIn/invoke/done/0` and on `idle/on/account.SignIn/0` with `was:` and `now:` printed
  identically (`navigate link(home, null)`), and `--update-lock` refuses it (the transition decides). The canonical
  URL is the same `/`.
- **Repro:** `examples/notes`: `home = route({ path: '/', params: null, search: z.object({ tag: z.string().default('') }) })`,
  `navigate: () => ui.link(home, null, {})` in the account machine, `hozu check`.
- **Workaround:** a contract has to change, although none is wrong: `signsIn` renamed to `signsInToList`.

## D2 — operators in a view helper function are evaluated at record time, silently (step 06)
- **Symptom:** `@hozu/transform` lowers operators only inside builder callbacks. In a plain helper that a `render`
  callback calls (`const noteItem = (note) => ui.li({}, [note.pinned ? 'Unpin' : 'Pin', note.pinned && ui.span(...)])`)
  the reference proxy is truthy, so every note renders `Unpin` and `pinned`. No diagnostic; only `===` in the same
  helper is caught (HZ014 "A guard must be an op.* comparison").
- **Repro:** move the `li` of `examples/notes` into `const item = (note: Note) => ui.li({}, [note.pinned ? 'Unpin' : 'Pin'])`
  and call it from `ui.each`; `hozu get /` shows `Unpin` for unpinned notes.
- **Workaround:** `op.*` / `ui.if` in helpers (`ui.if(op.eq(note.pinned, true), ['Unpin'], ['Pin'])`).

## D3 — a form cannot send a variable set of checked items, nor tell two submit buttons apart (step 13)
- **Symptom:** `ui.dom.form(name)` reads one value per literal name. The client builds it from `new FormData(form)`
  (last value wins, the submitter button is not included), the server from the posted body (first value wins).
  So "check any number of notes, then `Delete selected` or `Archive selected`" has no machine form: the ids are
  multi-valued or have per-note names, and the two buttons share one `submit` handler.
- **Repro:** checkboxes `name: 'ids', value: note.id` in one form with `on: { submit: ui.send(Bulk, { ids: ui.dom.form('ids') }) }`:
  checking two notes sends only the last id with JS and only the first without JS.
- **Workaround:** a plain native form (no `on.submit`) posting to an `endpoint({ method: 'POST', input:
  z.record(z.string(), z.string()), output: 'response' })`; each checkbox is `form="bulk" name=<note id>`, the buttons
  are `name="action" value="delete|archive"`, and the endpoint answers 303 to the list. `Selected: <n>` is machine
  context fed by the checkboxes' `change` events.

## D4 — no way to invalidate user-scoped data written outside the reader's own mutations (steps 13, 15–17)
- **Symptom:** a mutation invalidates its tags only in the `public` partition and in the writer's own session
  partition; `endpoint` resolvers cannot declare `invalidates`, and `server.revalidate(tags)` reaches only `public`.
  A `scope: 'user'`, `freshness: 'static'` query therefore keeps serving the old value after (a) an endpoint wrote
  the data, or (b) another user changed it (a shared note renamed by its owner, the admin table, a deleted account).
  `{ revalidate: 0 }` is rejected (HZ014), so no cached freshness is exact.
- **Repro:** the bulk endpoint above deletes notes; the redirect to `/notes` still lists them (the `listNotes` entry
  of that session is not stale).
- **Workaround:** `freshness: 'live'` on every user-scoped query that shows such data (never cached on the server;
  the client refreshes on tag messages). It adds the live client chunk and an event stream per page.

## D5 — removing a primitive from a context list is not expressible (step 13)
- **Symptom:** `ctx.selected = ctx.selected.filter((id) => id !== e.id)` on `z.array(z.string())` is HZ014
  ("Method filter cannot run on a reference"); only the documented `(i) => i.id !== e.id` form over objects lowers
  (`op.removeWhere` needs a key).
- **Workaround:** keep `{ id }` objects in the list (`selected: z.array(z.object({ id: z.string() }))`).

## D6 — a new `failed` branch on an invoke is HZ018 on the transition that enters it, with identical was / now (step 14)
- **Symptom:** adding `TooMany` to `addNote.errors` and `failed.TooMany` to the `adding` invoke changes the behaviour
  hash of `idle/on/notes.Add/0` (it hashes the entered state's invoke). That transition only copies values, but a
  contract (`adds`) covers it, so `--update-lock` refuses and HZ018 prints `was:` and `now:` identically (the summary
  does not show the invoke's failure branches). The new contract for the branch (`adding` → failed) does not count.
- **Repro:** `examples/notes`: add an error to `addNote`, handle it in `adding`, add a contract for that branch, `hozu check`.
- **Workaround:** start the new contract from `idle` (`send Add`, then `failed addNote TooMany`) so it also covers
  `idle/on/notes.Add/0`.

## D7 — a page cannot answer 403 (step 16)
- **Symptom:** a failing `head.query` sets the status to 303 (a listed redirect), 500 (`Unexpected`) or 404 (any
  other declared error). There is no way to answer "signed in, but not allowed" with 403 from a page.
- **Repro:** `ui.page(admin, { head: { query: adminUsers, redirects: { Unauthorized: login } } })` with
  `errors: { Forbidden: … }`: a non-admin gets 404.
- **Workaround:** `/admin` is an `endpoint({ method: 'GET', output: 'response' })` that returns its own HTML (403
  `Not allowed`, or the table for `admin`) and 302 to `/login`; the route `admin` exists only so `ui.link(admin, null)`
  can point at it. The hand-written page needs `@view-transition { navigation: auto }` itself, or Chrome logs
  "Transition was aborted … opt-in disabled" when a list page link leads to it. `hozu check` does not notice a
  missing endpoint resolver (HZ021 appears only when the server starts).
