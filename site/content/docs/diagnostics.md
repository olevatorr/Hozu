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
| HZ018 | Behaviour changed without a corresponding contract change. | Decide the intended behaviour, update the contract, then accept a clean lock. |
| HZ024 | A route's parameter schema disagrees with its pattern. | Match strings, nullable strings or arrays to the segment modifiers. |
| HZ026 | A class does not produce CSS. | Correct the utility or use a `data-*` hook for custom styling. |
| HZ028 | An image lacks dimensions. | Supply its width and height. |
| HZ030 | Raw HTML comes from an untrusted value. | Use text rendering or a trusted content source. |
| HZ032 | An internal link is a string path. | Use `ui.link` with the declared route and parameters. |
| HZ033 | A DOM string feeds an enum without known options. | Use literal select or radio options matching the enum. |
| HZ035 | A search schema cannot be canonicalized. | Use flat scalar fields with defaults or nullable values. |
| HZ036 | A form cannot run without JavaScript. | Read named form fields with `ui.dom.form` when a native form is required. |

`hozu docs diagnostics` prints the version-matched table of the full rule set, and every diagnostic names its topic (`see: hozu docs …`). Historical trial records use the old `TN` prefix; current Hozu diagnostics use `HZ`.

## Accept an intentional change

A passing type check alone does not establish the intended behaviour. Keep the machine and its contracts aligned, verify the resulting page or form, then run:

```sh
npx hozu check --update-lock
```

Do not change an expected result merely to match a broken implementation. The contract describes what you decided the application should do.

## Understand the design

Read [How Hozu works](/how-it-works/machines-and-contracts) for the decisions behind this API and their trade-offs.
