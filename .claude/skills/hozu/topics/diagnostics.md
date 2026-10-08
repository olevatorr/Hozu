# Hozu diagnostics

Every diagnostic carries `file:line`, a cause and a fix, and often a snippet or patch. Apply the fix; do not work
around the rule. `npx hozu docs HZ083` prints one code: its cause, its fix and the topic to read.

- Errors fail `hozu check`. Warnings (HZ010, HZ019, HZ025, HZ036, HZ056, HZ058, HZ061, HZ062, HZ063, HZ075, HZ076, HZ077, HZ080, HZ083, HZ084, HZ086, HZ087, HZ089, HZ090) do not, but each one names something to decide.
- A warning you keep on purpose goes in `project({ accept: [{ code, at, reason }] })`; errors cannot be accepted.

<!-- more -->

| Code | Meaning | Usual fix |
| --- | --- | --- |
| HZ001 | state unreachable | add a transition to it or delete it |
| HZ002 | event handled nowhere | handle it in a state or remove it |
| HZ003 | unknown effect, reference, route or state name; `'previous'` with nothing to return to; `given.previous` naming a state with `invoke`; a `current()` param the route lacks | export it from a module the feature lists in `declarations`, register it, or fix the name (the patch suggests one) |
| HZ004 | a declared error is not handled | add every `failed` key, plus `Unexpected`, in `invoke` and `ui.query` |
| HZ005 | a node sends an event in a state (without `invoke`) that does not handle it | handle it there (`machine({ on })` handles it in every state), show the node only in the states that handle it (`is([...]) && …`), or `ignore: [Event]` to drop it |
| HZ006 | crossing a feature boundary | import the feature and use its `exports` |
| HZ007 | unknown effect, reference, route or state name; `'previous'` with nothing to return to; `given.previous` naming a state with `invoke`; a `current()` param the route lacks | export it from a module the feature lists in `declarations`, register it, or fix the name (the patch suggests one) |
| HZ008 | a path does not exist in the schema | fix the property name |
| HZ009 | a guardless transition shadows later ones | put guarded transitions first |
| HZ010 (warning) | a state has no way out (not final; no `on`, `invoke` or `after`) | mark it `final: true` or add a transition out of it |
| HZ011 | building twice gave different IR | keep time, randomness and mutable state out of builder callbacks |
| HZ012 | a schema from another library than the project's adapter | write it with the project's schema library (`project({ schema })`) |
| HZ013 | a declaration registered twice: a second machine (or messages) in a feature, or a name another feature already declares | keep one; reach the other feature through `imports` and its `exports` |
| HZ014 | wrong builder output, or a method called on data (`.map`, `.toUpperCase()`) | follow the builder signature; lists: `ui.each`; computation: a `fn()` |
| HZ015 | a contract fails / contract data does not match its schema | fix the machine or the contract (decide the intended behaviour first) |
| HZ016 | a transition that decides (guard, `navigate`, a `fn`, comparison or `+ - ?? ?: .length .includes` in a value) has no contract | add the contract from the snippet |
| HZ017 | a contract fails / contract data does not match its schema | fix the machine or the contract (decide the intended behaviour first) |
| HZ018 | a deciding transition changed (fields first, then `was:` / `now:`) and no covering contract fails against the old behaviour | change or add a contract that specifies the new behaviour; renaming or copying one does not count |
| HZ019 (warning) | `invalidates` or `refresh` names a tag no query carries (or, for `refresh`, only server-cached ones) | tag the affected query, or remove the invalidation; a refreshed query reads with `freshness: 'request'` |
| HZ020 | user-scoped data, but the project declares no session | declare `project({ session })`, or make the query public |
| HZ021 | a query, mutation or endpoint without a resolver | `implement(...)` it in the resolvers of `app.ts` |
| HZ022 | user data in a cacheable region | keep `scope: 'user'` queries out of cached pages |
| HZ023 | a page's `assert` does not hold for its derived render plan | change the data's scope or freshness, or the assertion |
| HZ024 | route params mismatch (keys, or a schema that does not fit `:x?`/`:x+`/`:x*`) / page with params but no `entries` (a user-scoped head is private: no sitemap, no warning) | align them / add `entries` |
| HZ025 (warning) | route params mismatch (keys, or a schema that does not fit `:x?`/`:x+`/`:x*`) / page with params but no `entries` (a user-scoped head is private: no sitemap, no warning) | align them / add `entries` |
| HZ026 | a class produces no CSS | fix the Tailwind class |
| HZ027 | a DOM field used outside an event, or wrong for this event | read `ui.dom.*` only in `ui.send` payloads |
| HZ028 | `img` without width/height | add both |
| HZ029 | a client component's module is missing, or a handler for an event it does not emit | create the module (`hozu add component … --client`); handle declared `emits` only |
| HZ030 | `ui.html` of untrusted data | render text instead |
| HZ031 | a literal not allowed by its schema | use an allowed value (the patch suggests one) |
| HZ032 | internal link or form action written as a string | `ui.link(route, params)` / `ui.link(endpoint)` |
| HZ033 | DOM text into an enum, number or boolean field | a `<select>`, radios or submit buttons with enum values; in a form, a flag through `ui.dom.formAll` and numbers parsed in the mutation input |
| HZ034 | a state both handles and ignores an event | remove it from one of the two |
| HZ035 | search schema is not a flat object of scalars with defaults | `z.object({ key: scalar.default(…) })` |
| HZ036 (warning) | a form submitted before the page has loaded is lost: its payload reads DOM values other than its named fields | read its values with `ui.dom.form('name')` / `ui.dom.formAll('name')` |
| HZ037 | a redirect is not a path, hides a page or another redirect, or targets an unknown route | change or remove the `from` key; point `to` at `ui.link(...)` |
| HZ038 | `http.headers` sets a header the framework owns, or an invalid name/value | remove it (`cache-control` is derived; CSP is `app({ csp })`) |
| HZ039 | `basePath` is not `''` or `/segment[/segment…]` | e.g. `'/shop'`, no trailing slash |
| HZ040 | a locale lacks a message, or uses other `{placeholders}` | add/translate the key in that locale |
| HZ041 | a machine uses a message, `ui.format`, `locale` or the env | store a code in context; choose the message in the view |
| HZ042 | `site.locales` empty / missing `site.lang` / not a canonical tag, or `ui.alternate` of an undeclared locale | fix the list (`'zh-TW'`, not `'zh_tw'`) |
| HZ043 | `site.offline` has params, no page, or per-request data | point it at a static page, or remove `offline` |
| HZ044 | a feature file was loaded without the Hozu transform | run node with `--import @hozu/transform/register` (`npm start` does), or add `hozuTransform()` to Vite / Vitest |
| HZ045 | no `project({ app })`, its default export is not `app(…)`, or views use client components (or a feature has `fetch.ts`) and `app()` has no bundle | `export default app({ resolvers, components: bundleComponents })` |
| HZ046 | an endpoint path is reserved, has params or collides; an error without a status, or with one an endpoint error cannot answer; a form posting to it with another method or an undeclared field | a static path such as `/api/…` (patch); map every error in `failed` to 400, 401, 403, 404, 409, 410, 422 or 429 |
| HZ047 | a `fn` body uses an imported name or `let` state (it is sent to the browser as source) | pass the value as input, or write it as a `const` helper in the module |
| HZ048 | `seed` names a field the context lacks, has no machine or route, or two views on one page seed a machine | seed top-level context fields, on one view per page |
| HZ049 | a `scope: 'user'` query is cached (`'static'`, `revalidate`, `swr`) | `freshness: 'request'` (patch), `'live'` for push, or `{ poll: s }` for a timer |
| HZ050 | a `'live'` query has no tags | add the tags its writers invalidate, or use `'request'` |
| HZ051 | `head.failed` misses a declared error of the head query, or maps another one | choose per error: a route (303), `403`, `404` or `410` (an intent decision: no patch) |
| HZ052 | a route that no page renders | link to the endpoint with `ui.link(endpoint, input)` (patch), or add its `ui.page` |
| HZ053 | (runtime) an endpoint answered `text/html`: a 500 | make it a `ui.page`; statuses and redirects go through `head.failed` |
| HZ054 | `ui.dom.form` reads one value of a list field or of a repeated name | `ui.dom.formAll('name')` (patch) |
| HZ055 | a form read names no control of the form | the name it suggests (patch), or add the control |
| HZ056 (warning) | a submit button also sends on click | `name`/`value` on the button, read in submit; or `type: 'button'` |
| HZ057 | `hozu.lock.json` differs from the computed lock (new, removed or copy-only changes, contract maps, a missing or 0.7 file) | if intended, `hozu check --update-lock`, then list the accepted `now:` lines in your summary |
| HZ058 (warning) | contracts that fire only copy-only transitions and evaluate no guard | none needed: the lock entries it names review those transitions |
| HZ059 | data reached plain JavaScript: a plain helper, a global (`Boolean`, `Object.keys`, `String`…), `typeof`, an array spread or `in` (an object spread such as `{ ...search, x }` is lowered) | make the helper a `part()`; for a global use an operator or a `fn()` |
| HZ060 | a page route starts with a locale segment (`/de/…` under `site.locales`) | rename the route (patch); the locale prefix is added for you |
| HZ061 (warning) | a form-fed event payload declares limits | move them to the mutation input |
| HZ062 (warning) | a GET endpoint declares `invalidates` | `method: 'POST'`, or keep it on purpose (e-mail links) |
| HZ063 (warning) | as HZ055, in a form holding `ui.html`, a client component or another view | as HZ055 |
| HZ064 | two contracts with identical IR | remove one (patch) |
| HZ070 | a component's render references a declaration (event, query, route, message…) | pass a `Send` through `on`, an `Href` prop, text as a prop or slot |
| HZ071 | a variant from data | make it a prop, styled through an attribute (`aria-pressed:`, `data-[x=y]:`) |
| HZ072 | a caller's `class` sets a property the component owns | declare a variant; a one-off ends with `!` (snippet) |
| HZ073 | `!` inside a component / a leading `!x` | remove it (patch in the tv config, snippet in the render) / write `x!` (patch) |
| HZ074 | `!` inside a component / a leading `!x` | remove it (patch in the tv config, snippet in the render) / write `x!` (patch) |
| HZ075 (warning) | a caller's inherited class (colour, font) is hidden by an inner element | a variant, or style the inner element |
| HZ076 (warning) | a component owns a margin | remove it (patch); outer spacing is the caller's |
| HZ077 (warning) | `!` on a property the component does not own | remove the `!` (patch) |
| HZ078 | the kit's `tv.ts` config differs from the design system | `hozu add kit <id> --sync` |
| HZ079 | two classes of one element set the same property | the patch: a complementary toggle, or remove the one that never wins |
| HZ080 (warning) | a `part()` view inlined by two features | the snippet: the same `ui.component` in a kit |
| HZ081 | an effect's `runs` and `fetch.ts` disagree: no export, an extra one, a `'server'` effect in it, `'either'` with user data, a Node-only import | export the effect in `fetch.ts`, or `runs: 'server'` with a resolver (`hozu docs fetch`) |
| HZ082 | browser data where only the server can go (a page `head`, `entries`), or a browser mutation invalidating a server-cached tag | the patch: `runs: 'server'`; or `freshness: 'request'` on the cached query |
| HZ083 (warning) | fetch.ts calls an origin (an absolute URL in it) that the feature's `connect` does not list: the browser's CSP blocks it | add the origin to `feature({ connect })` (the fix lists the whole line); `{ env: 'NAME' }` for a URL from public env |
| HZ084 (warning) | a public env variable named like a secret (`SECRET`, `TOKEN`, `PASSWORD`, `PRIVATE`, `…_KEY`): public values reach the browser | move it to `env.server`; only a value made to be published (a publishable key) stays public, named `PUBLIC_…` |
| HZ085 | `env.internal` maps a name that is not a public variable, or to one that is not a server variable; or `site.url: { env }` names an undeclared variable | declare both: the public URL in `env.public`, the internal one in `env.server` |
| HZ086 (warning) | an env file listed in `env.files` exists and git does not ignore it | add it to `.gitignore`; commit `.env.example` (`npx hozu env --example`) instead |
| HZ087 (warning) | an entry of `project({ accept })` matches no warning, names an error, or has no reason | remove the entry when the warning is gone; fix an error instead of accepting it; give every entry a reason |
| HZ088 | a server-run `scope: 'user'` query or a server-run mutation without `access`, or an access rule that reads a field the output or session does not have | say who may run it: `access: 'signedIn'`, `{ owner: { row, session } }`, `{ allow: ({ session }) => … }`, or `'anyone'` |
| HZ089 (warning) | `access` on a public query or a browser-run effect, where the server cannot enforce it | remove it: a public query never sees the session, and a browser-run effect is guarded by the API it calls |
| HZ090 (warning) | `access: 'anyone'` on a `scope: 'user'` query: every visitor, signed in or not, may read it | say who may read it (`'signedIn'`, `{ owner: { row, session } }`), or accept the warning with a reason |
| HZ091 | a query with `owner` access returned rows the visitor does not own (reported at run time) | read only the visitor's rows in the resolver (filter by the session); production drops the extra rows and logs this |
| HZ092 | a preview in `project({ previews })` no longer fits the app: data off its query output schema, an error the query does not declare, a route without a page, or a component use that does not build | update the preview to the current schema, error, page or component (previews are for people: they never ship) |
| HZ093 | a `remote()` resolver that cannot answer: its generated contract is missing or stale, its secret is missing, undeclared in `env.server` or under 16 characters, or it lists an effect the browser runs or a non-JSON endpoint | run `hozu gen` and rebuild the service; set a 16+ character secret from `env.server`; implement browser-run effects in fetch.ts and non-JSON endpoints in TypeScript |
