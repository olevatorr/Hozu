# Testing

- **Read a page without a server:** `hozu get /path --select 'button[aria-pressed=true]' --forms` (status, title,
  visible text; `--forms` lists each form's fields and submit buttons). Endpoints: `hozu get '/api/items?x=1'`.
- **Try one query or mutation without a page:** `hozu call notes.listNotes --input '{}' --session '{"user":"ada"}'`;
  a mutation writes real data, so it needs `--write`. An endpoint too:
  `hozu call api.who --input '{"room":"a"}' --header 'Authorization: Bearer t'` (a POST needs `--write`).
- **Drive the app in a real browser, still without a server:**
  `hozu browse / --session '{"user":"ada"}' --do 'fill New note=Milk' --do 'press Enter' --do 'click Pin in "Milk"'`.
  - Steps: `fill <label>=<value>` (`\n`, `\t` work), `select <label>=<option>`, `check` / `uncheck <label>`,
    `click <name>`, `submit "<form>"`, `press <key>`, `wait <ms>`, `goto <path>`, `post <path> a=1&b=2`,
    `remember <name> from url|<selector> [@attr]` (later steps read `$name`); a target may end with `in "<text>"`
    (for fill and select, before or after `=value`).
  - Labels are what `hozu get <page> --forms` lists; a missing one prints `Did you mean "…"?`. One `--do` may hold
    several steps: `--do 'fill Title=Milk; press Enter'`.
- **Other users, other pages, after a reload, after sign-out:** verify any such statement once, in one `browse`
  chain. `--as <name>` starts an actor with its own browser; all actors share one app.
  - A stale form (sent after the data changed elsewhere): `--do 'remember save from form:has([name=title]) @action'`,
    change the data as another `--as`, then `--do 'post $save title=x'`. No server and no curl needed.
- **The output** is per step only the lines added (`+`) or removed (`−`). A passing six-step run stays under 1.5 KB.
  Exit code 1 when a step failed, the modes differ or an error was printed.
- **A step that reloads the page** with JS on says `the page reloaded` (a form that should update in place);
  `--full` adds `N elements replaced` (a region drawn again), `--json` has both as `document` / `replaced`.
- **A pending state:** `--do 'hold notes.addNote'` keeps that mutation back (server- or browser-run); the next steps
  (and `--screenshot`) see the busy UI; `--do 'release'` lets it finish.
- `browse` runs the `npm start` app: what only `hozu dev` does (reload on edits, DevTools) is not in it.
- In code: `const page = await testApp(app).get('/')` from `@hozu/testing` → `{ status, headers, html, text, payload }`.
- A build with errors renders nothing: run `hozu check`.

<!-- more -->

- `press Mod+s` (with `Mod`, `Ctrl`, `Meta`, `Alt`, `Shift`) presses the control whose `keys` match, as a person would, and says where focus is (`focused <input name="q"> "Search"`, `focus stays on …`, `focus left …`) and when no control, or only hidden ones, have the key; with `--js off` it reports that a shortcut needs JavaScript.
- **Server errors:** what the app's `onError` receives (a resolver that threw, an invalid input) is listed under the
  step or the `get` request that caused it, `server error: <message> (<feature.effect>)`; `--json` `serverErrors`.
- **A calm page:** a step that rebuilds elements unchanged says `N elements rebuilt unchanged (a flash: main > form >
  button[type=submit])`, naming up to five (`--json` `flashes.elements` has all; a control hidden while busy: disable
  it instead). Equal means tag, class, text, `name`, `id`, `href`, `src`, `type` and parent path; a node that moved is
  no flash. Inside a list whose rows changed keys, a flash may be a new row whose child equals the removed row's at
  that place (browse does not see keys): check the keys before changing the view. Layout that moves without input says
  `layout shift X`. Both are problems to fix; a calm step prints neither. An address changed with `replace` stays `in place`.
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
  - `--js off` runs the steps with JS switched off, `--js both` side by side: for a page that must work without it.
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
    It names the differing words (`≠ DIFFERS (on vs off): "#1307" vs "#1306"`): the two modes write twice to the same
    data, so a new row per mode (an order number, a count) differs without a bug.
  - Errors: uncaught exceptions, `console.error`s, CSP violations and failed requests, each with the page, the
    resource type and the mode. A 400 re-render of an invalid native post is not an error, and a page answering
    401, 403, 404 or 410 is the step's status (`→ /notes/n1 (403)`), so an access check exits 0.
  - To forge a post, take the form's `action` from `hozu get <page> --forms` or `remember … @action` on a page the
    server rendered (`goto` it first): forms the client renders after a change carry no `action`.
  - Exit code 1 also when a client component failed. `--json` has every line; `--full` prints them all;
    `--select <css>`, `--screenshot shot.png` (after the steps), `--viewport 390x844` (a phone; default 1280x800) and
    `--reduced-motion`.
  - It also prints the client components on the page (mounted, failed, size, canvases).
- **More checks in a step:**
  - A click that would land on another element fails the step: `the click would land on <h3>, which contains it, above
    <a href="/x">: a person cannot click it` (an overlay, a card covering its link).
  - A navigation shows how it arrived: `→ /x (loaded, 32 ms)`; with `--js both`, per mode. Browse always shows
    `loaded`: Chrome turns prerendering off under DevTools request interception, so this is the worst case.
  - `--select` prints each element's `class` too. An element moved to another parent is not a flash.
- A server error that `get` or `browse` lists is noted once with `a production server shows "Internal error" here`:
  the visitor sees that text and the call id; `onError` gets the message.
- **`testApp`:** `app` is the default export of `app.ts`; `.post(path, fields)` submits a native form, with fields as
  a record or as `[name, value]` pairs for repeated names. `testApp(app, { session: store })` may swap only the
  session store (a test issuer). `testApp` reads no env files: pass `testApp(app, { env: process.env })` (or a record)
  for the variables your resolvers need; `hozu get`, `call` and `browse` read `env.files` themselves.
- `hozu get`, `hozu browse` and `testApp` build the app module; a build with errors exits 1 (throws).
- Vitest: add `hozuTransform()` from `@hozu/transform/vite` to `plugins`.
- Browser tests: wait for `html[data-hozu-ready]` (set after hydration) before clicking.
- A person checks the result with `npm run dev` (`hozu dev`: reloads and Hozu DevTools); what they ask for from
  there arrives as requests (`hozu docs requests`). The tools above stay the way you verify.
