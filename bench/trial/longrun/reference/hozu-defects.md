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
