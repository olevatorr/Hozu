# ADR 0060 — 0.18: what a backend engineer's app found

- **Status:** accepted (owner, 2026-10-05: "C 用選項1，A、B、E 都做，D 也做 … 全部都要併入0.18.0"; D: "他自己改成他想要的
  語系，我們給他cli或者讀取的檔案"; then "D 沒問題").
- **Source:** notes from an engineer building an app on 0.10.0 (2026-10-02 to 10-05). Each was checked on 0.17.2
  first:

  | Report | On 0.17.2 |
  |---|---|
  | a `?:` inside `navigate` was dropped silently | fixed: HZ014 at `hozu check`, but its fix does not say what to write (B) |
  | a 404 page's tab title read `null · WorldBook` | reproduced (A) |
  | DevTools speaks English only | true (D) |
  | a query cannot store a refreshed token in the session | by design: queries only read (C) |
  | `hozu browse` cannot take a screenshot | `--screenshot <file>` exists; no phone size, and `--do 'screenshot'` gives no hint (E) |

## A — a failed head query left `null` in the title
- **Problem:** when the head query fails (a mapped 404, 403, 410, or a redirect), the head fields were still
  evaluated with the query's value bound to `null`. `` title: `${story.title} · WorldBook` `` became
  `null · WorldBook`.
- **Options:** the site name as the title; "Not found · <site>" (English text on every site); a title per error in
  `head.failed` (new API).
- **Decision:** a failed head query evaluates no head field: the title is `site.name` (or the path without a site),
  with no description or image. The page's views still render the failure.

## B — HZ014 for a computed `navigate`
- **Decision:** the diagnostic for a `navigate` that does not return `ui.link(...)` names the cause (a condition
  inside `navigate`) and its fix is the guarded list:
  `done: [{ guard: () => cond, navigate: () => ui.link(a) }, { navigate: () => ui.link(b) }]`.

## C — refreshing the session while reading (owner: option 1)
- **Problem:** an access token expires; the app finds out while a query reads, but a query cannot write the session,
  so the engineer kept the newest token in server memory (lost on restart, wrong with several instances).
- **Options:**
  1. a framework-run `refreshSession` hook before resolvers;
  2. `setSession` in queries (breaks "queries only read", and a streamed page has sent its headers by then);
  3. documentation only.
- **Decision:** 1. `app({ refreshSession: (session, { env }) => next })`, where `next` is a new session value,
  `null` (sign out) or `undefined` (unchanged).
  - It runs once per request, when the request first reads the session and before any resolver sees it. Pages,
    queries, effects, endpoints and live streams all get the refreshed value, so no response has been sent yet.
  - The value is checked against the session schema. It is stored in place under the same id
    (`SessionStore.update(request, value)`), so the cookie does not change and parallel requests stay signed in.
    `memorySessions` and `kvSessions` implement `update`; a custom store without it is an error at startup.
  - Concurrent requests of one session share one call (per process), so a single-use refresh token is spent once.
  - A hook that throws leaves the session unchanged and reports through `onError`.
- **Principle 4:** queries still only read. Keeping the session valid is the framework's, like `navigate` and
  `after`: the app says how, the framework decides when.

## D — DevTools in the person's language
- **Options:** languages built into Hozu (each DevTools change must update all of them, in languages we cannot
  review); a file in `.hozu/` read by name (file-based magic, against principle 2); a file the person names.
- **Decision:** the person names a messages file.
  - `npx hozu devtools messages` prints every DevTools string as JSON (`{ "hozu": "<version>", "messages": {
    key: English } }`) to translate.
  - `hozu dev --devtools-messages <file>`, or `HOZU_DEVTOOLS_MESSAGES=<file>` in the shell for every project; the
    flag wins over the variable, the variable over English.
  - A missing key shows English; `hozu dev` prints how many keys are missing or unknown;
    `npx hozu devtools messages --check <file>` lists them.
  - Only the interface is translated. The request Markdown and the CLI stay English: agents read them, and the
    trials measure them.
  - `examples/studio` keeps a Traditional Chinese file as the reference and the test.

## E — `hozu browse` at a phone's size
- **Decision:** `--viewport <width>x<height>` (default `1280x800`; below 768 px wide it also emulates a mobile
  device). `--do 'screenshot …'` answers with the option to use, `--screenshot <file>`.
