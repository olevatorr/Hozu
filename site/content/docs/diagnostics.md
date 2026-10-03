---
title: Diagnostics
description: Turn a failed check into a focused change.
order: 7
---

## Read the cause before changing code

A Hozu diagnostic includes a code, severity, source location, IR pointer, cause and suggested fix. JSON output preserves that structure so an agent can act on the same information you see in the terminal.

Start with `npx hozu check`. Resolve TypeScript errors first, then address each reported rule at its source. Run the check again after the edits, followed by an in-process request that exercises the changed page or form.

## Common failures

| Code | What to look for | How to respond |
| --- | --- | --- |
| HZ005 | A visible control sends an event a state (without `invoke`) does not handle. | Handle it, or list it in that state's `ignore` when dropping it is intended. |
| HZ016 | A machine transition lacks a contract. | Add a given/when/expect example for the intended transition. |
| HZ018 | A transition that decides changed, and no contract fails against the previous behaviour. | Decide the intended behaviour, add or update the contract, then accept the lock. |
| HZ024 | A route's parameter schema disagrees with its pattern. | Match strings, nullable strings or arrays to the segment modifiers. |
| HZ026 | A class does not produce CSS. | Correct the utility or use a `data-*` hook for custom styling. |
| HZ028 | An image lacks dimensions. | Supply its width and height. |
| HZ030 | Raw HTML comes from an untrusted value. | Use text rendering or a trusted content source. |
| HZ032 | An internal link is a string path. | Use `ui.link` with the declared route and parameters. |
| HZ033 | A DOM string feeds an enum, number or boolean field without known options. | Use literal select, radio or submit button values matching the enum; in a form, send a flag with `ui.dom.formAll` and parse numbers in the mutation input. |
| HZ035 | A search schema cannot be canonicalized. | Use flat scalar fields with defaults or nullable values. |
| HZ036 | A form cannot run without JavaScript. | Read named form fields with `ui.dom.form` or `ui.dom.formAll` when a native form is required. |
| HZ049 | A user-scoped query is cached. | Use `freshness: 'request'` (the fix is a patch). |
| HZ051 | A declared head error is not mapped in `head.failed`. | Choose a route, 403, 404 or 410 for each error; it is an intent decision. |
| HZ054 | `ui.dom.form` reads one value where several arrive. | Read every value with `ui.dom.formAll` into a list field. |
| HZ057 | `hozu.lock.json` differs from the computed lock. | Review the listed lines, run `hozu check --update-lock`, and list the accepted `now:` lines. |
| HZ058 | A contract covers no decision. | Nothing to patch: the named lock entries already review those transitions. |
| HZ059 | A reference reached plain JavaScript. | Make the helper a `part()`; for a global, use an operator or a `fn()`. |
| HZ081 | A `fetch.ts` export is missing or extra, a feature with `'browser'` or `'either'` effects has no `fetch.ts`, an `'either'` query reads user data, or `fetch.ts` imports a Node-only module. | Export one implementation per effect under its name; use `runs: 'server'` for user data, secrets and databases. |
| HZ082 | Something only a server can do reads browser-run data: a page `head` or `entries`, or a server-cached query whose tag a browser mutation invalidates. | Make that query or mutation `runs: 'server'`, or move the read out of the head. |

`hozu docs diagnostics` prints the version-matched table of the full rule set, and every diagnostic names its topic (`see: hozu docs …`). Historical trial records use the old `TN` prefix; current Hozu diagnostics use `HZ`.

## Accept an intentional change

A passing type check alone does not establish the intended behaviour. Keep the machine and its contracts aligned, verify the resulting page or form, then run:

```sh
npx hozu check --update-lock
```

Do not change an expected result merely to match a broken implementation. The contract describes what you decided the application should do.

## Understand the design

Read [How Hozu works](/how-it-works/machines-and-contracts) for the decisions behind this API and their trade-offs.
