# Hozu UI: the official components

The kit lives in the app (`ui/`): its files are yours to edit. `ui/kit.lock.json` remembers the files as installed, so
`npx hozu add kit ui --sync` updates the files you did not change and lists the ones you did.

- **Add one:** `npx hozu add component ui <Name> --from official` copies it (and the files it uses) and registers it.
- **Use:** `ui.use(Button, { variant: { intent: 'primary' }, props: { type: 'submit' } }, ['Save'])`. Import from
  `../../ui/<file>.ts`.
- **Theme:** Grain by default; `data-theme="joinery"` on `<html>` (or any ancestor) switches. Colours are roles
  (`bg-surface`, `text-ink`, `text-ink-muted`, `border-line`, `bg-accent`, `text-danger-text`…), not palette names.
- **Change every use** in the component's own file (its `tv()` styles, props, render). **Change one use** with
  `class` at that use; a property the component owns needs `!` (HZ072).

| You need | Use |
|---|---|
| The one main action of a form or toolbar | `Button` `intent: 'primary'`; others `secondary`, `quiet` |
| A destructive action | `Button` `intent: 'destructive'` inside a `Dialog` that asks first |
| A link that looks like a button | `LinkButton` |
| A labelled control with a hint and an error | `Field` around `Input` (or a native `select` / `textarea`) |
| A status word | `Badge` with `tone` |
| A boxed group with a title | `Card` |
| The page's title, description and actions | `PageHeader` |
| A number with a label and a change | `Metric` |
| A list of actions behind a button | `DropdownMenu` with `MenuItem` |
| A modal question or form | `Dialog` (native `commandfor` / `command`, or `open: is([...])` from the machine) |
| Section links, the current one marked | `NavBar` with `NavLink` (`current`) |
| Rows and columns | `Table`, `Tr`, `Th`, `Td` |
| Nothing to show yet / something failed / a message after an action | `EmptyState` / `Problem` / `Notice` |
| An icon | `Icon` with a path from `ui/icons/lucide.ts` or `ui/icons/hozu.ts` |
