# Hozu diagnostics

Every diagnostic carries `file:line`, a cause and a fix, and often a snippet or patch. Apply the fix; do not work
around the rule.

| Code | Meaning | Usual fix |
|---|---|---|
| HZ001 | state unreachable | add a transition to it or delete it |
| HZ002 | event handled nowhere | handle it in a state or remove it |
| HZ003 / HZ007 | unknown effect / reference | export it from a module the feature lists in `declarations`, or fix the name (the patch suggests one) |
| HZ004 | a declared error is not handled | add every `failed` key, plus `Unexpected`, in `invoke` and `ui.query` |
| HZ005 | a node sends an event in a state (without `invoke`) that does not handle it | `ignore: [Event]` in that state, or show the node only via `when` |
| HZ006 | crossing a feature boundary | import the feature and use its `exports` |
| HZ008 | a path does not exist in the schema | fix the property name |
| HZ009 | a guardless transition shadows later ones | put guarded transitions first |
| HZ014 | wrong builder output, or a method called on data (`.map`, `.toUpperCase()`) | follow the builder signature; lists: `ui.each`; computation: a `fn()` |
| HZ015 / HZ017 | a contract fails / contract data does not match its schema | fix the machine or the contract (decide the intended behaviour first) |
| HZ016 | a transition that decides (guard, `navigate`, `fn`) has no contract | add the contract from the snippet |
| HZ018 | behaviour changed; the message shows `was: … now: …` | decision: update its contract; copy-only transition: `--update-lock` if intended |
| HZ021 | a query or mutation without a resolver | `implement(...)` it in server.ts |
| HZ022 | user data in a cacheable region | keep `scope: 'user'` queries out of cached pages |
| HZ024 / HZ025 | route params mismatch (keys, or a schema that does not fit `:x?`/`:x+`/`:x*`) / page with params but no `entries` | align them / add `entries` |
| HZ026 | a class produces no CSS | fix the Tailwind class |
| HZ027 | a DOM field used outside an event, or wrong for this event | read `ui.dom.*` only in `ui.send` payloads |
| HZ028 | `img` without width/height | add both |
| HZ030 | `ui.html` of untrusted data | render text instead |
| HZ031 | a literal not allowed by its schema | use an allowed value (the patch suggests one) |
| HZ032 | internal link written as a string | `ui.link(route, params)` |
| HZ033 | DOM text into an enum, number or boolean field | a `<select>` with enum options / `valueAsNumber` / `checked` |
| HZ034 | a state both handles and ignores an event | remove it from one of the two |
| HZ035 | search schema is not a flat object of scalars with defaults | `z.object({ key: scalar.default(…) })` |
| HZ036 | (warning) a form needs JavaScript | read its values with `ui.dom.form('name')` |
| HZ037 | a redirect is not a path, hides a page or another redirect, or targets an unknown route | change or remove the `from` key; point `to` at `ui.link(...)` |
| HZ038 | `http.headers` sets a header the framework owns, or an invalid name/value | remove it (`cache-control` is derived; CSP is `createServer({ csp })`) |
| HZ039 | `basePath` is not `''` or `/segment[/segment…]` | e.g. `'/shop'`, no trailing slash |
| HZ040 | a locale lacks a message, or uses other `{placeholders}` | add/translate the key in that locale |
| HZ041 | a machine uses a message, `ui.format` or `locale` | store a code in context; choose the message in the view |
| HZ043 | `site.offline` has params, no page, or per-request data | point it at a static page, or remove `offline` |
| HZ044 | a feature file was loaded without the Hozu transform | run node with `--import @hozu/transform/register` (`npm start` does), or add `hozuTransform()` to Vite / Vitest |
| HZ045 | `serve.ts` misses the widget bundle or the session store | add `widgets: await bundleWidgets(build)` / `session: sessionCookie(…)` |
| HZ046 | an endpoint path is reserved, has params, or collides with a page, redirect or endpoint | use a static path such as `/api/…` (patch) |
| HZ047 | a `fn` body uses an imported name or `let` state (it is sent to the browser as source) | pass the value as input, or write it as a `const` helper in the module |
| HZ048 | `seed` names a field the context lacks, has no machine or route, or two views on one page seed a machine | seed top-level context fields, on one view per page |
| HZ049 | a `scope: 'user'` query is cached (`'static'`, `revalidate`, `swr`) | `freshness: 'request'` (patch), or `'live'` for push |
| HZ050 | a `'live'` query has no tags | add the tags its writers invalidate, or use `'request'` |
| HZ062 | (warning) a GET endpoint declares `invalidates` | `method: 'POST'`, or keep it on purpose (e-mail links) |
| HZ042 | `site.locales` empty / missing `site.lang` / not a canonical tag, or `ui.alternate` of an undeclared locale | fix the list (`'zh-TW'`, not `'zh_tw'`) |
