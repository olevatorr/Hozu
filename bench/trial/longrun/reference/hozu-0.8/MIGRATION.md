# The Hozu reference at step 20, migrated to 0.8

`reference/hozu` + `hozu-steps/02…20.patch` (0.7), upgraded as a user would (trial 0021, task PH):
1. `hozu migrate 0.8` with the 0.7 tarballs installed: 0 lock entries stale under 0.7; 8 paths rewritten
   (`op.*` / motion-less `ui.if` → operators at 52 sites, `head.redirects` → `failed` ×3, user freshness
   `'static'` → `'request'` ×3, `form: 'bulk'` → `ui.formRef()`, `itemForm` / `editForm` / `languageSwitch` /
   `noteItem` → `part()`, `server.ts` → `app.ts`, `scripts.start` / `serve` → `hozu serve`); 10 lines printed to
   move by hand.
2. Dependencies switched to the 0.8 workspace packages (`link:`), `hozu migrate 0.8` again: the IR equals the 0.7 IR
   apart from the allowed mapping (the `noteItem` D2 site did not change the IR).
3. `hozu check`: 1 type error, 6 errors (HZ057 pages, HZ052 ×2, HZ032 ×3), then the hand changes below.
4. `hozu check --update-lock` (lock v1 → v2: account 10, notes 48 transitions, 8 `pages` entries), then
   `hozu check`: types ok, 0 errors, 2 HZ058 warnings (15 copy-only contracts kept: migrate never deletes one).

Acceptance at step 20: 64 / 64, as on 0.7.

## Hand changes
| Printed by | Change |
|---|---|
| migrate: `serve.ts` wraps the server (4 lines), `sessionCookie` dropped | `serve.ts` removed; `hozu serve` runs `app.ts`; the secret comes from `SESSION_SECRET` (the harness sets it) |
| migrate: a language in the session | `Session = { user }`; `site.locales: ['en', 'de']`; `ui.messages` `text` in each feature (account: sign-in / out, `Signed in as {name}`, the switch label; notes: heading, `Notes: {count}`, labels, the duplicate alert); the switch is `ui.a({ href: locale === 'en' ? ui.alternate('de') : ui.alternate('en') })`; removed the `texts` query, `TEXTS`, the `setLanguage` endpoint and the `<html lang>` rewrite |
| migrate: HTML from a resolver (HZ053); check: HZ052 `admin` | `/admin` is `ui.page(admin, { head: { query: accounts, failed: { Unauthorized: login, Forbidden: 403 } } })` with an `AdminBoard` view (`Not allowed` in the `Forbidden` branch); the `adminPage` endpoint is gone |
| migrate: a redirect Response | `landing` and `bulkNotes` are `output: 'redirect'` returning `redirect(ui.link(…))` (migrate printed only the shared `redirect` helper, not `bulkNotes`' own 303) |
| check: HZ052 `exportNotes`, HZ032 ×3 | the `exportNotes` route is removed; the link is `ui.link(exportAll, {})`; `exportAll` has an output schema and `errors: { Unauthorized }`, `failed: { Unauthorized: 401 }`; the bulk form's action is `ui.link(bulkNotes)` |
| check: HZ046 (`action` not in the bulk input) | `bulkNotes` input `{ action: 'delete' \| 'archive', ids: string[] }`; each checkbox is `name: 'ids', value: note.id` (was `name: note.id, value: 'selected'` into a record) |
| types: `Expr<string>` passed as a `string` part argument | `noteItem` reads `text.delete` itself instead of taking the label |
| check: HZ014 (a list as a query branch) | `AdminBoard`'s ready branch is one `div` |

Not changed although 0.8 has a better form (not printed): `store.of` creates a user's list on read (the scaffold's
`itemsOf` shape, in another module, so migrate does not see it); `selected` keeps `{ id }` objects (D5).
