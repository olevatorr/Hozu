---
title: Verify and test
description: Check the program, read pages, drive a real browser and write tests, all without starting a server.
order: 12
---

## Check first

`npx hozu check` is the one command to run after every edit. It type-checks the app, validates the framework rules and runs every contract. Each diagnostic names its location, cause and fix ([Diagnostics](/docs/diagnostics)). Contracts are the behaviour spec: a transition that decides has one, and the lock records the rest ([Machines and contracts](/docs/machines)).

A build with errors renders nothing, so `hozu get`, `hozu browse` and `testApp` refuse it until `check` is clean.

## Read a page

```sh
npx hozu get /notes --session '{"user":"ada"}'
npx hozu get /notes --select 'nav a[aria-current]' --forms
```

`get` runs the app's real handler in-process and prints the status, a redirect, `set-cookie` attributes, the title, alerts, the visible text and any server error the request caused. `--select` prints matching elements with their attributes and `class`; `--forms` lists each form's fields, defaults, groups and submit buttons. It needs no browser and runs no client code.

## Run one effect

```sh
npx hozu call notes.listNotes --input '{}' --session '{"user":"ada"}'
npx hozu call notes.addNote --input '{"text":"Milk"}' --session '{"user":"ada"}' --write
```

`call` prints the value or the declared error. A mutation writes real data, so it needs `--write`, and then prints the tags it invalidated and the queries they refresh. Endpoints take `--header`; a POST endpoint needs `--write`. Browser-run effects need `browse`.

## Drive a browser

`hozu browse` loads the page in the installed Chrome, Chromium or Edge, answered by the same in-process app: no server, no port.

```sh
npx hozu browse /notes --session '{"user":"ada"}' --do 'fill New note=Milk; press Enter' --do 'click Pin in "Milk"'
```

- **Steps:** `fill <label>=<value>`, `select`, `check`, `uncheck`, `click <name>`, `submit "<form>"`, `press <key>`, `wait <ms>`, `goto <path>`, `post <path> a=1`, and `remember <name> from url|<selector> [@attr]` for `$name` later. A target may end with `in "<text>"`: the smallest list item, table row or form containing it. A missing one prints `Did you mean "…"?`.
- **Modes:** JavaScript is on by default. `--js off` runs the steps without it, `--js both` side by side; a step where both made a request and the text differs is marked `≠ DIFFERS`.
- **Actors:** `--as <name>` starts another browser with its own `--session`; all actors share one app. Another visitor's data is one chain: `--as ada --do 'remember note from li a @href' --as bob --do 'goto $note'`, where bob's page should answer `(403)`.
- **Pending states:** `--do 'hold notes.addNote'` keeps that mutation's answer back, so the next steps and `--screenshot` see the busy UI; `--do 'release'` lets it finish.

## Read the report

Each step prints only the lines it added or removed, and says whether the page reloaded, navigated or changed in place.

- **A navigation** names how the page arrived and its time to the first paint: `→ /products/mug (loaded, 32 ms)`, or `prerendered`. A page answering 401, 403, 404 or 410 shows that status and is not an error.
- **A click that would land on another element** fails and names the element above it, as a person's click would fail.
- **Elements rebuilt unchanged** and **a layout shift** no input explains are reported with the elements involved; fix them, usually by disabling a control instead of hiding it. An element that moves to another parent is not counted.
- **Errors:** uncaught exceptions, `console.error` calls, CSP violations, failed requests, server errors and client components that failed. The exit code is 1 when anything failed.

`--viewport 390x844` opens at a phone's size, `--screenshot shot.png` saves the viewport after the steps, and `--reduced-motion` emulates that preference.

## Tests in code

`@hozu/testing` runs the app module in a test, with no server and no browser:

```ts
import { testApp } from '@hozu/testing'
import { expect, it } from 'vitest'
import app from '../app.ts'

it('adds a bookmark without JavaScript', async () => {
  const site = testApp(app, { env: process.env })
  const home = await site.get('/')
  const action = /<form[^>]* action="([^"]+)"/.exec(home.html)![1]!.replace(/&amp;/g, '&')
  const added = await site.post(action, { title: 'Hozu talk', kind: 'podcast' })
  expect(added.status).toBeLessThan(400)
  expect((await site.get('/')).text).toContain('Hozu talk')
})
```

`get` and `post` return `{ status, headers, html, text, payload }`. `post` submits a native form to the `action` the server rendered; pass `[name, value]` pairs for repeated names. `testApp` reads no env files, so pass `env`; `session` swaps the session store. Add `hozuTransform()` from `@hozu/transform/vite` to Vitest's `plugins`. In your own browser tests, wait for `html[data-hozu-ready]` before clicking.

`npx hozu docs testing` prints the topic for your agent, and [CLI](/docs/cli) lists every option.
