# Testing

- **Read a page without a server:** `hozu get /path --select 'button[aria-pressed=true]' --forms`.
  - It prints the status, redirect, `set-cookie` attributes (`HttpOnly`, `SameSite`), title, alerts and visible text.
  - `--forms` lists each form: fields with their defaults, checkbox / radio groups with every value (checked ones
    marked ✓), controls that join through `form=` (marked `(form=)`), and submit buttons with their name and value.
  - Endpoints: `hozu get '/api/items?x=1'`. It needs no browser.
- **Drive the app in a real browser, still without a server:**
  `hozu browse / --session '{"user":"ada"}' --do 'fill New note=Milk' --do 'press Enter' --do 'click Pin in "Milk"'`.
  - It uses the installed Chrome / Chromium / Edge (`HOZU_CHROME=/path` to choose); without one it is a config
    error. The app runs in-process, exactly as `npm start` serves it.
  - `--js both` (the default) runs every step with JS and with JS switched off in the same Chrome, side by side. Use
    `--js on` or `--js off` for one mode.
  - Steps: `fill <label>=<value>` (a second fill of a repeated name fills the next field), `select <label>=<option>`,
    `check <label>` / `uncheck <label>` (set the state), `click <name>` (a submit button posts with its name and
    value), `submit "<form>"` (a form's `aria-label` or its submit button text), `press <key>`, `wait <ms>`,
    `goto <path>`. Labels and names are what a user reads (aria-label, `<label>`, placeholder, button text,
    `title`), or a field's `name`.
  - A target may end with `in "<text>"`: the smallest list item, table row or form containing that text
    (`click Delete in "Buy milk"`).
  - To drive both modes with one step list, submit with `press Enter` or `submit "<form>"`. A step with no native
    effect prints `js-only (<reason>)` in the off column, e.g. a `type=button` button.
- **Other users, other pages, after a reload, after sign-out:** verify any such statement once, in one `browse`
  chain with `--js both`.
  - `--as <name>` starts an actor with its own browser; the steps after it are that actor's, and a later
    `--as <name>` switches back. `--session` right after an `--as` signs that actor in. All actors share one app
    (one data store, one session store), so what ada writes is what bob reads.
  - Signing out and in again inside one actor's chain also works (`click Sign out`, `fill Name=bob`, `press Enter`).
  - `hozu browse /notes --as ada --session '{"user":"ada"}' --as bob --session '{"user":"bob"}' --as ada --do 'click Share in "Milk"' --as bob --do 'goto /inbox'`
- **The output** is small on purpose: per step, only the lines it added (`+`) or removed (`−`), once when both modes
  agree and per mode where they differ; a navigation prints `→ <path>` and the new page's lines; a live update on
  another actor's page prints under the step (`bob: + Milk`). A passing six-step run stays under 1.5 KB.
  - `≠ DIFFERS` marks a step where both modes made a request and the resulting text differs: a no-JS/JS parity bug.
  - Errors: uncaught exceptions, `console.error`s, CSP violations and failed requests, each with the page, the
    resource type and the mode. A 400 re-render of an invalid native post is not an error.
  - Exit code 1 when a step failed, the modes differ, a widget failed or any error was printed. `--json` has every
    line; `--full` prints them all; `--select <css>`, `--screenshot shot.png` and `--reduced-motion` as before.
  - It also prints the widgets on the page (mounted, failed, size, canvases).
- In code: `const page = await testApp(app).get('/')` from `@hozu/testing`, with `app` the default export of
  `app.ts` → `{ status, headers, html, text, payload }`; `.post(path, fields)` submits a native form, with fields as
  a record or as `[name, value]` pairs for repeated names. `testApp(app, { session: store })` may swap only the
  session store (a test issuer).
- `hozu get`, `hozu browse` and `testApp` build the app module; a build with errors exits 1 (throws) and renders
  nothing: run `hozu check`.
- Vitest: add `hozuTransform()` from `@hozu/transform/vite` to `plugins`.
- Browser tests: wait for `html[data-hozu-ready]` (set after hydration) before clicking.
