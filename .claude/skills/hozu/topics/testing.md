# Testing

- **Read a page without a server:** `hozu get /path --select 'button[aria-pressed=true]' --forms` (status, title,
  visible text; `--forms` lists each form's fields and submit buttons). Endpoints: `hozu get '/api/items?x=1'`.
- **Try one query or mutation without a page:** `hozu call notes.listNotes --input '{}' --session '{"user":"ada"}'`;
  a mutation writes real data, so it needs `--write`. An endpoint too:
  `hozu call api.who --input '{"room":"a"}' --header 'Authorization: Bearer t'` (a POST needs `--write`).
- **Drive the app in a real browser, still without a server:**
  `hozu browse / --session '{"user":"ada"}' --do 'fill New note=Milk' --do 'press Enter' --do 'click Pin in "Milk"'`.
  - `--js both` (the default) runs every step with JS and with JS switched off; submit with `press Enter` or
    `submit "<form>"` so one step list drives both.
  - Steps: `fill <label>=<value>`, `select <label>=<option>`, `check` / `uncheck <label>`, `click <name>`,
    `submit "<form>"`, `press <key>`, `wait <ms>`, `goto <path>`, `post <path> a=1&b=2`,
    `remember <name> from url|<selector> [@attr]` (later steps read `$name`); a target may end with `in "<text>"`.
  - Labels are what `hozu get <page> --forms` lists; a missing one prints `Did you mean "…"?`. One `--do` may hold
    several steps: `--do 'fill Title=Milk; press Enter'`.
- **Other users, other pages, after a reload, after sign-out:** verify any such statement once, in one `browse`
  chain with `--js both`. `--as <name>` starts an actor with its own browser; all actors share one app.
- **The output** is per step only the lines added (`+`) or removed (`−`). A passing six-step run stays under 1.5 KB.
  Exit code 1 when a step failed, the modes differ or an error was printed.
- In code: `const page = await testApp(app).get('/')` from `@hozu/testing` → `{ status, headers, html, text, payload }`.
- A build with errors renders nothing: run `hozu check`.

<!-- more -->

- **`hozu get`** prints the status, redirect, `set-cookie` attributes (`HttpOnly`, `SameSite`), title, alerts and
  visible text.
  - `--forms` lists each form: fields with their defaults, checkbox / radio groups with every value (checked ones
    marked ✓), controls that join through `form=` (marked `(form=)`), and submit buttons with their name and value.
  - It needs no browser.
- **`hozu call`** runs the effect through the app's own handler and prints the value or the declared error. With
  `--write`, a mutation also prints the tags it invalidated and the queries they refresh. `runs: 'browser'` effects
  need `hozu browse`.
- **`hozu browse`:**
  - It uses the installed Chrome / Chromium / Edge (`HOZU_CHROME=/path` to choose); without one it is a config
    error. The app runs in-process, exactly as `npm start` serves it.
  - `--js both` runs both modes in the same Chrome, side by side. Use `--js on` or `--js off` for one mode.
  - Steps in detail: a second fill of a repeated name fills the next field; `check` / `uncheck` set the state;
    `click <name>` on a submit button posts with its name and value; `submit "<form>"` takes a form's `aria-label` or
    its submit button text. Labels and names are what a user reads (aria-label, `<label>`, placeholder, button text,
    `title`), or a field's `name`.
  - `in "<text>"` picks the smallest list item, table row or form containing that text
    (`click Delete in "Buy milk"`).
  - A step with no native effect prints `js-only (<reason>)` in the off column, e.g. a `type=button` button.
- **Actors:** the steps after an `--as <name>` are that actor's, and a later `--as <name>` switches back. `--session`
  right after an `--as` signs that actor in. All actors share one data store and one session store, so what ada
  writes is what bob reads.
  - Signing out and in again inside one actor's chain also works (`click Sign out`, `fill Name=bob`, `press Enter`).
  - `hozu browse /notes --as ada --session '{"user":"ada"}' --as bob --session '{"user":"bob"}' --as ada --do 'click Share in "Milk"' --as bob --do 'goto /inbox'`
  - `--header 'Name: value'` adds a header to every request: before the first `--as` for every actor, after an
    `--as` for that actor.
  - **Another visitor's data:** `--as ada --do 'remember note from li a @href' --as bob --do 'goto $note'` (bob's page
    should answer 403), or `--as bob --do 'post /notes/n1 text=x'`: a forged native post, as bob, without the page.
    Each mode keeps its own remembered values.
- **The output** is small on purpose: lines print once when both modes agree and per mode where they differ; a
  navigation prints `→ <path>` and the new page's lines; a live update on another actor's page prints under the step
  (`bob: + Milk`).
  - `≠ DIFFERS` marks a step where both modes made a request and the resulting text differs: a no-JS/JS parity bug.
  - Errors: uncaught exceptions, `console.error`s, CSP violations and failed requests, each with the page, the
    resource type and the mode. A 400 re-render of an invalid native post is not an error, and a page answering
    401, 403, 404 or 410 is the step's status (`→ /notes/n1 (403)`), so an access check exits 0.
  - To forge a post, take the form's `action` from `hozu get <page> --forms` or `remember … @action` on a page the
    server rendered (`goto` it first): forms the client renders after a change carry no `action`.
  - Exit code 1 also when a client component failed. `--json` has every line; `--full` prints them all;
    `--select <css>`, `--screenshot shot.png` and `--reduced-motion` as before.
  - It also prints the client components on the page (mounted, failed, size, canvases).
- **`testApp`:** `app` is the default export of `app.ts`; `.post(path, fields)` submits a native form, with fields as
  a record or as `[name, value]` pairs for repeated names. `testApp(app, { session: store })` may swap only the
  session store (a test issuer). `testApp` reads no env files: pass `testApp(app, { env: process.env })` (or a record)
  for the variables your resolvers need; `hozu get`, `call` and `browse` read `env.files` themselves.
- `hozu get`, `hozu browse` and `testApp` build the app module; a build with errors exits 1 (throws).
- Vitest: add `hozuTransform()` from `@hozu/transform/vite` to `plugins`.
- Browser tests: wait for `html[data-hozu-ready]` (set after hydration) before clicking.
- A person checks the result with `npm run dev` (`hozu dev`: reloads and Hozu DevTools); what they ask for from
  there arrives as requests (`hozu docs requests`). The tools above stay the way you verify.
